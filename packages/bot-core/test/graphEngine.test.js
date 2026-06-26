const { describe, it } = require("node:test");
const assert = require("node:assert");
const { findCycles } = require("../src/graphEngine");
const { pickFlashSource, FlashSource } = require("../src/flashPicker");

const edges = [
  { id: "a", venue: "uni", tokenIn: "0xUSDC", tokenOut: "0xDAI" },
  { id: "b", venue: "uni", tokenIn: "0xDAI", tokenOut: "0xWETH" },
  { id: "c", venue: "sushi", tokenIn: "0xWETH", tokenOut: "0xUSDC" },
];

describe("findCycles", () => {
  it("finds 3-hop cycle back to loan token", () => {
    const cycles = findCycles(edges, "0xUSDC", 3, 3);
    assert.equal(cycles.length, 1);
    assert.equal(cycles[0].length, 3);
  });
});

describe("pickFlashSource", () => {
  it("defaults to Aave", () => {
    const pick = pickFlashSource({ flashSource: 0 }, { loanAmount: 1000n });
    assert.equal(pick.source, FlashSource.AAVE);
  });
});
