const fs = require("fs");
const path = require("path");
const pino = require("pino");

function createLogger(config) {
  fs.mkdirSync(config.logDir, { recursive: true });
  const transport = pino.transport({
    targets: [
      {
        target: "pino/file",
        options: { destination: 1 },
        level: "info",
      },
      {
        target: "pino-roll",
        options: {
          file: path.join(config.logDir, "bot"),
          frequency: "daily",
          mkdir: true,
        },
        level: "debug",
      },
    ],
  });
  return pino({ level: process.env.LOG_LEVEL || "info" }, transport);
}

module.exports = { createLogger };
