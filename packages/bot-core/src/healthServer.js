const http = require("http");

function authorize(req, config) {
  if (!config.healthToken) return true;
  const header = req.headers.authorization || "";
  return header === `Bearer ${config.healthToken}`;
}

function startHealthServer({ config, getStatus, log, metricsStore }) {
  const host = config.healthBind || "127.0.0.1";

  const server = http.createServer((req, res) => {
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end();
      return;
    }

    if (!authorize(req, config)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    if (req.url === "/health" || req.url === "/health/") {
      const status = getStatus();
      const code = status.ok ? 200 : 503;
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(status, null, 2));
      return;
    }

    if (req.url === "/stats" || req.url === "/stats/") {
      const status = getStatus();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(status.stats, null, 2));
      return;
    }

    if (
      metricsStore &&
      (req.url === "/metrics/recent" || req.url === "/metrics/recent/")
    ) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(metricsStore.recent(100), null, 2));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(config.healthPort, host, () => {
    log.info({ port: config.healthPort, host }, "health server listening");
  });

  return server;
}

module.exports = { startHealthServer };
