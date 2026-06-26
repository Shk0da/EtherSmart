const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const { ethers } = require("ethers");
const {
  rowFromLog,
  storeFlash,
  getDb,
  FLASH_IFACE,
} = require("../src/flashIndexer");
const fs = require("fs");
const path = require("path");

const TEST_DB = path.join(__dirname, "..", "data", "trades-test.db");

describe("flashIndexer", () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("parses FlashCompleted log", () => {
    const asset = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const amount = ethers.BigNumber.from("1000000000");
    const premium = ethers.BigNumber.from("500000");
    const profit = ethers.BigNumber.from("10000000");

    const log = {
      blockNumber: 123,
      transactionHash: "0xabc",
      logIndex: 0,
      address: "0xcontract",
      topics: [FLASH_IFACE.getEventTopic("FlashCompleted"), ethers.utils.hexZeroPad(asset, 32)],
      data: ethers.utils.defaultAbiCoder.encode(
        ["uint256", "uint256", "uint256"],
        [amount, premium, profit]
      ),
    };

    const row = rowFromLog("v5", log, 1700000000);
    assert.equal(row.botId, "v5");
    assert.equal(row.profit, "10000000");
    assert.equal(row.symbol, "USDC");
    assert.equal(row.profitFormatted, "10.0");
  });
});
