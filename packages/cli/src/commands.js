const fs = require("fs");
const path = require("path");
const {
  SERVICES,
  BOT_IDS,
  repoRoot,
} = require("./config");
const { expandTarget, isBot, isService } = require("./targets");
const pidStore = require("./pidStore");
const {
  startService,
  stopService,
  verifyServiceStarted,
  assertPortAvailable,
  probeService,
} = require("./processRunner");
const dockerRunner = require("./dockerRunner");

process.env.REPO_ROOT = repoRoot;
const botManager = require("../../control-plane/src/botManager");
const { BOTS } = require("../../control-plane/src/config");

async function healthCheck(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function statusOne(id, { docker }) {
  if (isService(id)) {
    const svc = SERVICES[id];
    const entry = pidStore.read(id);
    let running = pidStore.isRunning(id);
    let mode = entry?.mode || "stopped";

    if (docker && svc.dockerService) {
      const ds = await dockerRunner.dockerPs(svc.dockerService);
      running = ds.running;
      mode = "docker";
    } else if (running && mode === "process") {
      const healthy = await healthCheck(svc.url);
      return {
        id,
        label: svc.label,
        running: true,
        healthy,
        mode,
        port: svc.port,
        pid: entry?.pid,
        logFile: entry?.logFile,
      };
    }

    const healthy = running ? await healthCheck(svc.url) : false;
    return {
      id,
      label: svc.label,
      running,
      healthy,
      mode,
      port: svc.port,
      pid: entry?.pid ?? null,
      logFile: entry?.logFile,
    };
  }

  if (isBot(id)) {
    const bot = BOTS.find((b) => b.id === id);
    const st = await botManager.getBotStatus(bot);
    return {
      id,
      label: bot.label,
      running: st.runtime?.running,
      healthy: st.health?.ok ?? false,
      mode: st.runtime?.mode,
      port: bot.healthPort,
      dryRun: st.dryRun,
      contract: st.contract || null,
    };
  }

  return { id, running: false };
}

async function cmdStatus(targets, opts) {
  const ids =
    targets.length > 0
      ? targets.flatMap((t) => expandTarget(t))
      : [...BOT_IDS, "api", "ui"];

  const rows = [];
  for (const id of ids) {
    rows.push(await statusOne(id, opts));
  }

  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  console.log("\nEtherSmart status\n");
  for (const r of rows) {
    const state = r.running
      ? r.healthy
        ? "RUNNING"
        : "UP (unhealthy)"
      : "STOPPED";
    const extra = [
      r.mode && `mode=${r.mode}`,
      r.port && `:${r.port}`,
      r.pid && `pid=${r.pid}`,
      r.dryRun != null && `DRY_RUN=${r.dryRun}`,
    ]
      .filter(Boolean)
      .join(" ");
    console.log(`  ${r.id.padEnd(5)} ${state.padEnd(14)} ${r.label}`);
    if (extra) console.log(`         ${extra}`);
  }
  console.log("");
}

async function startBot(id, docker) {
  if (docker) {
    const bot = BOTS.find((b) => b.id === id);
    return dockerRunner.startDocker(bot.service, id);
  }
  return botManager.startBot(id);
}

async function stopBot(id, docker) {
  if (docker) {
    const bot = BOTS.find((b) => b.id === id);
    await dockerRunner.stopDocker(bot.service, id);
    return { ok: true };
  }
  return botManager.stopBot(id);
}

async function cmdStart(targets, opts) {
  const ids = [...new Set(targets.flatMap((t) => expandTarget(t)))];
  const results = [];

  for (const id of ids) {
    let result;
    if (isService(id)) {
      const svc = SERVICES[id];
      if (opts.docker) {
        result = await dockerRunner.startDocker(svc.dockerService, id);
      } else if (pidStore.isRunning(id) && (await probeService(svc))) {
        result = {
          ok: true,
          message: "already running",
          pid: pidStore.read(id)?.pid,
        };
      } else {
        await assertPortAvailable(svc);
        result = startService(svc);
        await verifyServiceStarted(svc);
      }
    } else if (isBot(id)) {
      result = await startBot(id, opts.docker);
    }
    results.push({ id, action: "start", ...result });
  }

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  for (const r of results) {
    const msg = r.message || (r.pid ? `pid ${r.pid}` : r.service || "ok");
    console.log(`started ${r.id}: ${msg}`);
    if (r.logFile) console.log(`  log: ${r.logFile}`);
  }
}

async function cmdStop(targets, opts) {
  const ids = [...new Set(targets.flatMap((t) => expandTarget(t)))].reverse();

  for (const id of ids) {
    if (isService(id)) {
      const svc = SERVICES[id];
      if (opts.docker) {
        await dockerRunner.stopDocker(svc.dockerService, id);
      } else {
        stopService(id);
      }
    } else if (isBot(id)) {
      await stopBot(id, opts.docker);
    }
    if (!opts.json) console.log(`stopped ${id}`);
  }
}

async function cmdRestart(targets, opts) {
  await cmdStop(targets, opts);
  await new Promise((r) => setTimeout(r, 1500));
  await cmdStart(targets, opts);
}

function cmdLogs(target, opts) {
  const id = expandTarget(target)[0];
  if (!isService(id)) {
    throw new Error(`logs only for api/ui, got: ${target}`);
  }
  const entry = pidStore.read(id);
  const logFile =
    entry?.logFile || path.join(require("./config").logDir, SERVICES[id].logFile);
  if (!fs.existsSync(logFile)) {
    console.log(`No log file: ${logFile}`);
    return;
  }
  const lines = fs.readFileSync(logFile, "utf8").split("\n");
  const tail = lines.slice(-opts.lines).join("\n");
  console.log(tail);
}

function printHelp() {
  console.log(`
EtherSmart CLI — manage bots, control-plane, and dashboard UI

Usage:
  ethersmart <command> [target...] [options]

Commands:
  status [targets...]     Show status (default: all)
  start  <target...>      Start service(s)
  stop   <target...>      Stop service(s)
  restart <target...>     Restart service(s)
  logs   <api|ui>         Tail process logs (--lines 50)

Targets:
  v2, v3, v4, v5         Bot versions
  api, ui                 Control plane (:3001) and dashboard (:3000)
  stack                   api + ui
  bots                    v2–v5
  all                     api + ui + v2–v5

Aliases:
  control-plane, dashboard, panel → api/ui

Options:
  --docker                Use docker compose instead of local processes
  --json                  JSON output
  --lines <n>             Log tail length (default 50)
  -h, --help

Examples:
  npm run es -- status
  npm run es -- start stack
  npm run es -- start v5
  npm run es -- start bots
  npm run es -- stop v5
  npm run es -- --docker start v5
  npm run es -- logs api
`);
}

function parseArgs(argv) {
  const opts = { docker: false, json: false, lines: 50, help: false };
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") opts.help = true;
    else if (a === "--docker") opts.docker = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--lines") opts.lines = parseInt(argv[++i], 10) || 50;
    else if (!a.startsWith("-")) positional.push(a);
  }

  const command = positional[0];
  const targets = positional.slice(1);
  return { command, targets, opts };
}

async function run(argv) {
  const { command, targets, opts } = parseArgs(argv);

  if (opts.help || !command || command === "help") {
    printHelp();
    return 0;
  }

  switch (command) {
    case "status":
      await cmdStatus(targets, opts);
      break;
    case "start":
      if (targets.length === 0) throw new Error("start requires a target");
      await cmdStart(targets, opts);
      break;
    case "stop":
      if (targets.length === 0) throw new Error("stop requires a target");
      await cmdStop(targets, opts);
      break;
    case "restart":
      if (targets.length === 0) throw new Error("restart requires a target");
      await cmdRestart(targets, opts);
      break;
    case "logs":
      if (targets.length !== 1) throw new Error("logs requires exactly one target");
      cmdLogs(targets[0], opts);
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
  return 0;
}

module.exports = { run, parseArgs };
