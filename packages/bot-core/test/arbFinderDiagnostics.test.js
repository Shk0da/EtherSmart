const { describe, it } = require("node:test");
const assert = require("node:assert");
const { ethers } = require("ethers");
const { scanOpportunities, parseLoanAmounts } = require("../src/arbFinder");
const { clearAavePremiumCache } = require("../src/aavePremium");

const ADDR = {
  usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  uniV2Router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  sushiRouter: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
  multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11",
  // aavePool intentionally omitted -> premium falls back to 5 bps default
};

const ROUTER_IFACE = new ethers.utils.Interface([
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)",
]);
const MC_IFACE = new ethers.utils.Interface([
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) external payable returns (tuple(bool success, bytes returnData)[] returnData)",
]);

// Fake provider that answers Multicall3.aggregate3 of router getAmountsOut calls.
// `legOut(path)` returns the BigNumber amountOut for a given swap direction.
function makeProvider(legOut) {
  return {
    _isProvider: true,
    getNetwork: async () => ({ chainId: 1, name: "test" }),
    getFeeData: async () => ({
      maxFeePerGas: ethers.utils.parseUnits("20", "gwei"),
      maxPriorityFeePerGas: ethers.utils.parseUnits("2", "gwei"),
      gasPrice: ethers.utils.parseUnits("20", "gwei"),
    }),
    resolveName: async (x) => x,
    call: async (tx) => {
      const [calls] = MC_IFACE.decodeFunctionData("aggregate3", tx.data);
      const results = calls.map((c) => {
        const [amountIn, path] = ROUTER_IFACE.decodeFunctionData(
          "getAmountsOut",
          c.callData
        );
        const out = legOut(path.map((p) => p.toLowerCase()), amountIn);
        if (out === 0n || out === null) {
          return [false, "0x"];
        }
        const returnData = ROUTER_IFACE.encodeFunctionResult("getAmountsOut", [
          [amountIn, out],
        ]);
        return [true, returnData];
      });
      return MC_IFACE.encodeFunctionResult("aggregate3", [results]);
    },
  };
}

function baseConfig() {
  return {
    loanSizesUsdc: "10000",
    minProfitBps: 10,
    maxGasPriceGwei: 120,
    estimatedArbGas: 900000,
    builderTipWei: "0",
    addresses: ADDR,
  };
}

const PAIRS = [
  {
    name: "USDC-WETH",
    asset: ADDR.usdc,
    bridge: ADDR.weth,
    assetDecimals: 6,
    bridgeDecimals: 18,
  },
];

describe("scanOpportunities diagnostics", () => {
  it("reports evaluated/quotesSeen/best shortfall for live but unprofitable quotes", async () => {
    clearAavePremiumCache();
    const config = baseConfig();
    const loanAmounts = parseLoanAmounts(config, PAIRS);
    const usdc = ADDR.usdc.toLowerCase();

    // leg1 USDC->WETH returns 3 WETH; any WETH->USDC returns 9990 USDC
    // (round-trip = 0.999 * loan -> 30 bps short of the 0.2% threshold).
    const provider = makeProvider((path) => {
      if (path[0] === usdc) return ethers.utils.parseUnits("3", 18);
      return ethers.BigNumber.from("9990000000"); // 9990 USDC (6 dp)
    });

    const { opportunities, diagnostics } = await scanOpportunities(
      provider,
      config,
      PAIRS,
      loanAmounts
    );

    assert.equal(opportunities.length, 0, "round-trip is unprofitable");
    assert.equal(diagnostics.evaluated, 2, "uni->sushi and sushi->uni");
    assert.equal(diagnostics.quotesSeen, 2);
    assert.ok(diagnostics.best, "best candidate captured");
    assert.equal(diagnostics.best.shortfallBps, 30);
    assert.equal(diagnostics.best.pair, "USDC-WETH");
    // round-trip returns 0.999 * loan -> spread is -10 bps vs loan
    assert.equal(diagnostics.best.spreadBps, -10);

    // comparisons summarise what was compared (one entry per pair)
    assert.equal(diagnostics.comparisons.length, 1);
    const cmp = diagnostics.comparisons[0];
    assert.equal(cmp.pair, "USDC-WETH");
    assert.equal(cmp.spreadBps, -10);
    assert.ok(cmp.direction.includes("->"));
  });

  it("flags no quotes when leg1 quotes are all zero", async () => {
    clearAavePremiumCache();
    const config = baseConfig();
    const loanAmounts = parseLoanAmounts(config, PAIRS);

    const provider = makeProvider(() => 0n);

    const { opportunities, diagnostics } = await scanOpportunities(
      provider,
      config,
      PAIRS,
      loanAmounts
    );

    assert.equal(opportunities.length, 0);
    assert.equal(diagnostics.evaluated, 0, "no leg2 built without leg1 quotes");
    assert.equal(diagnostics.quotesSeen, 0);
    assert.equal(diagnostics.best, null);
    assert.deepEqual(diagnostics.comparisons, []);
  });
});
