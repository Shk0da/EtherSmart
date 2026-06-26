function createStats(config) {
  return {
    version: config.version,
    startedAt: new Date().toISOString(),
    dryRun: config.dryRun,
    blocksScanned: 0,
    opportunitiesFound: 0,
    bundlesSimulated: 0,
    bundlesSubmitted: 0,
    bundlesIncluded: 0,
    simulationFailures: 0,
    blockErrors: 0,
    skippedUnprofitable: 0,
    lastBlock: 0,
    lastActivityAt: null,
    lastOpportunity: null,
    totalEstimatedProfit: 0n,
    totalNetProfit: 0n,
  };
}

function recordOpportunity(stats, opp) {
  stats.opportunitiesFound += 1;
  stats.totalEstimatedProfit += opp.estimatedProfit;
  stats.totalNetProfit += opp.netProfit || opp.estimatedProfit;
  stats.lastOpportunity = {
    pair: opp.pair,
    direction: opp.direction,
    loanAmount: opp.loanAmount.toString(),
    profit: opp.estimatedProfit.toString(),
    netProfit: (opp.netProfit || opp.estimatedProfit).toString(),
    at: new Date().toISOString(),
  };
  stats.lastActivityAt = stats.lastOpportunity.at;
}

function touchBlock(stats, blockNumber) {
  stats.lastBlock = blockNumber;
  stats.lastActivityAt = new Date().toISOString();
}

function snapshot(stats) {
  return {
    ...stats,
    totalEstimatedProfit: stats.totalEstimatedProfit.toString(),
    totalNetProfit: stats.totalNetProfit.toString(),
  };
}

module.exports = { createStats, recordOpportunity, touchBlock, snapshot };
