// Auto-restart supervisor for bot processes.
//
// Launches the real bot entry as a child and restarts it ONLY when it crashed
// (non-zero / signal exit) and the supervisor itself was not asked to stop.
//
// Distinguishing a crash from a user stop:
//   - User stop (CLI/dashboard) on Windows uses `taskkill /t` which kills the
//     whole tree (supervisor + child) -> supervisor never restarts.
//   - User stop on Unix sends SIGTERM to the process group -> the supervisor
//     receives it, sets `stopping`, forwards it to the child, and exits.
//   - Graceful self-exit (exit code 0) is treated as intentional -> no restart.
//   - Any other exit while not stopping is a crash -> restart with backoff.
const { spawn } = require("child_process");

function shouldRestart({ stopping, code }) {
  if (stopping) return false;
  if (code === 0) return false;
  return true;
}

function nextBackoff(restarts, { base, max }) {
  const n = Math.max(1, restarts);
  return Math.min(base * 2 ** (n - 1), max);
}

function readOptions(env) {
  return {
    maxRestarts: parseInt(env.BOT_MAX_RESTARTS || "10", 10),
    resetMs: parseInt(env.BOT_RESTART_RESET_MS || "60000", 10),
    base: parseInt(env.BOT_RESTART_BACKOFF_MS || "2000", 10),
    max: parseInt(env.BOT_RESTART_MAX_BACKOFF_MS || "30000", 10),
  };
}

function runSupervisor({
  entry,
  cwd,
  env = process.env,
  spawnFn = spawn,
  proc = process,
  setTimer = setTimeout,
} = {}) {
  if (!entry) throw new Error("supervisor: entry path is required");
  const opts = readOptions(env);

  let stopping = false;
  let restarts = 0;
  let child = null;

  function start() {
    const startedAt = Date.now();
    child = spawnFn(proc.execPath, [entry], {
      cwd: cwd || proc.cwd(),
      env: { ...env, BOT_RESTART_COUNT: String(restarts) },
      stdio: "inherit",
    });

    child.on("exit", (code, signal) => {
      if (!shouldRestart({ stopping, code })) {
        proc.exit(stopping ? 0 : code == null ? 0 : code);
        return;
      }
      // A child that survived long enough resets the crash counter so that a
      // single later crash doesn't immediately exhaust the retry budget.
      if (Date.now() - startedAt > opts.resetMs) restarts = 0;
      restarts += 1;
      if (restarts > opts.maxRestarts) {
        console.error(
          `[supervisor] ${entry} crashed ${restarts} times, giving up`
        );
        proc.exit(1);
        return;
      }
      const delay = nextBackoff(restarts, opts);
      console.error(
        `[supervisor] child exited code=${code} signal=${signal}; restart #${restarts} in ${delay}ms`
      );
      setTimer(start, delay);
    });
  }

  function forward(signal) {
    stopping = true;
    if (child) {
      try {
        child.kill(signal);
      } catch {
        /* ignore */
      }
    }
  }

  proc.on("SIGINT", () => forward("SIGINT"));
  proc.on("SIGTERM", () => forward("SIGTERM"));

  start();
  return { forward, getRestarts: () => restarts };
}

if (require.main === module) {
  const entry = process.argv[2];
  const cwd = process.argv[3];
  if (!entry) {
    console.error("usage: node supervisor.js <entry.js> [cwd]");
    process.exit(1);
  }
  runSupervisor({ entry, cwd });
}

module.exports = { runSupervisor, shouldRestart, nextBackoff, readOptions };
