const { ethers } = require("ethers");
const { batchGetAmountsOut } = require("./multicallPriceMonitor");
const { estimateGasCostInLoanToken } = require("./gasOracle");
const { fetchAavePremiumBps } = require("./aavePremium");
const { scoreOpportunity, sortByNetProfit } = require("./opportunityMath");
const { calcThresholds } = require("./thresholds");
const { toBigInt } = require("./toBigInt");

function parseLoanSizes(config) {
  const raw =
    config.loanSizesUsdc ||
    process.env.LOAN_SIZES_USDC ||
    config.loanAmountUsdc ||
    "10000";
  const parts = String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : ["10000"];
}

function parseLoanAmounts(config, pairs) {
  const sizes = parseLoanSizes(config);
  const out = {};
  for (const pair of pairs) {
    out[pair.name] = sizes.map((size) =>
      ethers.utils.parseUnits(size, pair.assetDecimals)
    );
  }
  return out;
}

function dexRouter(config, dex) {
  return dex === "uni"
    ? config.addresses.uniV2Router
    : config.addresses.sushiRouter;
}

/**
 * Multi-size two-round multicall scan with gas-adjusted net profit ranking.
 */
async function scanOpportunities(provider, config, pairs, loanAmountsByPair) {
  const aavePremiumBps = await fetchAavePremiumBps(
    provider,
    config.addresses?.aavePool
  );
  const gasByAsset = new Map();

  async function gasFor(asset, decimals) {
    const key = asset.toLowerCase();
    if (!gasByAsset.has(key)) {
      gasByAsset.set(
        key,
        await estimateGasCostInLoanToken(provider, config, asset, decimals)
      );
    }
    return gasByAsset.get(key);
  }

  const leg1Requests = [];
  const leg1Meta = [];

  for (const pair of pairs) {
    const amounts = loanAmountsByPair[pair.name] || [];
    for (const loanIn of amounts) {
      if (!loanIn) continue;
      for (const leg1Dex of ["uni", "sushi"]) {
        leg1Requests.push({
          target: dexRouter(config, leg1Dex),
          amountIn: loanIn,
          path: [pair.asset, pair.bridge],
        });
        leg1Meta.push({ pair, leg1Dex, loanIn });
      }
    }
  }

  const leg1Outs = await batchGetAmountsOut(provider, config, leg1Requests);

  const leg2Requests = [];
  const leg2Meta = [];

  for (let i = 0; i < leg1Meta.length; i++) {
    const bridgeOut = leg1Outs[i];
    if (!bridgeOut || bridgeOut === 0n) continue;

    const { pair, leg1Dex, loanIn } = leg1Meta[i];
    for (const leg2Dex of ["uni", "sushi"]) {
      if (leg1Dex === leg2Dex) continue;

      leg2Requests.push({
        target: dexRouter(config, leg2Dex),
        amountIn: bridgeOut,
        path: [pair.bridge, pair.asset],
      });
      leg2Meta.push({ pair, leg1Dex, leg2Dex, loanIn, bridgeOut });
    }
  }

  const leg2Outs = await batchGetAmountsOut(provider, config, leg2Requests);
  const opportunities = [];

  const diagnostics = {
    evaluated: leg2Meta.length,
    quotesSeen: 0,
    best: null,
    comparisons: [],
  };
  // Best (max) round-trip spread per pair, so logs show exactly what is being
  // compared each block (which pair / direction / loan size won out).
  const byPair = new Map();

  for (let i = 0; i < leg2Meta.length; i++) {
    const finalOut = leg2Outs[i];
    const { pair, leg1Dex, leg2Dex, loanIn } = leg2Meta[i];

    if (!finalOut || finalOut === 0n) continue;
    diagnostics.quotesSeen += 1;

    // Track the candidate closest to (or furthest into) profit, even when it
    // does not clear the threshold. shortfallBps is measured against the loan:
    // negative means the round-trip would have been profitable.
    const out = toBigInt(finalOut);
    const loan = toBigInt(loanIn);
    const { debt, minProfit } = calcThresholds(loan, config, aavePremiumBps);
    const threshold = debt + minProfit;
    const shortfallBps =
      loan > 0n ? Number(((threshold - out) * 10000n) / loan) : null;
    // spreadBps = raw round-trip result vs loan (after DEX fees): negative means
    // the round-trip loses, positive means gross profit before gas/premium.
    const spreadBps =
      loan > 0n ? Number(((out - loan) * 10000n) / loan) : null;
    const direction = `${leg1Dex}->${leg2Dex}`;

    const prevPair = byPair.get(pair.name);
    if (!prevPair || spreadBps > prevPair.spreadBps) {
      byPair.set(pair.name, {
        pair: pair.name,
        direction,
        spreadBps,
        shortfallBps,
        loan: loan.toString(),
        finalOut: out.toString(),
      });
    }

    if (
      diagnostics.best === null ||
      shortfallBps < diagnostics.best.shortfallBps
    ) {
      diagnostics.best = {
        pair: pair.name,
        direction,
        finalOut: out.toString(),
        loan: loan.toString(),
        shortfallBps,
        spreadBps,
      };
    }

    const scored = scoreOpportunity({
      finalOut,
      loanIn,
      gasCostLoanToken: await gasFor(pair.asset, pair.assetDecimals),
      config,
      premiumBps: aavePremiumBps,
    });
    if (!scored) continue;

    opportunities.push({
      pair: pair.name,
      asset: pair.asset,
      bridge: pair.bridge,
      loanAmount: toBigInt(loanIn),
      leg1Dex,
      leg2Dex,
      finalOut: toBigInt(finalOut),
      estimatedProfit: scored.grossProfit,
      netProfit: scored.netProfit,
      gasCostLoanToken: scored.gasCostLoanToken,
      direction: `${leg1Dex}->${leg2Dex}`,
      premiumBps: aavePremiumBps.toString(),
    });
  }

  diagnostics.comparisons = [...byPair.values()].sort(
    (a, b) => b.spreadBps - a.spreadBps
  );

  const sorted = sortByNetProfit(opportunities);
  return { opportunities: sorted, diagnostics };
}

module.exports = {
  scanOpportunities,
  parseLoanAmounts,
  parseLoanSizes,
  calcThresholds: require("./thresholds").calcThresholds,
};
