const fs = require("fs");
const { ethers } = require("ethers");
const { validateConfig } = require("./validateConfig");
const { createLogger } = require("./logger");
const { ResilientWsProvider } = require("./wsProvider");
const { scanOpportunities, parseLoanAmounts } = require("./arbFinder");
const {
  scanOpportunitiesV4,
  parseLoanAmountsForTriangles,
} = require("./arbFinderV4");
const {
  scanOpportunitiesV5,
  parseLoanAmountsForGraph,
} = require("./arbFinderV5");
const { createMempoolWatcher } = require("./mempoolWatcher");
const { tryPickFlashSource, encodeFlashParams } = require("./flashPicker");
const { scoreOpportunity, sortByNetProfit } = require("./opportunityMath");
const { estimateGasCostInLoanToken } = require("./gasOracle");
const { fetchAavePremiumBps } = require("./aavePremium");
const { createFlashbotsProvider, simulateAndSend } = require("./flashbotsSender");
const {
  createStats,
  recordOpportunity,
  touchBlock,
  snapshot,
} = require("./stats");
const { runPreflight } = require("./preflight");
const { startHealthServer } = require("./healthServer");
const { BlockRunner } = require("./blockRunner");
const { registerShutdown } = require("./shutdown");
const { registerLifecycle } = require("./lifecycle");
const {
  createContractState,
  refreshContractState,
} = require("./contractState");
const { createMetricsStore } = require("./metricsStore");
const { toBigInt } = require("./toBigInt");

function loadContract(config, provider, signer) {
  const artifact = JSON.parse(fs.readFileSync(config.artifactPath, "utf8"));
  return new ethers.Contract(config.contractAddress, artifact.abi, signer);
}

async function rescoreOpportunities(
  provider,
  config,
  opportunities,
  refineFinalOut
) {
  if (!refineFinalOut || opportunities.length === 0) return opportunities;

  const aavePremiumBps = await fetchAavePremiumBps(
    provider,
    config.addresses?.aavePool
  );
  const gasByAsset = new Map();
  const rescored = [];

  for (const opp of opportunities) {
    const pair = config.pairs?.find((p) => p.name === opp.pair);
    if (!pair) continue;

    const refined = await refineFinalOut(provider, opp, pair);
    const finalOut = refined != null ? refined : opp.finalOut;
    if (!finalOut) continue;

    const assetKey = pair.asset.toLowerCase();
    if (!gasByAsset.has(assetKey)) {
      gasByAsset.set(
        assetKey,
        await estimateGasCostInLoanToken(
          provider,
          config,
          pair.asset,
          pair.assetDecimals
        )
      );
    }

    const scored = scoreOpportunity({
      finalOut,
      loanIn: opp.loanAmount,
      gasCostLoanToken: gasByAsset.get(assetKey),
      config,
      premiumBps: aavePremiumBps,
    });
    if (!scored) continue;

    rescored.push({
      ...opp,
      finalOut: toBigInt(finalOut),
      estimatedProfit: scored.grossProfit,
      netProfit: scored.netProfit,
      gasCostLoanToken: scored.gasCostLoanToken,
      premiumBps: aavePremiumBps.toString(),
    });
  }

  return sortByNetProfit(rescored);
}

