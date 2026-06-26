const fs = require("fs");
const path = require("path");
const { spawn, execFile } = require("child_process");
const { promisify } = require("util");
const { BOTS, abs, repoRoot, controlMode, composeFile } = require("./config");

const execFileAsync = promisify(execFile);

/** @type {Map<string, { pid: number, proc: import('child_process').ChildProcess }>} */
const processes = new Map();

function getBot(id) {
  const bot = BOTS.find((b) => b.id === id);
  if (!bot) throw new Error(`Unknown bot: ${id}`);
  return bot;
}

function readEnvValue(bot, key) {
  const envPath = abs(bot.envPath);
  if (!fs.existsSync(envPath)) return "";
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    if (t.slice(0, eq).trim() === key) {
      return t.slice(eq + 1).trim();
    }
  }
  return "";
}

async function fetchHealth(bot) {
  const host = process.env.BOT_HEALTH_HOST || "127.0.0.1";
  const token = readEnvValue(bot, "HEALTH_TOKEN");
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const urls = [
    `http://${host}:${bot.healthPort}/health`,
    `http://${host}:${bot.healthPort}/stats`,
  ];

  try {
    const [healthRes, statsRes] = await Promise.all(
      urls.map((url) =>
        fetch(url, { headers, signal: AbortSignal.timeout(3000) })
      )
    );
    const health = healthRes.ok ? await healthRes.json() : null;
    const stats = statsRes.ok ? await statsRes.json() : null;
    return { reachable: true, health, stats };
  } catch {
    return { reachable: false, health: null, stats: null };
  }
}

function localProcessRunning(botId) {
  const entry = processes.get(botId);
  if (!entry) return false;
  try {
    process.kill(entry.pid, 0);
    return true;
  } catch {
    processes.delete(botId);
    return false;
  }
}

async function dockerStatus(service) {
  try {
    const { stdout } = await execFileAsync(
      "docker",
      ["compose", "-f", composeFile, "ps", "--format", "json", service],
      { cwd: repoRoot, timeout: 10000 }
    );
    const lines = stdout.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return { running: false, state: "not_found" };
    const info = JSON.parse(lines[0]);
    const state = info.State || info.Status || "";
    return { running: /running/i.test(state), state };
  } catch {
    return { running: false, state: "unknown" };
  }
}

async function getBotStatus(bot) {
  const healthData = await fetchHealth(bot);
  let runtime = { mode: controlMode, running: false, state: "stopped" };

  if (controlMode === "docker") {
    const ds = await dockerStatus(bot.service);
    runtime = { mode: "docker", running: ds.running, state: ds.state };
  } else {
    const running = localProcessRunning(bot.id) || healthData.reachable;
    runtime = {
      mode: "process",
      running,
      state: running ? "running" : "stopped",
      pid: processes.get(bot.id)?.pid || null,
    };
  }

  return {
    id: bot.id,
    version: bot.version,
    label: bot.label,
    healthPort: bot.healthPort,
    contract: readEnvValue(bot, "ARB_CONTRACT"),
    dryRun: readEnvValue(bot, "DRY_RUN") !== "false",
    runtime,
    ...healthData,
  };
}

async function listBots() {
  return Promise.all(BOTS.map((b) => getBotStatus(b)));
}

async function dockerAction(service, action) {
  await execFileAsync(
    "docker",
    ["compose", "-f", composeFile, action, service],
    { cwd: repoRoot, timeout: 120000 }
  );
}

function startProcess(bot) {
  if (localProcessRunning(bot.id)) {
    return { ok: true, message: "already running" };
  }
  const indexPath = path.join(abs(bot.botDir), "src", "index.js");
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Bot entry not found: ${indexPath}`);
  }
  const child = spawn(process.execPath, [indexPath], {
    cwd: abs(bot.botDir),
    env: { ...process.env },
    stdio: "ignore",
    detached: process.platform !== "win32",
    windowsHide: true,
  });
  child.unref();
  processes.set(bot.id, { pid: child.pid, proc: child });
  child.on("exit", () => processes.delete(bot.id));
  return { ok: true, pid: child.pid };
}

function stopProcess(botId) {
  const entry = processes.get(botId);
  if (!entry) return { ok: true, message: "not running locally" };
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(entry.pid), "/f", "/t"], {
        stdio: "ignore",
      });
    } else {
      process.kill(-entry.pid, "SIGTERM");
    }
  } catch {
  }
  processes.delete(botId);
  return { ok: true };
}

async function startBot(id) {
  const bot = getBot(id);
  if (controlMode === "docker") {
    await dockerAction(bot.service, "start");
    return { ok: true, mode: "docker" };
  }
  return startProcess(bot);
}

async function stopBot(id) {
  const bot = getBot(id);
  if (controlMode === "docker") {
    await dockerAction(bot.service, "stop");
    return { ok: true, mode: "docker" };
  }
  return stopProcess(id);
}

async function restartBot(id) {
  await stopBot(id);
  await new Promise((r) => setTimeout(r, 1500));
  return startBot(id);
}

module.exports = {
  getBot,
  listBots,
  getBotStatus,
  startBot,
  stopBot,
  restartBot,
  readEnvValue,
};
