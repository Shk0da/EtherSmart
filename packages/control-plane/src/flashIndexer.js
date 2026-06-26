const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const Database = require("better-sqlite3");
const { BOTS, repoRoot, indexerFromBlock, indexerChunkSize } = require("./config");
const { readEnvValue } = require("./botManager");
const { getProvider } = require("./chainService");
const { tokenMeta } = require("./tokenMeta");

const FLASH_IFACE = new ethers.utils.Interface([
  "event FlashCompleted(address indexed asset, uint256 amount, uint256 premium, uint256 profit)",
]);

const FLASH_TOPIC = FLASH_IFACE.getEventTopic("FlashCompleted");

let db;
let running = false;
let onEvent = null;

function getDb() {
  if (db) return db;
  const dir = path.join(repoRoot, "packages", "control-plane", "data");
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(path.join(dir, "trades.db"));
  db.exec(`
    CREATE TABLE IF NOT EXISTS flash_completed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_id TEXT NOT NULL,
      block_number INTEGER NOT NULL,
      tx_hash TEXT NOT NULL,
      log_index INTEGER NOT NULL,
      asset TEXT NOT NULL,
      amount TEXT NOT NULL,
      premium TEXT NOT NULL,
      profit TEXT NOT NULL,
      ts TEXT,
      UNIQUE(tx_hash, log_index)
    );
    CREATE INDEX IF NOT EXISTS idx_flash_bot ON flash_completed(bot_id);
    CREATE INDEX IF NOT EXISTS idx_flash_block ON flash_completed(block_number);
    CREATE TABLE IF NOT EXISTS indexer_state (
      bot_id TEXT PRIMARY KEY,
      last_block INTEGER NOT NULL
    );
  `);
  return db;
}

function getLastBlock(botId) {
  const row = getDb()
    .prepare("SELECT last_block FROM indexer_state WHERE bot_id = ?")
    .get(botId);
  return row ? row.last_block : null;
}

function setLastBlock(botId, blockNumber) {
  getDb()
    .prepare(
      `INSERT INTO indexer_state (bot_id, last_block) VALUES (?, ?)
       ON CONFLICT(bot_id) DO UPDATE SET last_block = excluded.last_block`
    )
    .run(botId, blockNumber);
}

