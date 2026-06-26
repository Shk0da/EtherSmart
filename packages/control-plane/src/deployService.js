const { spawn } = require("child_process");
const { v4: uuidv4 } = require("uuid");
const { BOTS, repoRoot } = require("./config");

/** @type {Map<string, object>} */
const jobs = new Map();
const MAX_JOBS = 20;

function hasRunningDeploy() {
  for (const j of jobs.values()) {
    if (j.status === "running") return true;
  }
  return false;
}

function pruneJobs() {
  if (jobs.size <= MAX_JOBS) return;
  const sorted = [...jobs.entries()].sort(
    (a, b) => a[1].createdAt - b[1].createdAt
  );
  while (jobs.size > MAX_JOBS) {
    jobs.delete(sorted.shift()[0]);
  }
}

function getJob(id) {
  const job = jobs.get(id);
  if (!job) throw new Error(`Job not found: ${id}`);
  return job;
}

function listJobs() {
  return [...jobs.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((j) => ({
      id: j.id,
      version: j.version,
      status: j.status,
      createdAt: j.createdAt,
      finishedAt: j.finishedAt,
      exitCode: j.exitCode,
      logLines: j.log.length,
    }));
}

function runJob(version, { compileFirst = true } = {}) {
  const bot = BOTS.find((b) => b.id === version);
  if (!bot) throw new Error(`Unknown version: ${version}`);
  if (hasRunningDeploy()) throw new Error("Deploy already in progress");

  pruneJobs();

  const id = uuidv4();
  const job = {
    id,
    version,
    status: "running",
    createdAt: Date.now(),
    finishedAt: null,
    exitCode: null,
    log: [],
  };
  jobs.set(id, job);

  const isWin = process.platform === "win32";
  const cmd = isWin ? "npm.cmd" : "npm";

  function runDeploy() {
    const child = spawn(cmd, ["run", bot.deployScript], {
      cwd: repoRoot,
      env: { ...process.env },
      shell: isWin,
    });

    child.stdout.on("data", (d) => {
      const lines = d.toString().split("\n").filter(Boolean);
      job.log.push(...lines);
    });
    child.stderr.on("data", (d) => {
      const lines = d.toString().split("\n").filter(Boolean);
      job.log.push(...lines.map((l) => `[stderr] ${l}`));
    });
    child.on("close", (code) => {
      job.status = code === 0 ? "completed" : "failed";
      job.exitCode = code;
      job.finishedAt = Date.now();
    });
  }

  if (compileFirst) {
    const compileChild = spawn(cmd, ["run", bot.compileScript], {
      cwd: repoRoot,
      env: { ...process.env },
      shell: isWin,
    });
    compileChild.stdout.on("data", (d) => {
      job.log.push(...d.toString().split("\n").filter(Boolean));
    });
    compileChild.stderr.on("data", (d) => {
      job.log.push(
        ...d.toString().split("\n").filter(Boolean).map((l) => `[stderr] ${l}`)
      );
    });
    compileChild.on("close", (code) => {
      if (code !== 0) {
        job.status = "failed";
        job.exitCode = code;
        job.finishedAt = Date.now();
        return;
      }
      job.log.push("--- compile ok, starting deploy ---");
      runDeploy();
    });
  } else {
    runDeploy();
  }

  return { id, status: "running" };
}

function getJobDetail(id) {
  const job = getJob(id);
  return {
    id: job.id,
    version: job.version,
    status: job.status,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
    exitCode: job.exitCode,
    log: job.log,
  };
}

module.exports = { runJob, listJobs, getJobDetail, hasRunningDeploy };
