const config = require("./config");
const { createBotRunner } = require("@ethersmart/bot-core");
const { buildPlanForOpportunity } = require("./txBuilder");
const { validateV5Config } = require("./validateChecks");

createBotRunner({
  config,
  buildPlanForOpportunity,
  extraValidateChecks: [validateV5Config],
  extraLogFields: {
    graphEdges: config.graphEdges.length,
    useMempool: config.useMempool,
  },
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
