const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const stateDir = path.join(repoRoot, ".ethersmart");
const pidDir = path.join(stateDir, "pids");
const logDir = path.join(stateDir, "logs");

const BOT_IDS = ["v2", "v3", "v4", "v5"];

const SERVICES = {
  api: {
    id: "api",
    label: "Control plane API",
    port: 3001,
    url: "http://127.0.0.1:3001/api/health",
    cwd: path.join(repoRoot, "packages", "control-plane"),
    args: ["run", "start"],
    logFile: "api.log",
    dockerService: "control-plane",
  },
  ui: {
    id: "ui",
    label: "Dashboard UI",
    port: 3000,
    url: "http://127.0.0.1:3000",
    cwd: path.join(repoRoot, "packages", "dashboard-ui"),
    args: ["run", "dev"],
    logFile: "ui.log",
    dockerService: "dashboard",
  },
};

const ALIASES = {
  control: "api",
  "control-plane": "api",
  cp: "api",
  dashboard: "ui",
  panel: "ui",
};

const GROUPS = {
  stack: ["api", "ui"],
  bots: BOT_IDS,
  all: ["api", "ui", ...BOT_IDS],
};

module.exports = {
  repoRoot,
  stateDir,
  pidDir,
  logDir,
  BOT_IDS,
  SERVICES,
  ALIASES,
  GROUPS,
  composeFile: path.join(repoRoot, "docker-compose.yml"),
};
