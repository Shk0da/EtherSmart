const { ethers } = require("ethers");
const { batchGetAmountsOut } = require("./multicallPriceMonitor");
const { estimateGasCostInLoanToken } = require("./gasOracle");
const { fetchAavePremiumBps } = require("./aavePremium");
const { scoreOpportunity, sortByNetProfit } = require("./opportunityMath");
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

  for (let i = 0; i < leg2Meta.length; i++) {
    const finalOut = leg2Outs[i];
    if (!finalOut || finalOut === 0n) continue;

    const { pair, leg1Dex, leg2Dex, loanIn } = leg2Meta[i];
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

  return sortByNetProfit(opportunities);
}

module.exports = {
  scanOpportunities,
  parseLoanAmounts,
  parseLoanSizes,
  calcThresholds: require("./thresholds").calcThresholds,
};
