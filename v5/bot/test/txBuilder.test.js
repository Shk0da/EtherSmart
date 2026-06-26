const { describe, it } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { validateConfig } = require("@ethersmart/bot-core");
const { encodeStepData, applySlippage } = require("../src/txBuilder");
const { validateV5Config } = require("../src/validateChecks");
const { ADAPTER_V2 } = require("../src/adapters");

function baseConfig(overrides = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arb-v5-"));
  const artifactPath = path.join(tmp, "HonestFlashArbV5.json");
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
    logDir: tmp,
    version: "v5",
    graphEdges: [],
    graphLoanToken: "0xA0",
    ...overrides,
  };
}

describe("validateConfig v5", () => {
  it("passes", () => {
    assert.doesNotThrow(() => validateConfig(baseConfig()));
  });
});

describe("validateV5Config", () => {
  it("rejects empty graphEdges", () => {
    const cfg = baseConfig({ graphEdges: [] });
    assert.match(validateV5Config(cfg), /graphEdges/);
  });

  it("rejects FLASH_SOURCE=2 without pool", () => {
    const usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const dai = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
    const cfg = baseConfig({
      flashSource: 2,
      graphEdges: [{ id: "a", venue: "uni", tokenIn: usdc, tokenOut: dai }],
      addresses: { multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11" },
      uniV3FlashMeta: { token0: usdc, token1: dai },
      graphLoanToken: usdc,
    });
    assert.match(validateV5Config(cfg), /UNI_V3_FLASH_POOL/);
  });
});

describe("adapterForVenue", () => {
  const { adapterForVenue } = require("../src/txBuilder");
  it("maps uni to ADAPTER_V2", () => {
    assert.equal(adapterForVenue("uni"), ADAPTER_V2);
  });
});

describe("encodeStepData", () => {
  it("encodes curve leg", () => {
    const data = encodeStepData({
      venue: "curve",
      tokenIn: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      tokenOut: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      curveI: 1,
      curveJ: 0,
    });
    assert.ok(data.startsWith("0x"));
  });
});

describe("applySlippage", () => {
  it("applies bps", () => {
    assert.equal(applySlippage(10000n, 100), 9900n);
  });
});
