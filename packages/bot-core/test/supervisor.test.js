const { describe, it } = require("node:test");
const assert = require("node:assert");
const { EventEmitter } = require("events");
const {
  runSupervisor,
  shouldRestart,
  nextBackoff,
  readOptions,
} = require("../src/supervisor");

describe("shouldRestart", () => {
  it("does not restart when stopping (user stop)", () => {
    assert.equal(shouldRestart({ stopping: true, code: 1 }), false);
  });
  it("does not restart on graceful exit code 0", () => {
    assert.equal(shouldRestart({ stopping: false, code: 0 }), false);
  });
  it("restarts on crash (non-zero code)", () => {
    assert.equal(shouldRestart({ stopping: false, code: 1 }), true);
  });
  it("restarts on signal kill (null code)", () => {
    assert.equal(shouldRestart({ stopping: false, code: null }), true);
  });
});

describe("nextBackoff", () => {
  it("grows exponentially from base", () => {
    assert.equal(nextBackoff(1, { base: 2000, max: 30000 }), 2000);
    assert.equal(nextBackoff(2, { base: 2000, max: 30000 }), 4000);
    assert.equal(nextBackoff(3, { base: 2000, max: 30000 }), 8000);
  });
  it("caps at max", () => {
    assert.equal(nextBackoff(20, { base: 2000, max: 30000 }), 30000);
  });
});

describe("readOptions", () => {
  it("uses defaults", () => {
    const o = readOptions({});
    assert.equal(o.maxRestarts, 10);
    assert.equal(o.base, 2000);
  });
  it("reads env overrides", () => {
    const o = readOptions({ BOT_MAX_RESTARTS: "3", BOT_RESTART_BACKOFF_MS: "500" });
    assert.equal(o.maxRestarts, 3);
    assert.equal(o.base, 500);
  });
});

function harness() {
  const spawned = [];
  const timers = [];
  const proc = {
    execPath: "node",
    cwd: () => "/repo",
    signals: {},
    exitCode: undefined,
    on(sig, fn) {
      this.signals[sig] = fn;
    },
    exit(code) {
      this.exitCode = code;
    },
  };
  function spawnFn(execPath, args, opts) {
    const child = new EventEmitter();
    child.kill = (sig) => {
      child.killed = sig;
    };
    spawned.push({ args, opts, child });
    return child;
  }
  function setTimer(fn) {
    timers.push(fn);
    return fn;
  }
  return { spawned, timers, proc, spawnFn, setTimer };
}

describe("runSupervisor", () => {
  it("restarts the child after a crash with incremented restart count", () => {
    const h = harness();
    runSupervisor({
      entry: "/repo/v2/bot/src/index.js",
      cwd: "/repo/v2/bot",
      env: { BOT_RESTART_BACKOFF_MS: "10" },
      spawnFn: h.spawnFn,
      proc: h.proc,
      setTimer: h.setTimer,
    });
    assert.equal(h.spawned.length, 1);
    assert.equal(h.spawned[0].opts.env.BOT_RESTART_COUNT, "0");

    h.spawned[0].child.emit("exit", 1, null);
    assert.equal(h.proc.exitCode, undefined, "should not exit on crash");
    assert.equal(h.timers.length, 1, "restart scheduled");

    h.timers[0]();
    assert.equal(h.spawned.length, 2);
    assert.equal(h.spawned[1].opts.env.BOT_RESTART_COUNT, "1");
  });

  it("does not restart on graceful exit 0", () => {
    const h = harness();
    runSupervisor({
      entry: "/x.js",
      spawnFn: h.spawnFn,
      proc: h.proc,
      setTimer: h.setTimer,
      env: {},
    });
    h.spawned[0].child.emit("exit", 0, null);
    assert.equal(h.proc.exitCode, 0);
    assert.equal(h.spawned.length, 1);
  });

  it("does not restart after a user stop signal", () => {
    const h = harness();
    runSupervisor({
      entry: "/x.js",
      spawnFn: h.spawnFn,
      proc: h.proc,
      setTimer: h.setTimer,
      env: {},
    });
    h.proc.signals.SIGTERM();
    assert.equal(h.spawned[0].child.killed, "SIGTERM");
    h.spawned[0].child.emit("exit", null, "SIGTERM");
    assert.equal(h.proc.exitCode, 0);
    assert.equal(h.spawned.length, 1, "no restart after user stop");
  });
});
