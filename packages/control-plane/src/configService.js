const fs = require("fs");
const { abs, SECRET_KEYS, EDITABLE_KEYS } = require("./config");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    const value = t.slice(eq + 1).trim();
    out[key] = value;
  }
  return out;
}

function maskSecrets(env) {
  const masked = {};
  for (const [k, v] of Object.entries(env)) {
    if (SECRET_KEYS.has(k) && v) {
      masked[k] = v.length > 8 ? `${v.slice(0, 6)}…${v.slice(-4)}` : "••••";
    } else {
      masked[k] = v;
    }
  }
  return masked;
}

function getConfig(bot) {
  const envPath = abs(bot.envPath);
  const raw = parseEnvFile(envPath);
  return {
    path: bot.envPath,
    exists: fs.existsSync(envPath),
    editable: [...EDITABLE_KEYS],
    secrets: [...SECRET_KEYS],
    values: maskSecrets(raw),
  };
}

function serializeEnv(env) {
  const lines = ["# Updated via EtherSmart Control Plane", ""];
  for (const [k, v] of Object.entries(env)) {
    lines.push(`${k}=${v}`);
  }
  lines.push("");
  return lines.join("\n");
}

function updateConfig(bot, updates, { allowSecrets = false } = {}) {
  const envPath = abs(bot.envPath);
  const current = parseEnvFile(envPath);

  for (const [key, value] of Object.entries(updates)) {
    if (SECRET_KEYS.has(key) && !allowSecrets) {
      throw new Error(`Cannot update secret key ${key} without allowSecrets`);
    }
    if (!EDITABLE_KEYS.has(key) && !SECRET_KEYS.has(key)) {
      throw new Error(`Key not editable: ${key}`);
    }
    if (value === "" || value === null || value === undefined) {
      delete current[key];
    } else {
      current[key] = String(value);
    }
  }

  fs.mkdirSync(require("path").dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, serializeEnv(current), "utf8");
  return getConfig(bot);
}

module.exports = { getConfig, updateConfig, parseEnvFile, maskSecrets };
