const { describe, it } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { validateConfig } = require("../src/validateConfig");
const { calcThresholds, parseLoanSizes } = require("../src/arbFinder");
const { resolveTxFees } = require("../src/gasOracle");
const {
  createContractState,
  refreshContractState,
} = require("../src/contractState");
const { createMetricsStore } = require("../src/metricsStore");
const { ethers } = require("ethers");

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
    maxGasPriceGwei: 120,
    estimatedArbGas: 900000,
    builderTipWei: "0",
    logDir: tmp,
    addresses: { multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11" },
    artifactPath,
    ...overrides,
  };
}

describe("validateConfig", () => {
  it("passes with valid config", () => {
    assert.doesNotThrow(() => validateConfig(baseConfig()));
  });

  it("rejects missing WS_URL", () => {
    assert.throws(() => validateConfig(baseConfig({ wsUrl: "" })), /WS_URL/);
  });
});

describe("parseLoanSizes", () => {
  it("parses comma-separated sizes", () => {
    const sizes = parseLoanSizes({ loanSizesUsdc: "1000,5000,10000" });
    assert.deepEqual(sizes, ["1000", "5000", "10000"]);
  });
});

describe("calcThresholds", () => {
  it("includes premium in minProfit", () => {
    const loanIn = 10000_000000n;
    const { minProfit, premium } = calcThresholds(loanIn, { minProfitBps: 10 });
    assert.equal(premium, 5000000n);
    assert.equal(minProfit, 10000000n + premium);
  });
});

describe("resolveTxFees", () => {
  it("spreads builder tip over estimated gas", async () => {
    const provider = {
      getFeeData: async () => ({
        maxFeePerGas: ethers.utils.parseUnits("50", "gwei"),
        maxPriorityFeePerGas: ethers.utils.parseUnits("2", "gwei"),
      }),
    };
    const fees = await resolveTxFees(
      provider,
      { maxGasPriceGwei: 120, builderTipWei: "900000", estimatedArbGas: 900000 },
      900000
    );
    assert.ok(
      fees.maxPriorityFeePerGas.eq(
        ethers.utils.parseUnits("2", "gwei").add(1)
      )
    );
  });
});

describe("contractState", () => {
  it("refreshes paused on interval", async () => {
    const state = createContractState({ paused: true });
    const arb = { paused: async () => false };
    await refreshContractState(arb, state, 10, 5);
    assert.equal(state.paused, false);
  });
});

describe("metricsStore", () => {
  it("persists and reads events", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "metrics-"));
    const store = createMetricsStore({
      logDir: tmp,
      metricsDbPath: path.join(tmp, "m.db"),
    });
    store.record("test", { ok: true });
    const rows = store.recent(1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].type, "test");
    store.close();
  });
});
