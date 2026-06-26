const { describe, it } = require("node:test");
const assert = require("node:assert");
const { ethers } = require("ethers");
const { calcThresholds } = require("../src/thresholds");
const { scoreOpportunity } = require("../src/opportunityMath");

describe("calcThresholds BigNumber input", () => {
  it("accepts ethers BigNumber loan amounts", () => {
    const loanIn = ethers.utils.parseUnits("10000", 6);
    const { premium, debt } = calcThresholds(loanIn, { minProfitBps: 10 });
    assert.equal(premium, 5000000n);
    assert.equal(debt, 10005000000n);
  });
});

describe("scoreOpportunity gas units", () => {
  it("subtracts gas in loan-token atoms from gross profit", () => {
    const loanIn = 10_000_000_000n;
    const finalOut = loanIn + 50_000_000n;
    const scored = scoreOpportunity({
      finalOut,
      loanIn,
      gasCostLoanToken: 10_000_000n,
      config: { minProfitBps: 10 },
      premiumBps: 5n,
    });
    assert.ok(scored);
    assert.equal(scored.grossProfit, finalOut - (loanIn + 5000000n));
    assert.equal(scored.netProfit, scored.grossProfit - 10_000_000n);
  });

  it("rejects when gas exceeds gross in same units", () => {
    const scored = scoreOpportunity({
      finalOut: 10_010_000_000n,
      loanIn: 10_000_000_000n,
      gasCostLoanToken: 100_000_000n,
      config: { minProfitBps: 10 },
      premiumBps: 5n,
    });
    assert.equal(scored, null);
  });
});

describe("tryPickFlashSource", () => {
  it("returns error object on invalid Uni V3 flash config", () => {
    const { tryPickFlashSource } = require("../src/flashPicker");
    const result = tryPickFlashSource(
      { flashSource: 2 },
      { loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", loanAmount: 1000n }
    );
    assert.ok(result.error);
  });
});
