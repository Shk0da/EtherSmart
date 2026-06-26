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
const { createMempoolWatcher } = require("./mempoolWatcher");
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
const {
  createContractState,
  refreshContractState,
} = require("./contractState");
const { createMetricsStore } = require("./metricsStore");

function loadContract(config, provider, signer) {
  const artifact = JSON.parse(fs.readFileSync(config.artifactPath, "utf8"));
  return new ethers.Contract(config.contractAddress, artifact.abi, signer);
}

/**
 * @param {object} options
 * @param {object} options.config
 * @param {(provider, opportunity, block) => Promise<object>} options.buildPlanForOpportunity
 * @param {(config) => string[]} [options.extraValidateChecks]
 * @param {object} [options.extraLogFields]
 */
async function createBotRunner({
  config,
  buildPlanForOpportunity,
  extraValidateChecks = [],
  extraLogFields = {},
}) {
  validateConfig(config, extraValidateChecks);

  const log = createLogger(config);
  const stats = createStats(config);
  const metricsStore = createMetricsStore(config);

  log.info(
    {
      version: config.version,
      dryRun: config.dryRun,
      contract: config.contractAddress,
      loanSizes: config.loanSizesUsdc,
      multiBlockTargets: config.multiBlockTargets,
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
  const ws = new ResilientWsProvider(config, log);
  await ws.connect();
  await mempoolWatcher.start(ws.getProvider());

  const flashbots = await createFlashbotsProvider(config, signer, httpProvider);

  const isV4 = config.version === "v4";
  const loanAmounts = isV4
    ? parseLoanAmountsForTriangles(config)
    : parseLoanAmounts(config, config.pairs);

  const mempoolWatcher = createMempoolWatcher({
    config,
    log,
    onTrigger: (trigger) => {
      metricsStore.record("mempool_trigger", trigger);
      log.debug(trigger, "mempool swap trigger");
    },
  });

  let healthServer = null;
  healthServer = startHealthServer({
    config,
    log,
    metricsStore,
    getStatus: () => ({
      ok: ws.getStatus().connected && !contractState.paused,
      version: config.version,
      dryRun: config.dryRun,
      ws: ws.getStatus(),
      contractPaused: contractState.paused,
      stats: snapshot(stats),
    }),
  });

  registerShutdown({
    log,
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

  const runner = new BlockRunner(async (blockNumber) => {
    stats.blocksScanned += 1;
    touchBlock(stats, blockNumber);

    await refreshContractState(arb, contractState, blockNumber);

    if (contractState.paused) {
      log.debug({ blockNumber }, "contract paused, skip");
      return;
    }

    const provider = ws.getProvider();
    const block = await provider.getBlock(blockNumber);

    try {
      const opportunities = isV4
        ? await scanOpportunitiesV4(
            provider,
            config,
            config.triangles,
            loanAmounts
          )
        : await scanOpportunities(
            provider,
            config,
            config.pairs,
            loanAmounts
          );

      if (opportunities.length === 0) {
        log.debug({ blockNumber }, "no net-profitable opportunities");
        return;
      }

      const best = opportunities[0];
      recordOpportunity(stats, best);
      metricsStore.record("opportunity", {
        block: blockNumber,
        pair: best.pair || best.triangle,
        direction: best.direction,
        loanAmount: best.loanAmount.toString(),
        grossProfit: best.estimatedProfit.toString(),
        netProfit: best.netProfit.toString(),
      });

      log.info(
        {
          blockNumber,
          pair: best.pair || best.triangle,
          direction: best.direction,
          loanAmount: best.loanAmount.toString(),
          grossProfit: best.estimatedProfit.toString(),
          netProfit: best.netProfit.toString(),
        },
        "opportunity found"
      );

      const plan = await buildPlanForOpportunity(provider, best, block);

      const result = await simulateAndSend({
        config,
        flashbotsProvider: flashbots,
        arbContract: arb,
        asset: isV4 ? best.loanToken : best.asset,
        loanAmount: isV4 ? undefined : best.loanAmount,
        plan,
        signer,
        httpProvider,
        baseBlock: blockNumber,
        log,
        stats,
        metricsStore,
      });

      if (result.ok) stats.bundlesSimulated += 1;
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
