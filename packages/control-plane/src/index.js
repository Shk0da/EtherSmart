const path = require("path");
require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

const { createApp } = require("./routes");
const {
  port,
  bind,
  validateStartup,
  indexerEnabled,
  liveFeedMetricsMs,
} = require("./config");
const auditLog = require("./auditLog");
const { createLiveFeed } = require("./liveFeed");
const { startFlashIndexer, closeFlashDb } = require("./flashIndexer");
const { createMetricsPoller } = require("./metricsPoller");

validateStartup();

const app = createApp();
const server = app.listen(port, bind, () => {
  console.log(`EtherSmart control-plane http://${bind}:${port}`);
});

const liveFeed = createLiveFeed(server);
let metricsPoller = null;

if (indexerEnabled) {
  startFlashIndexer({ broadcast: (msg) => liveFeed.broadcast(msg) }).catch(
    (err) => console.error("[flash-indexer] start failed:", err.message)
  );
}

metricsPoller = createMetricsPoller({
  broadcast: (msg) => liveFeed.broadcast(msg),
  intervalMs: liveFeedMetricsMs,
});

console.log(`[live-feed] WebSocket ws://${bind}:${port}/api/ws?token=...`);

function shutdown() {
  metricsPoller?.stop();
  liveFeed.close();
  closeFlashDb();
  server.close();
  auditLog.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

module.exports = { app, server };
