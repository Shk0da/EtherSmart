const path = require("path");
const Database = require("better-sqlite3");

function createMetricsStore(config) {
  if (config.metricsEnabled === false) {
    return {
      record() {},
      recent() {
        return [];
      },
      close() {},
    };
  }

  const dbPath =
    config.metricsDbPath || path.join(config.logDir, "metrics.db");
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
  `);

  const insert = db.prepare(
    "INSERT INTO events (ts, type, payload) VALUES (?, ?, ?)"
  );

  return {
    record(type, payload) {
      insert.run(new Date().toISOString(), type, JSON.stringify(payload));
    },
    recent(limit = 50) {
      return db
        .prepare("SELECT id, ts, type, payload FROM events ORDER BY id DESC LIMIT ?")
        .all(limit);
    },
    close() {
      db.close();
    },
  };
}

module.exports = { createMetricsStore };
