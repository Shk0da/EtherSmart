const fs = require("fs");
const Database = require("better-sqlite3");
const { abs } = require("./config");

function openDb(bot) {
  const dbPath = abs(bot.metricsDb);
  if (!fs.existsSync(dbPath)) return null;
  return new Database(dbPath, { readonly: true });
}

function parsePayload(row) {
  let payload = {};
  try {
    payload = JSON.parse(row.payload);
  } catch {
  }
  return { ...row, payload };
}

function getMetrics(bot, { limit = 100, type = null } = {}) {
  const db = openDb(bot);
  if (!db) return [];

  try {
    if (type) {
      return db
        .prepare(
          `SELECT id, ts, type, payload FROM events
           WHERE type = ? ORDER BY id DESC LIMIT ?`
        )
        .all(type, limit)
        .map(parsePayload);
    }
    return db
      .prepare(
        `SELECT id, ts, type, payload FROM events ORDER BY id DESC LIMIT ?`
      )
      .all(limit)
      .map(parsePayload);
  } finally {
    db.close();
  }
}

function getTrades(bot, limit = 100) {
  const included = getMetrics(bot, { limit: 500, type: "bundle_included" });
  const submitted = getMetrics(bot, { limit: 500, type: "bundle_submitted" });

  const trades = included.map((row) => ({
    id: row.id,
    ts: row.ts,
    status: "included",
    block: row.payload.block || row.payload.blockNum,
    netProfit: row.payload.netProfit || row.payload.profit,
    pair: row.payload.pair || row.payload.triangle || row.payload.cycleId,
    txHash: row.payload.txHash || null,
  }));

  for (const row of submitted) {
    if (trades.some((t) => t.block === row.payload.block)) continue;
    trades.push({
      id: row.id,
      ts: row.ts,
      status: "submitted",
      block: row.payload.block || row.payload.blocks?.[0],
      netProfit: row.payload.netProfit,
      pair: row.payload.pair || row.payload.triangle || row.payload.cycleId,
      txHash: row.payload.txHash || null,
    });
  }

  return trades.sort((a, b) => b.id - a.id).slice(0, limit);
}

function getPnlSummary(bot, days = 30) {
  const events = getMetrics(bot, { limit: 5000 });
  const byDay = new Map();
  const cutoff = Date.now() - days * 86400000;

  for (const row of events) {
    const ts = new Date(row.ts).getTime();
    if (ts < cutoff) continue;

    const day = row.ts.slice(0, 10);
    if (!byDay.has(day)) {
      byDay.set(day, {
        day,
        opportunities: 0,
        simulationsOk: 0,
        simulationsFailed: 0,
        bundlesIncluded: 0,
        estimatedProfitWei: 0n,
        netProfitWei: 0n,
      });
    }
    const agg = byDay.get(day);

    if (row.type === "opportunity") {
      agg.opportunities += 1;
      const np = row.payload.netProfit;
      if (np) agg.netProfitWei += BigInt(np);
      const gp = row.payload.grossProfit;
      if (gp) agg.estimatedProfitWei += BigInt(gp);
    }
    if (row.type === "simulation_ok") agg.simulationsOk += 1;
    if (row.type === "simulation_failed") agg.simulationsFailed += 1;
    if (row.type === "bundle_included") agg.bundlesIncluded += 1;
  }

  return [...byDay.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((d) => ({
      ...d,
      estimatedProfitWei: d.estimatedProfitWei.toString(),
      netProfitWei: d.netProfitWei.toString(),
    }));
}

function getEventSummary(bot) {
  const db = openDb(bot);
  if (!db) {
    return {
      total: 0,
      byType: {},
    };
  }
  try {
    const rows = db
      .prepare(`SELECT type, COUNT(*) as c FROM events GROUP BY type`)
      .all();
    const byType = {};
    let total = 0;
    for (const r of rows) {
      byType[r.type] = r.c;
      total += r.c;
    }
    return { total, byType };
  } finally {
    db.close();
  }
}

module.exports = { getMetrics, getTrades, getPnlSummary, getEventSummary };
