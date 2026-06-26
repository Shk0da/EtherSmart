const { findCycles } = require("./graphEngine");
const { quoteLegOut } = require("./arbFinderV4");
const { calcThresholds, parseLoanSizes } = require("./arbFinder");
const { estimateGasCostWei } = require("./gasOracle");
const { pickFlashSource, premiumBpsForSource } = require("./flashPicker");
const { ethers } = require("ethers");

function toBigInt(v) {
  if (typeof v === "bigint") return v;
  if (ethers.BigNumber.isBigNumber(v)) return BigInt(v.toString());
  return BigInt(v);
}

function parseLoanAmountsForGraph(config) {
  const sizes = parseLoanSizes(config);
  const token = config.graphLoanToken || config.graph?.loanToken;
  const decimals = config.graphAssetDecimals ?? 6;
  if (!token) return {};
  return {
    default: sizes.map((s) => ethers.utils.parseUnits(s, decimals)),
  };
}

async function quotePath(provider, config, edges, amountIn) {
  let amount = toBigInt(amountIn);
  for (const edge of edges) {
    amount = await quoteLegOut(provider, config, edge, amount);
    if (!amount) return 0n;
  }
  return amount;
}

/**
 * Graph-based cycle scan (3–4 hops) with net profit ranking.
 */
async function scanOpportunitiesV5(provider, config, loanAmounts) {
  const edges = config.graphEdges || [];
  const loanToken =
    config.graphLoanToken ||
    (config.graphRoutes && config.graphRoutes[0]?.loanToken);
  if (!loanToken || edges.length === 0) return [];

  const minSteps = config.graphMinSteps || 3;
  const maxSteps = config.graphMaxSteps || 4;
  const cycles = findCycles(edges, loanToken, minSteps, maxSteps);
  const seen = new Set();
  const uniqueCycles = cycles.filter((cycle) => {
    const key = cycle.map((e) => e.id).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const amounts = loanAmounts.default || loanAmounts[loanToken] || [];
  const gasCostWei = await estimateGasCostWei(provider, config);
  const opportunities = [];

  for (const cycle of uniqueCycles) {
    for (const rawLoan of amounts) {
      if (!rawLoan) continue;
      const loanIn = toBigInt(rawLoan);
      const finalOut = await quotePath(provider, config, cycle, loanIn);
      if (!finalOut) continue;

      const oppStub = { loanToken, loanAmount: loanIn };
      let premiumBps;
      try {
        premiumBps = pickFlashSource(config, oppStub).premiumBps;
      } catch {
        premiumBps = premiumBpsForSource(config.flashSource ?? 0);
      }

      const { debt, minProfit } = calcThresholds(loanIn, config, premiumBps);
      if (finalOut < debt + minProfit) continue;

      const grossProfit = finalOut - debt;
      const netProfit = grossProfit - gasCostWei;
      if (netProfit <= 0n) continue;

      opportunities.push({
        cycleId: cycle.map((e) => e.id).join("->"),
        loanToken,
        loanAmount: loanIn,
        legs: cycle,
        estimatedProfit: grossProfit,
        netProfit,
        gasCostWei,
        direction: cycle.map((e) => e.venue).join("->"),
        flashSource: config.flashSource ?? 0,
        premiumBps: premiumBps.toString(),
      });
    }
  }

  return opportunities.sort((a, b) => (a.netProfit > b.netProfit ? -1 : 1));
}

module.exports = {
  scanOpportunitiesV5,
  parseLoanAmountsForGraph,
  quotePath,
};
