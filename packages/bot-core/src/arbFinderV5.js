const { findCycles } = require("./graphEngine");
const { quoteLegOut } = require("./arbFinderV4");
const { parseLoanSizes } = require("./arbFinder");
const { estimateGasCostInLoanToken } = require("./gasOracle");
const { fetchAavePremiumBps } = require("./aavePremium");
const { tryPickFlashSource, premiumBpsForSource } = require("./flashPicker");
const { scoreOpportunity, sortByNetProfit } = require("./opportunityMath");
const { toBigInt } = require("./toBigInt");
const { ethers } = require("ethers");
const { calcThresholds } = require("./thresholds");

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
  const gasCostLoanToken = await estimateGasCostInLoanToken(
    provider,
    config,
    loanToken,
    config.graphAssetDecimals ?? 6
  );
  const defaultAavePremium = await fetchAavePremiumBps(
    provider,
    config.addresses?.aavePool
  );
  const opportunities = [];
  const diagnostics = {
    evaluated: 0,
    quotesSeen: 0,
    best: null,
    comparisons: [],
  };
  const byCycle = new Map();

  for (const cycle of uniqueCycles) {
    for (const rawLoan of amounts) {
      if (!rawLoan) continue;
      const loanIn = toBigInt(rawLoan);
      diagnostics.evaluated += 1;
      const finalOut = await quotePath(provider, config, cycle, loanIn);
      if (!finalOut) continue;
      diagnostics.quotesSeen += 1;

      const oppStub = { loanToken, loanAmount: loanIn };
      const pick = tryPickFlashSource(config, oppStub);
      if (pick.error) continue;

      const premiumBps =
        pick.source === 0
          ? defaultAavePremium
          : pick.premiumBps ?? premiumBpsForSource(pick.source);
      const { debt, minProfit } = calcThresholds(loanIn, config, premiumBps);
      const threshold = debt + minProfit;
      const shortfallBps =
        loanIn > 0n ? Number(((threshold - finalOut) * 10000n) / loanIn) : null;
      const spreadBps =
        loanIn > 0n ? Number(((finalOut - loanIn) * 10000n) / loanIn) : null;
      const cycleId = cycle.map((e) => e.id).join("->");
      const direction = cycle.map((e) => e.venue).join("->");

      const prevCycle = byCycle.get(cycleId);
      if (!prevCycle || spreadBps > prevCycle.spreadBps) {
        byCycle.set(cycleId, {
          pair: cycleId,
          direction,
          spreadBps,
          shortfallBps,
          loan: loanIn.toString(),
          finalOut: finalOut.toString(),
        });
      }
      if (
        diagnostics.best === null ||
        shortfallBps < diagnostics.best.shortfallBps
      ) {
        diagnostics.best = {
          pair: cycleId,
          direction,
          finalOut: finalOut.toString(),
          loan: loanIn.toString(),
          shortfallBps,
          spreadBps,
        };
      }

      const scored = scoreOpportunity({
        finalOut,
        loanIn,
        gasCostLoanToken,
        config,
        premiumBps,
      });
      if (!scored) continue;

      opportunities.push({
        cycleId,
        loanToken,
        loanAmount: loanIn,
        legs: cycle,
        finalOut,
        estimatedProfit: scored.grossProfit,
        netProfit: scored.netProfit,
        gasCostLoanToken: scored.gasCostLoanToken,
        direction,
        flashSource: pick.source,
        flashPick: pick,
        premiumBps: premiumBps.toString(),
      });
    }
  }

  diagnostics.comparisons = [...byCycle.values()].sort(
    (a, b) => b.spreadBps - a.spreadBps
  );

  return {
    opportunities: sortByNetProfit(opportunities),
    diagnostics,
  };
}

module.exports = {
  scanOpportunitiesV5,
  parseLoanAmountsForGraph,
  quotePath,
};
