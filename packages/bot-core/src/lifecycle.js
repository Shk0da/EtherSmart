// Records bot lifecycle events (start, shutdown, crash) so the dashboard and
// SQLite metrics make it possible to answer "why did the bot stop?".
//
// - bot_started   : process came up (includes restartCount from supervisor)
// - bot_shutdown  : graceful stop via SIGINT/SIGTERM (user-initiated)
// - bot_crashed   : uncaughtException / unhandledRejection -> non-zero exit
function registerLifecycle({
  log,
  metricsStore,
  version,
  proc = process,
  installHandlers = true,
}) {
  const pid = proc.pid;
  const restartCount = parseInt(proc.env?.BOT_RESTART_COUNT || "0", 10);

  function record(type, payload) {
    try {
      metricsStore.record(type, payload);
    } catch {
      /* metrics must never break the bot */
    }
  }

  record("bot_started", { pid, version, restartCount });
  log.info({ pid, version, restartCount }, "bot lifecycle started");

  let fatal = false;
  function handleFatal(scope, err) {
    if (fatal) return;
    fatal = true;
    const error = err && err.message ? err.message : String(err);
    const stack = err && err.stack ? err.stack : null;
    record("bot_crashed", { pid, version, scope, error, stack });
    log.error({ scope, err: error, stack }, "fatal error, bot exiting (1)");
    try {
      metricsStore.close();
    } catch {
      /* ignore */
    }
    proc.exit(1);
  }

  if (installHandlers) {
    proc.on("uncaughtException", (err) => handleFatal("uncaughtException", err));
    proc.on("unhandledRejection", (reason) =>
      handleFatal("unhandledRejection", reason)
    );
  }

  return {
    recordShutdown(signal) {
      record("bot_shutdown", { pid, version, signal });
    },
    handleFatal,
  };
}

module.exports = { registerLifecycle };
