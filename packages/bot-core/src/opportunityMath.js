const { toBigInt } = require("./toBigInt");
const { calcThresholds } = require("./thresholds");

function scoreOpportunity({
  finalOut,
  loanIn,
  gasCostLoanToken,
  config,
  premiumBps = 5n,
}) {
  const out = toBigInt(finalOut);
  const loan = toBigInt(loanIn);
  const gas = toBigInt(gasCostLoanToken);
  if (!out || !loan) return null;

  const { debt, minProfit } = calcThresholds(loan, config, premiumBps);
  if (out < debt + minProfit) return null;

  const grossProfit = out - debt;
  const netProfit = grossProfit - gas;
  if (netProfit <= 0n) return null;

  return { grossProfit, netProfit, gasCostLoanToken: gas, debt, minProfit };
}

function sortByNetProfit(opportunities) {
  return opportunities.sort((a, b) => {
    if (a.netProfit > b.netProfit) return -1;
    if (a.netProfit < b.netProfit) return 1;
    return 0;
  });
}

module.exports = { scoreOpportunity, sortByNetProfit };
