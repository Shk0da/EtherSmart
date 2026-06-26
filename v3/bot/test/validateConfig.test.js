const { describe, it } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { validateConfig } = require("@ethersmart/bot-core");
const { encodeV3Path } = require("../src/v3Path");

function baseConfig(overrides = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arb-artifact-"));
  const artifactPath = path.join(tmp, "HonestFlashArbV3.json");
  fs.writeFileSync(artifactPath, "{}");
  return {
    wsUrl: "wss://example",
    rpcUrl: "https://example",
    privateKey: "0x" + "11".repeat(32),
    contractAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    chainId: 1,
    slippageBps: 50,
    minProfitBps: 10,
    multiBlockTargets: 2,
    artifactPath,
    addresses: { multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11" },
    logDir: tmp,
    ...overrides,
  };
}

describe("validateConfig", () => {
  it("passes with valid config", () => {
    assert.doesNotThrow(() => validateConfig(baseConfig()));
  });

  it("rejects MULTI_BLOCK_TARGETS > 5", () => {
    assert.throws(
      () => validateConfig(baseConfig({ multiBlockTargets: 9 })),
      /MULTI_BLOCK_TARGETS/
    );
  });
});

describe("encodeV3Path", () => {
  it("encodes token-fee-token path", () => {
    const usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const encoded = encodeV3Path([usdc, weth], [3000]);
    assert.ok(encoded.startsWith("0x"));
    assert.equal(encoded.length, 2 + (20 + 3 + 20) * 2);
  });
});