async function createBotRunner({
  config,
  buildPlanForOpportunity,
  extraValidateChecks = [],
  extraLogFields = {},
  refineOpportunityFinalOut = null,
}) {
  validateConfig(config, extraValidateChecks);

  const log = createLogger(config);
  const stats = createStats(config);
  const metricsStore = createMetricsStore(config);

  const version = config.version;
  const isV4 = version === "v4";
  const isV5 = version === "v5";

  // How often (in blocks) to log scan spread/diagnostics. Default every 10
  // blocks (~2 min) so details show up quickly; also emitted on the 1st block.
  const scanLogEvery =
    Number(config.scanLogEvery) > 0
      ? Number(config.scanLogEvery)
      : parseInt(process.env.SCAN_LOG_EVERY || "10", 10);

  const lifecycle = registerLifecycle({ log, metricsStore, version });

  log.info(
    {
      version,
      dryRun: config.dryRun,
      contract: config.contractAddress,
      loanSizes: config.loanSizesUsdc,
      multiBlockTargets: config.multiBlockTargets,
      useMempool: config.useMempool,
      metricsDb: config.metricsEnabled === false ? "disabled" : "sqlite",
      ...extraLogFields,
    },
    "bot starting"
  );

  const httpProvider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
  const signer = new ethers.Wallet(config.privateKey, httpProvider);
  const arb = loadContract(config, httpProvider, signer);

  const preflight = await runPreflight({
    httpProvider,
    signer,
    arbContract: arb,
    config,
    log,
  });

  const contractState = createContractState({ paused: preflight.paused });
  const ws = new ResilientWsProvider(config, log, { metricsStore });

  let pendingMempoolScan = false;

  const mempoolWatcher = createMempoolWatcher({
    config,
    log,
    onTrigger: (trigger) => {
      metricsStore.record("mempool_trigger", trigger);
      log.debug(trigger, "mempool swap trigger");
      pendingMempoolScan = true;
    },
  });

  await ws.connect();
  await mempoolWatcher.start(ws.getProvider());

  const flashbots = await createFlashbotsProvider(config, signer, httpProvider);

  const loanAmounts = isV5
    ? parseLoanAmountsForGraph(config)
    : isV4
      ? parseLoanAmountsForTriangles(config)
      : parseLoanAmounts(config, config.pairs);

  let healthServer = null;
  healthServer = startHealthServer({
    config,
    log,
    metricsStore,
    getStatus: () => ({
      ok: ws.getStatus().connected && !contractState.paused,
      version,
      dryRun: config.dryRun,
      ws: ws.getStatus(),
      contractPaused: contractState.paused,
      stats: snapshot(stats),
    }),
  });

  registerShutdown({
    log,
    onShutdown: (signal) => lifecycle.recordShutdown(signal),
    hooks: [
      async () => {
        if (healthServer) {
          await new Promise((resolve) => healthServer.close(resolve));
        }
      },
      async () => mempoolWatcher.stop(),
      async () => ws.disconnect(),
      async () => metricsStore.close(),
    ],
  });

  async function runScan(blockNumber, provider, block) {
    let opportunities;
    let scanDiagnostics = null;

    if (isV5) {
      opportunities = await scanOpportunitiesV5(provider, config, loanAmounts);
    } else if (isV4) {
      opportunities = await scanOpportunitiesV4(
        provider,
        config,
        config.triangles,
        loanAmounts
      );
    } else {
      const scan = await scanOpportunities(
        provider,
        config,
        config.pairs,
        loanAmounts
      );
      scanDiagnostics = scan.diagnostics;
      opportunities = await rescoreOpportunities(
        provider,
        config,
        scan.opportunities,
        refineOpportunityFinalOut
      );
    }

    // Periodically log the current spreads and exactly what is being compared
    // (pair / DEX direction / loan size), in addition to stats_snapshot. Fires
    // whether or not a profitable opportunity was found.
    if (
      scanDiagnostics &&
      scanDiagnostics.comparisons?.length &&
      (stats.blocksScanned === 1 || stats.blocksScanned % scanLogEvery === 0)
    ) {
      const summary = scanDiagnostics.comparisons
        .map((c) => `${c.pair} ${c.direction} ${c.spreadBps}bps`)
        .join(" | ");
      log.info(
        {
          blockNumber,
          comparisons: scanDiagnostics.comparisons,
          quotesSeen: scanDiagnostics.quotesSeen,
          summary,
        },
        "scan spread (pairs compared)"
      );
      metricsStore.record("scan_spread", {
        block: blockNumber,
        comparisons: scanDiagnostics.comparisons,
        quotesSeen: scanDiagnostics.quotesSeen,
        summary,
      });
    }

    if (opportunities.length === 0) {
      if (scanDiagnostics) {
        // No profitable round-trip this block. Periodically surface the closest
        // candidate so "0 opportunities" can be confirmed as a real (too small)
        // spread rather than silently broken/zero quotes.
        stats.skippedUnprofitable += scanDiagnostics.evaluated;
        const sample =
          stats.blocksScanned === 1 || stats.blocksScanned % scanLogEvery === 0;
        if (scanDiagnostics.quotesSeen === 0 && sample) {
          log.warn(
            { blockNumber, evaluated: scanDiagnostics.evaluated },
            "scan produced no quotes (check routers/multicall/RPC)"
          );
          metricsStore.record("scan_no_quotes", {
            block: blockNumber,
            evaluated: scanDiagnostics.evaluated,
          });
        } else if (sample) {
          const best = scanDiagnostics.best || {};
          log.info(
            {
              blockNumber,
              bestPair: best.pair,
              bestDirection: best.direction,
              shortfallBps: best.shortfallBps,
              quotesSeen: scanDiagnostics.quotesSeen,
              evaluated: scanDiagnostics.evaluated,
            },
            "scan diagnostics (no profitable opportunity)"
          );
          metricsStore.record("scan_diag", {
            block: blockNumber,
            bestPair: best.pair,
            bestDirection: best.direction,
            finalOut: best.finalOut,
            loan: best.loan,
            shortfallBps: best.shortfallBps,
            quotesSeen: scanDiagnostics.quotesSeen,
            evaluated: scanDiagnostics.evaluated,
          });
        }
      } else {
        log.debug({ blockNumber }, "no net-profitable opportunities");
      }
      return;
    }

    const best = opportunities[0];
    recordOpportunity(stats, best);
    metricsStore.record("opportunity", {
      block: blockNumber,
      pair: best.pair || best.triangle || best.cycleId,
      direction: best.direction,
      loanAmount: best.loanAmount.toString(),
      grossProfit: best.estimatedProfit.toString(),
      netProfit: best.netProfit.toString(),
    });

    log.info(
      {
        blockNumber,
        pair: best.pair || best.triangle || best.cycleId,
        direction: best.direction,
        loanAmount: best.loanAmount.toString(),
        grossProfit: best.estimatedProfit.toString(),
        netProfit: best.netProfit.toString(),
      },
      "opportunity found"
    );

    const plan = await buildPlanForOpportunity(provider, best, block);

    let flashParams = "0x";
    let flashSource = config.flashSource ?? 0;
    if (isV5) {
      const pick = best.flashPick || tryPickFlashSource(config, best);
      if (pick.error) {
        log.warn(
          { blockNumber, error: pick.error },
          "flash source invalid for opportunity, skip"
        );
        return;
      }
      flashSource = pick.source;
      flashParams = encodeFlashParams(pick.flashParams);
    }

    const runConfig = { ...config, flashSource };

    const metricsMeta = {
      pair: best.pair || best.triangle || best.cycleId,
      direction: best.direction,
      loanAmount: best.loanAmount.toString(),
      netProfit: best.netProfit.toString(),
      grossProfit: best.estimatedProfit.toString(),
    };

    const result = await simulateAndSend({
      config: runConfig,
      flashbotsProvider: flashbots,
      arbContract: arb,
      asset: isV5 || isV4 ? best.loanToken : best.asset,
      loanAmount: isV5 || isV4 ? undefined : best.loanAmount,
      plan,
      flashParams,
      signer,
      httpProvider,
      baseBlock: blockNumber,
      log,
      stats,
      metricsStore,
      metricsMeta,
    });

    if (result.ok) stats.bundlesSimulated += 1;
  }

  const runner = new BlockRunner(async (blockNumber) => {
    stats.blocksScanned += 1;
    touchBlock(stats, blockNumber);

    await refreshContractState(arb, contractState, blockNumber, 1);

    if (contractState.paused) {
      log.debug({ blockNumber }, "contract paused, skip");
      return;
    }

    const provider = ws.getProvider();
    const block = await provider.getBlock(blockNumber);

    try {
      if (pendingMempoolScan && (isV5 || isV4)) {
        pendingMempoolScan = false;
        log.debug({ blockNumber }, "mempool-triggered scan");
      }
      await runScan(blockNumber, provider, block);
    } catch (err) {
      stats.blockErrors += 1;
      metricsStore.record("block_error", {
        block: blockNumber,
        error: err.message,
      });
      log.error(
        { blockNumber, err: err.message, stack: err.stack },
        "block handler error"
      );
    }

    if (stats.blocksScanned % 50 === 0) {
      log.info({ stats: snapshot(stats) }, "periodic stats");
      metricsStore.record("stats_snapshot", snapshot(stats));
    }
  }, log);

  ws.onBlock((blockNumber) => runner.onBlock(blockNumber));
  log.info("block loop active");
}

module.exports = { createBotRunner };
