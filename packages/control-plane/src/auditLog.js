const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { abs, repoRoot } = require("./config");

let db;

function getDb() {
  if (db) return db;
  const dir = path.join(repoRoot, "packages", "control-plane", "data");
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(path.join(dir, "audit.db"));
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      detail TEXT
    );
  `);
  return db;
}

function record(action, target, detail = {}) {
  getDb()
    .prepare("INSERT INTO audit (ts, action, target, detail) VALUES (?, ?, ?, ?)")
    .run(new Date().toISOString(), action, target || null, JSON.stringify(detail));
}

function recent(limit = 50) {
  return getDb()
    .prepare(
      "SELECT id, ts, action, target, detail FROM audit ORDER BY id DESC LIMIT ?"
    )
    .all(Math.min(limit, 200))
    .map((row) => ({
      ...row,
      detail: JSON.parse(row.detail || "{}"),
    }));
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { record, recent, close };
