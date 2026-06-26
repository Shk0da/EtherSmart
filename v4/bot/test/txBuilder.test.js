const { describe, it } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { validateConfig } = require("@ethersmart/bot-core");
const {
  encodeLegData,
  legTypeForVenue,
  applySlippage,
} = require("../src/txBuilder");
const { LegType } = require("../src/legTypes");

function baseConfig(overrides = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arb-artifact-"));
  const artifactPath = path.join(tmp, "HonestFlashArbV4.json");
  fs.writeFileSync(artifactPath, "{}");
  return {
    wsUrl: "wss://example",
    rpcUrl: "https://example",
    privateKey: "0x" + "11".repeat(32),
    contractAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    chainId: 1,
    slippageBps: 50,
    minProfitBps: 10,
    multiBlockTargets: 1,
    artifactPath,
    addresses: {
      multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11",
      balancerPoolId:
        "0x96646936b91b6be07d7e27e47baae2af033e58dce4e8d2f5428e5a9e294aae38",
    },
    logDir: tmp,
    version: "v4",
    triangles: [{ name: "t", loanToken: "0xA0", assetDecimals: 6, legs: [] }],
    ...overrides,
  };
}

describe("validateConfig v4", () => {
  it("passes with valid v4 config", () => {
    assert.doesNotThrow(() => validateConfig(baseConfig()));
  });
});

describe("encodeLegData", () => {
  it("encodes V2 path", () => {
    const data = encodeLegData({
      venue: "uni",
      tokenIn: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      tokenOut: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    });
    assert.ok(data.startsWith("0x"));
  });

  it("encodes Curve indices and tokens", () => {
    const data = encodeLegData({
      venue: "curve",
      tokenIn: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      tokenOut: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      curveI: 1,
      curveJ: 0,
    });
    assert.ok(data.length > 10);
  });
});

describe("legTypeForVenue", () => {
  it("maps balancer to enum", () => {
    assert.equal(legTypeForVenue("balancer"), LegType.BALANCER);
  });
});

describe("applySlippage", () => {
  it("reduces amount by bps", () => {
    const out = applySlippage(10000n, 50);
    assert.equal(out, 9950n);
  });
});
