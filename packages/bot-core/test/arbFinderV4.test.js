const { describe, it } = require("node:test");
const assert = require("node:assert");
const { ethers } = require("ethers");
const {
  venueTarget,
  parseLoanAmountsForTriangles,
} = require("../src/arbFinderV4");
const { calcThresholds } = require("../src/arbFinder");

const baseConfig = {
  loanSizesUsdc: "5000,10000",
  addresses: {
    uniV2Router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    sushiRouter: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
    curve3pool: "0xbEbc44782C7Db0a1A60Cb6fe97d0b48303205716",
    balancerVault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
    balancerPoolId:
      "0x96646936b91b6be07d7e27e47baae2af033e58dce4e8d2f5428e5a9e294aae38",
    multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11",
  },
  triangles: [
    {
      name: "tri-a",
      loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      assetDecimals: 6,
      legs: [
        { venue: "curve", tokenIn: "0xA0", tokenOut: "0xDai", curveI: 1, curveJ: 0 },
        { venue: "uni", tokenIn: "0xDai", tokenOut: "0xWeth" },
        { venue: "sushi", tokenIn: "0xWeth", tokenOut: "0xA0" },
      ],
    },
  ],
  minProfitBps: 10,
  estimatedArbGas: 1100000,
};

describe("parseLoanAmountsForTriangles", () => {
  it("parses loan sizes per triangle", () => {
    const amounts = parseLoanAmountsForTriangles(baseConfig);
    assert.equal(amounts["tri-a"].length, 2);
    assert.ok(amounts["tri-a"][0].eq(ethers.utils.parseUnits("5000", 6)));
  });
});

describe("venueTarget", () => {
  it("resolves uni router", () => {
    const target = venueTarget(baseConfig, {
      venue: "uni",
      tokenIn: "0x",
      tokenOut: "0x",
    });
    assert.equal(target, baseConfig.addresses.uniV2Router);
  });

  it("resolves curve pool default", () => {
    const target = venueTarget(baseConfig, {
      venue: "curve",
      tokenIn: "0x",
      tokenOut: "0x",
      curveI: 0,
      curveJ: 1,
    });
    assert.equal(target, baseConfig.addresses.curve3pool);
  });
});

describe("tri-hop thresholds", () => {
  it("uses same premium math as V2 scanner", () => {
    const loanIn = 10000_000000n;
    const { premium } = calcThresholds(loanIn, { minProfitBps: 10 });
    assert.equal(premium, 5000000n);
  });
});
