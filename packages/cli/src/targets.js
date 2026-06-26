const { BOT_IDS, SERVICES, ALIASES, GROUPS } = require("./config");

function normalizeTarget(raw) {
  const t = String(raw || "").toLowerCase().trim();
  if (!t) return null;
  if (ALIASES[t]) return ALIASES[t];
  if (GROUPS[t]) return t;
  if (BOT_IDS.includes(t) || SERVICES[t]) return t;
  return null;
}

function expandTarget(target) {
  const norm = normalizeTarget(target);
  if (!norm) throw new Error(`Unknown target: ${target}`);
  if (GROUPS[norm]) return GROUPS[norm];
  return [norm];
}

function isBot(id) {
  return BOT_IDS.includes(id);
}

function isService(id) {
  return Boolean(SERVICES[id]);
}

module.exports = { normalizeTarget, expandTarget, isBot, isService, GROUPS };
