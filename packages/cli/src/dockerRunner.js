const { execFile } = require("child_process");
const { promisify } = require("util");
const { repoRoot, composeFile } = require("./config");
const pidStore = require("./pidStore");

const execFileAsync = promisify(execFile);

async function dockerCompose(args) {
  const { stdout, stderr } = await execFileAsync(
    "docker",
    ["compose", "-f", composeFile, ...args],
    { cwd: repoRoot, timeout: 120000 }
  );
  return (stdout || stderr || "").trim();
}

async function startDocker(serviceName, id) {
  await dockerCompose(["up", "-d", serviceName]);
  pidStore.write(id, {
    pid: null,
    mode: "docker",
    dockerService: serviceName,
    startedAt: new Date().toISOString(),
  });
  return { ok: true, mode: "docker", service: serviceName };
}

async function stopDocker(serviceName, id) {
  await dockerCompose(["stop", serviceName]);
  pidStore.remove(id);
  return { ok: true, mode: "docker" };
}

async function dockerPs(serviceName) {
  try {
    const out = await dockerCompose([
      "ps",
      "--format",
      "json",
      serviceName,
    ]);
    if (!out) return { running: false };
    const line = out.split("\n").find(Boolean);
    if (!line) return { running: false };
    const info = JSON.parse(line);
    const state = info.State || info.Status || "";
    return { running: /running/i.test(state), state };
  } catch {
    return { running: false, state: "unknown" };
  }
}

module.exports = { startDocker, stopDocker, dockerPs, dockerCompose };
