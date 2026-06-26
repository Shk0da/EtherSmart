const { describe, it } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { validateConfig } = require("@ethersmart/bot-core");

function baseConfig(overrides = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arb-artifact-"));
  const artifactPath = path.join(tmp, "HonestFlashArbV2.json");
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
    addresses: { multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11" },
    logDir: tmp,
    ...overrides,
  };
}

describe("validateConfig", () => {
  it("passes with valid config", () => {
    assert.doesNotThrow(() => validateConfig(baseConfig()));
  });

  it("rejects missing artifact", () => {
    assert.throws(
      () => validateConfig(baseConfig({ artifactPath: "/missing.json" })),
      /artifact not found/
    );
  });
});
