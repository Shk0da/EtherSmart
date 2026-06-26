const { BOTS } = require("./config");
const { getMetrics } = require("./metricsService");
const { listBots } = require("./botManager");

function createMetricsPoller({ broadcast, intervalMs = 5000 }) {
  const lastId = new Map();

  async function pollMetrics() {
    for (const bot of BOTS) {
      const events = getMetrics(bot, { limit: 30 });
      if (events.length === 0) continue;

      const maxId = Math.max(...events.map((e) => e.id));
      const prev = lastId.get(bot.id);
      if (prev == null) {
        lastId.set(bot.id, maxId);
        continue;
      }

      const fresh = events
        .filter((e) => e.id > prev)
        .sort((a, b) => a.id - b.id);
      if (fresh.length === 0) continue;

      lastId.set(bot.id, maxId);
      for (const event of fresh) {
        broadcast({
          type: "metric",
          botId: bot.id,
          event,
        });
      }
    }
  }

  async function pollBots() {
    const bots = await listBots();
    broadcast({ type: "bots_snapshot", bots });
  }

  const metricsTimer = setInterval(() => {
    pollMetrics().catch((err) => {
      console.error("[metrics-poller]", err.message);
    });
  }, intervalMs);

  const botsTimer = setInterval(() => {
    pollBots().catch((err) => {
      console.error("[bots-poller]", err.message);
    });
  }, Math.max(intervalMs * 2, 10000));

  pollBots().catch(() => {});

  return {
    stop() {
      clearInterval(metricsTimer);
      clearInterval(botsTimer);
    },
  };
}

module.exports = { createMetricsPoller };
