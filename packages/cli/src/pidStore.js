const fs = require("fs");
const path = require("path");
const { pidDir } = require("./config");

function ensureDir() {
  fs.mkdirSync(pidDir, { recursive: true });
}

function pidPath(id) {
  return path.join(pidDir, `${id}.json`);
}

function read(id) {
  const p = pidPath(id);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function write(id, data) {
  ensureDir();
  fs.writeFileSync(pidPath(id), JSON.stringify({ ...data, id }, null, 2));
}

function remove(id) {
  const p = pidPath(id);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isRunning(id) {
  const entry = read(id);
  if (!entry) return false;
  if (entry.mode === "docker") return true;
  if (!isAlive(entry.pid)) {
    remove(id);
    return false;
  }
  return true;
}

module.exports = { read, write, remove, isAlive, isRunning, pidPath };
