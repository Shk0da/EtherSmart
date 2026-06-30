function registerShutdown({ log, hooks, onShutdown }) {
  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, "shutting down");
    if (onShutdown) {
      try {
        await onShutdown(signal);
      } catch (err) {
        log.warn({ err: err.message }, "onShutdown failed");
      }
    }
    for (const hook of hooks) {
      try {
        await hook();
      } catch (err) {
        log.warn({ err: err.message }, "shutdown hook failed");
      }
    }
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

module.exports = { registerShutdown };
