const { describe, it } = require("node:test");
const assert = require("node:assert");
const { calcThresholds } = require("../src/arbFinder");
const {
  pickFlashSource,
  buildUniV3FlashAmounts,
  FlashSource,
  PREMIUM_BPS,
} = require("../src/flashPicker");

describe("calcThresholds premiumBps", () => {
  it("uses zero premium for Balancer flash", () => {
    const loanIn = 10000_000000n;
    const { premium, minProfit } = calcThresholds(loanIn, { minProfitBps: 10 }, 0n);
    assert.equal(premium, 0n);
    assert.equal(minProfit, 10000000n);
  });

  it("uses 5 bps default for Aave", () => {
    const loanIn = 10000_000000n;
    const { premium } = calcThresholds(loanIn, { minProfitBps: 10 });
    assert.equal(premium, 5000000n);
  });
});

describe("buildUniV3FlashAmounts", () => {
  it("places loan on token1 side", () => {
    const r = buildUniV3FlashAmounts(
      "0xB",
      1000n,
      "0xA",
      "0xB"
    );
    assert.equal(r.amount0, "0");
    assert.equal(r.amount1, "1000");
  });
});

describe("pickFlashSource", () => {
  it("returns Balancer zero premium", () => {
    const pick = pickFlashSource(
      { flashSource: FlashSource.BALANCER_VAULT },
      { loanToken: "0xA", loanAmount: 1000n }
    );
    assert.equal(pick.premiumBps, PREMIUM_BPS.BALANCER_VAULT);
  });
});
