const config = require("./config");
const { createBotRunner } = require("@ethersmart/bot-core");
const { buildPlanForOpportunity } = require("./txBuilder");

createBotRunner({
  config,
  buildPlanForOpportunity,
  extraLogFields: {
    scanStrategy: config.scanStrategy,
    useMempool: config.useMempool,
    flashSource: config.flashSource,
  },
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
