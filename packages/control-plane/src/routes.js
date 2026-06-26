const express = require("express");
const cors = require("cors");
const path = require("path");
const { password, corsOrigin, isProduction, BOTS } = require("./config");
const { login, authMiddleware } = require("./auth");
const {
  getBot,
  listBots,
  startBot,
  stopBot,
  restartBot,
} = require("./botManager");
const {
  getMetrics,
  getTrades,
  getPnlSummary,
  getEventSummary,
} = require("./metricsService");
const { getBalances } = require("./chainService");
const {
  listFlashTrades,
  getFlashPnlSummary,
  getIndexerStatus,
} = require("./flashIndexer");
const { getConfig, updateConfig } = require("./configService");
const { runJob, listJobs, getJobDetail, hasRunningDeploy } = require("./deployService");
const auditLog = require("./auditLog");
const { clampInt } = require("./validate");

function clientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
}

function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "64kb" }));
  app.use(authMiddleware());

  app.post("/api/auth/login", (req, res) => {
    const result = login(req.body.password, password, clientIp(req));
    if (!result) {
      res.status(401).json({ error: "invalid password" });
      return;
    }
    if (result.error === "too_many_attempts") {
      res.status(429).json({ error: "too many login attempts" });
      return;
    }
    res.json({ token: result.token });
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "control-plane",
      production: isProduction,
    });
  });

  app.get("/api/audit", (req, res) => {
    const limit = clampInt(req.query.limit, 50, 1, 200);
    res.json(auditLog.recent(limit));
  });

  app.get("/api/bots", async (_req, res) => {
    try {
      res.json(await listBots());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/bots/:id", async (req, res) => {
    try {
      const bot = getBot(req.params.id);
      const status = (await listBots()).find((b) => b.id === bot.id);
      const summary = getEventSummary(bot);
      res.json({ ...status, eventSummary: summary });
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });

  app.post("/api/bots/:id/start", async (req, res) => {
    try {
      const id = req.params.id;
      const result = await startBot(id);
      auditLog.record("bot.start", id, result);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/bots/:id/stop", async (req, res) => {
    try {
      const id = req.params.id;
      const result = await stopBot(id);
      auditLog.record("bot.stop", id, result);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/bots/:id/restart", async (req, res) => {
    try {
      const id = req.params.id;
      const result = await restartBot(id);
      auditLog.record("bot.restart", id, result);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/bots/:id/metrics", (req, res) => {
    try {
      const bot = getBot(req.params.id);
      const limit = clampInt(req.query.limit, 100, 1, 500);
      const type = req.query.type || null;
      res.json(getMetrics(bot, { limit, type }));
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });

  app.get("/api/indexer/status", (_req, res) => {
    res.json(getIndexerStatus());
  });

  app.get("/api/bots/:id/flash-trades", (req, res) => {
    try {
      const bot = getBot(req.params.id);
      const limit = clampInt(req.query.limit, 50, 1, 200);
      res.json(listFlashTrades(bot.id, limit));
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });

  app.get("/api/bots/:id/trades", (req, res) => {
    try {
      const bot = getBot(req.params.id);
      const limit = clampInt(req.query.limit, 50, 1, 200);
      const offchain = getTrades(bot, limit);
      const onchain = listFlashTrades(bot.id, limit);
      const merged = [...onchain, ...offchain]
        .sort((a, b) => new Date(b.ts) - new Date(a.ts))
        .slice(0, limit);
      res.json(merged);
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });

  app.get("/api/bots/:id/pnl", (req, res) => {
    try {
      const bot = getBot(req.params.id);
      const days = clampInt(req.query.days, 30, 1, 365);
      const offchain = getPnlSummary(bot, days);
      const onchain = getFlashPnlSummary(bot.id, days);
      const byDay = new Map();
      for (const row of offchain) {
        byDay.set(row.day, { ...row, onChainProfitWei: "0", flashCount: 0 });
      }
      for (const row of onchain) {
        const existing = byDay.get(row.day) || {
          day: row.day,
          opportunities: 0,
          simulationsOk: 0,
          simulationsFailed: 0,
          bundlesIncluded: 0,
          estimatedProfitWei: "0",
          netProfitWei: "0",
        };
        existing.onChainProfitWei = row.onChainProfitWei;
        existing.flashCount = row.flashCount;
        byDay.set(row.day, existing);
      }
      res.json([...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)));
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });

  app.get("/api/bots/:id/balances", async (req, res) => {
    try {
      const bot = getBot(req.params.id);
      res.json(await getBalances(bot));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/bots/:id/config", (req, res) => {
    try {
      res.json(getConfig(getBot(req.params.id)));
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });

  app.put("/api/bots/:id/config", (req, res) => {
    try {
      const bot = getBot(req.params.id);
      const keys = Object.keys(req.body.updates || {});
      const updated = updateConfig(bot, req.body.updates || {}, {
        allowSecrets: req.body.allowSecrets === true,
      });
      auditLog.record("config.update", bot.id, { keys });
      res.json(updated);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/deploy/jobs", (_req, res) => {
    res.json(listJobs());
  });

  app.post("/api/deploy", (req, res) => {
    try {
      const version = req.body.version;
      if (!BOTS.some((b) => b.id === version)) {
        res.status(400).json({ error: "invalid version" });
        return;
      }
      if (hasRunningDeploy()) {
        res.status(409).json({ error: "deploy already in progress" });
        return;
      }
      const job = runJob(version, {
        compileFirst: req.body.compileFirst !== false,
      });
      auditLog.record("deploy.start", version, { jobId: job.id });
      res.json(job);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/deploy/jobs/:id", (req, res) => {
    try {
      res.json(getJobDetail(req.params.id));
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });

  const uiDist = path.join(__dirname, "..", "..", "dashboard-ui", "dist");
  if (process.env.SERVE_UI === "true") {
    app.use(express.static(uiDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(uiDist, "index.html"));
    });
  }

  return app;
}

module.exports = { createApp };