function storeFlash(row) {
  const info = getDb()
    .prepare(
      `INSERT OR IGNORE INTO flash_completed
        (bot_id, block_number, tx_hash, log_index, asset, amount, premium, profit, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.botId,
      row.blockNumber,
      row.txHash,
      row.logIndex,
      row.asset,
      row.amount,
      row.premium,
      row.profit,
      row.ts
    );
  return info.changes > 0;
}
function rowFromLog(botId, log, blockTimestamp) {
  const parsed = FLASH_IFACE.parseLog(log);
  const meta = tokenMeta(parsed.args.asset);
  return {
    botId,
    blockNumber: log.blockNumber,
    txHash: log.transactionHash,
    logIndex: log.logIndex,
    asset: parsed.args.asset,
    amount: parsed.args.amount.toString(),
    premium: parsed.args.premium.toString(),
    profit: parsed.args.profit.toString(),
    profitFormatted: ethers.utils.formatUnits(parsed.args.profit, meta.decimals),
    symbol: meta.symbol,
    ts: blockTimestamp
      ? new Date(blockTimestamp * 1000).toISOString()
      : new Date().toISOString(),
  };
}

function getWatchedBots() {
  return BOTS.map((bot) => ({
    bot,
    contract: readEnvValue(bot, "ARB_CONTRACT"),
  })).filter((w) => w.contract && ethers.utils.isAddress(w.contract));
}

async function indexRange(provider, watched, fromBlock, toBlock) {
  const addresses = watched.map((w) => w.contract);
  const contractByAddress = new Map(
    watched.map((w) => [w.contract.toLowerCase(), w.bot.id])
  );

  const logs = await provider.getLogs({
    fromBlock,
    toBlock,
    address: addresses,
    topics: [FLASH_TOPIC],
  });

  let blockTs = null;
  if (logs.length > 0) {
    const block = await provider.getBlock(logs[0].blockNumber);
    blockTs = block?.timestamp;
  }

  const newRows = [];
  for (const log of logs) {
    const botId = contractByAddress.get(log.address.toLowerCase());
    if (!botId) continue;
    const row = rowFromLog(botId, log, blockTs);
    if (storeFlash(row)) {
      newRows.push(row);
      if (onEvent) onEvent({ type: "flash_completed", ...row });
    }
  }
  return newRows;
}

async function catchUp(provider, watched) {
  const head = await provider.getBlockNumber();
  for (const w of watched) {
    const last = getLastBlock(w.bot.id);
    const from =
      last != null ? last + 1 : Math.max(indexerFromBlock, head - 5000);
    if (from > head) continue;

    for (let start = from; start <= head; start += indexerChunkSize) {
      const end = Math.min(start + indexerChunkSize - 1, head);
      await indexRange(provider, [w], start, end);
      setLastBlock(w.bot.id, end);
    }
  }
}

async function onNewBlock(blockNumber) {
  const provider = getProvider();
  if (!provider) return;

  const watched = getWatchedBots();
  if (watched.length === 0) return;

  const newRows = await indexRange(provider, watched, blockNumber, blockNumber);
  for (const w of watched) {
    const last = getLastBlock(w.bot.id);
    if (last == null || blockNumber > last) {
      setLastBlock(w.bot.id, blockNumber);
    }
  }
  return newRows;
}

function listFlashTrades(botId, limit = 100) {
  const rows = getDb()
    .prepare(
      `SELECT * FROM flash_completed WHERE bot_id = ?
       ORDER BY block_number DESC, log_index DESC LIMIT ?`
    )
    .all(botId, limit);

  return rows.map((r) => {
    const meta = tokenMeta(r.asset);
    return {
      id: `flash-${r.id}`,
      source: "onchain",
      botId: r.bot_id,
      ts: r.ts,
      status: "flash_completed",
      block: r.block_number,
      txHash: r.tx_hash,
      asset: r.asset,
      symbol: meta.symbol,
      amount: r.amount,
      premium: r.premium,
      profit: r.profit,
      profitFormatted: ethers.utils.formatUnits(r.profit, meta.decimals),
      pair: meta.symbol,
      netProfit: r.profit,
    };
  });
}

function getFlashPnlSummary(botId, days = 30) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const rows = getDb()
    .prepare(
      `SELECT ts, profit, asset FROM flash_completed
       WHERE bot_id = ? AND ts >= ? ORDER BY ts ASC`
    )
    .all(botId, cutoff);

  const byDay = new Map();
  for (const r of rows) {
    const day = r.ts.slice(0, 10);
    if (!byDay.has(day)) {
      byDay.set(day, { day, flashCount: 0, onChainProfitWei: 0n });
    }
    const agg = byDay.get(day);
    agg.flashCount += 1;
    agg.onChainProfitWei += BigInt(r.profit);
  }

  return [...byDay.values()].map((d) => ({
    ...d,
    onChainProfitWei: d.onChainProfitWei.toString(),
  }));
}

function getIndexerStatus() {
  const watched = getWatchedBots();
  return watched.map((w) => ({
    botId: w.bot.id,
    contract: w.contract,
    lastBlock: getLastBlock(w.bot.id),
  }));
}

async function startFlashIndexer({ broadcast } = {}) {
  if (running) return;
  running = true;
  onEvent = broadcast || null;

  const provider = getProvider();
  if (!provider) {
    console.warn("[flash-indexer] MAINNET_RPC_URL not set — indexer disabled");
    return;
  }

  const watched = getWatchedBots();
  if (watched.length === 0) {
    console.warn("[flash-indexer] no ARB_CONTRACT configured — indexer idle");
  } else {
    console.log(
      `[flash-indexer] watching ${watched.length} contracts from block ${indexerFromBlock}`
    );
    try {
      await catchUp(provider, watched);
    } catch (err) {
      console.error("[flash-indexer] catch-up failed:", err.message);
    }
  }

  provider.on("block", (blockNumber) => {
    onNewBlock(blockNumber).catch((err) => {
      console.error("[flash-indexer] block error:", err.message);
    });
  });
}

function stopFlashIndexer() {
  running = false;
  onEvent = null;
  const provider = getProvider();
  if (provider) provider.removeAllListeners("block");
}

function closeFlashDb() {
  stopFlashIndexer();
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  startFlashIndexer,
  stopFlashIndexer,
  closeFlashDb,
  listFlashTrades,
  getFlashPnlSummary,
  getIndexerStatus,
  rowFromLog,
  storeFlash,
  getDb,
  FLASH_IFACE,
};
