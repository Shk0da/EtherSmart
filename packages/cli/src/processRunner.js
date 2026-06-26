const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
const { logDir, repoRoot } = require("./config");
const pidStore = require("./pidStore");

function ensureLogDir() {
  fs.mkdirSync(logDir, { recursive: true });
}

function resolveNpmSpawn(npmArgs) {
  const npmExec = process.env.npm_execpath;
  if (npmExec && fs.existsSync(npmExec)) {
    return { command: process.execPath, args: [npmExec, ...npmArgs] };
  }

  const npmCli = path.join(
    path.dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js"
  );
  if (fs.existsSync(npmCli)) {
    return { command: process.execPath, args: [npmCli, ...npmArgs] };
  }

  const isWin = process.platform === "win32";
  return {
    command: isWin ? "npm.cmd" : "npm",
    args: npmArgs,
    shell: isWin,
  };
}

function resolveViteEntry(cwd) {
  const candidates = [
    path.join(cwd, "node_modules", "vite", "bin", "vite.js"),
    path.join(repoRoot, "node_modules", "vite", "bin", "vite.js"),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function resolveServiceSpawn(service) {
  if (service.id === "api") {
    const entry = path.join(service.cwd, "src", "index.js");
    if (fs.existsSync(entry)) {
      return { command: process.execPath, args: [entry] };
    }
  }

  if (service.id === "ui") {
    const viteEntry = resolveViteEntry(service.cwd);
    if (viteEntry) {
      return { command: process.execPath, args: [viteEntry] };
    }
  }

  return resolveNpmSpawn(service.args);
}

function readLogTail(logPath, lines = 10) {
  if (!fs.existsSync(logPath)) return "";
  return fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean).slice(-lines).join("\n");
}

async function isPortListening(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(1500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

function portInUseHint(port) {
  const win = process.platform === "win32";
  return win
    ? `  netstat -ano | findstr :${port}`
    : `  lsof -i :${port}`;
}

async function probeService(service) {
  try {
    const res = await fetch(service.url, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return false;
    if (service.id === "api") {
      const body = await res.json();
      return body?.ok === true && body?.service === "control-plane";
    }
    const type = res.headers.get("content-type") || "";
    if (type.includes("text/html")) return true;
    const text = await res.text();
    return text.includes("<!DOCTYPE html") || text.includes('id="root"');
  } catch {
    return false;
  }
}

async function assertPortAvailable(service) {
  const listening = await isPortListening(service.port);
  if (!listening) return;

  if (await probeService(service)) {
    if (pidStore.isRunning(service.id)) return;
    throw new Error(
      `${service.label} already responds on port ${service.port} (external process).\n` +
        `Stop it first:\n${portInUseHint(service.port)}`
    );
  }

  throw new Error(
    `Port ${service.port} is in use by another process (not ${service.label}).\n` +
      `This often causes "Internal Server Error" in the UI.\n` +
      `Free the port, then retry:\n${portInUseHint(service.port)}`
  );
}

function startService(service) {
  if (pidStore.isRunning(service.id)) {
    return { ok: true, message: "already running", pid: pidStore.read(service.id)?.pid };
  }

  ensureLogDir();
  const logPath = path.join(logDir, service.logFile);
  const out = fs.openSync(logPath, "a");
  const { command, args, shell = false } = resolveServiceSpawn(service);

  const child = spawn(command, args, {
    cwd: service.cwd,
    env: { ...process.env, FORCE_COLOR: "0" },
    detached: true,
    stdio: ["ignore", out, out],
    windowsHide: true,
    shell,
  });

  child.unref();
  pidStore.write(service.id, {
    pid: child.pid,
    mode: "process",
    startedAt: new Date().toISOString(),
    logFile: logPath,
  });

  return { ok: true, pid: child.pid, logFile: logPath, service };
}

async function verifyServiceStarted(service, { timeoutMs = 8000 } = {}) {
  const logPath = path.join(logDir, service.logFile);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!pidStore.isRunning(service.id)) {
      const tail = readLogTail(logPath);
      throw new Error(
        tail
          ? `Process exited:\n${tail}`
          : `Process exited immediately. See ${logPath}`
      );
    }

    try {
      if (await probeService(service)) {
        if (!pidStore.isRunning(service.id)) {
          const tail = readLogTail(logPath);
          throw new Error(
            `Port ${service.port} is used by another process (ours exited). Stop it or pick another port.\n${tail}`
          );
        }
        return { ok: true };
      }
    } catch (err) {
      if (err.message.includes("Port") || err.message.includes("Process exited")) {
        throw err;
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  const tail = readLogTail(logPath);
  throw new Error(
    tail
      ? `Timed out waiting for ${service.url}:\n${tail}`
      : `Timed out waiting for ${service.url}. Check ${logPath}`
  );
}

function stopService(id) {
  const entry = pidStore.read(id);
  if (!entry) return { ok: true, message: "not running" };

  if (entry.mode === "docker") {
    pidStore.remove(id);
    return { ok: true, message: "docker (use docker mode stop)" };
  }

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
  pidStore.remove(id);
  return { ok: true };
}

module.exports = {
  startService,
  stopService,
  verifyServiceStarted,
  assertPortAvailable,
  probeService,
};
