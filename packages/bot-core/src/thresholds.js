const { toBigInt } = require("./toBigInt");

function calcThresholds(loanIn, config, premiumBps = 5n) {
  const loan = toBigInt(loanIn);
  const bps = BigInt(premiumBps);
  const premium = (loan * bps) / 10000n;
  const debt = loan + premium;
  const minProfit =
    (loan * BigInt(config.minProfitBps)) / 10000n + premium;
  return { premium, debt, minProfit, premiumBps: bps };
}

module.exports = { calcThresholds };
