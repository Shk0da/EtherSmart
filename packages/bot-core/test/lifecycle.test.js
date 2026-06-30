const { describe, it } = require("node:test");
const assert = require("node:assert");
const { registerLifecycle } = require("../src/lifecycle");

function fakeStore() {
  const events = [];
  return {
    events,
    record(type, payload) {
      events.push({ type, payload });
    },
    close() {
      events.push({ type: "__closed__" });
    },
  };
}

const noopLog = { info() {}, warn() {}, error() {} };

function fakeProc(overrides = {}) {
  return {
    pid: 4242,
    env: {},
    on() {},
    exit() {},
    ...overrides,
  };
}

describe("registerLifecycle", () => {
  it("records bot_started with pid and restartCount", () => {
    const store = fakeStore();
    const proc = fakeProc({ env: { BOT_RESTART_COUNT: "3" } });
    registerLifecycle({
      log: noopLog,
      metricsStore: store,
      version: "v2",
      proc,
      installHandlers: false,
    });
    const started = store.events.find((e) => e.type === "bot_started");
    assert.ok(started);
    assert.equal(started.payload.pid, 4242);
    assert.equal(started.payload.version, "v2");
    assert.equal(started.payload.restartCount, 3);
  });

  it("records bot_shutdown with the signal", () => {
    const store = fakeStore();
    const lc = registerLifecycle({
      log: noopLog,
      metricsStore: store,
      version: "v5",
      proc: fakeProc(),
      installHandlers: false,
    });
    lc.recordShutdown("SIGTERM");
    const ev = store.events.find((e) => e.type === "bot_shutdown");
    assert.ok(ev);
    assert.equal(ev.payload.signal, "SIGTERM");
  });

  it("records bot_crashed and exits 1 on fatal error", () => {
    const store = fakeStore();
    let exitCode = null;
    const proc = fakeProc({
      exit(code) {
        exitCode = code;
      },
    });
    const lc = registerLifecycle({
      log: noopLog,
      metricsStore: store,
      version: "v4",
      proc,
      installHandlers: false,
    });
    lc.handleFatal("uncaughtException", new Error("boom"));
    const crash = store.events.find((e) => e.type === "bot_crashed");
    assert.ok(crash);
    assert.equal(crash.payload.scope, "uncaughtException");
    assert.equal(crash.payload.error, "boom");
    assert.equal(exitCode, 1);
  });
});
