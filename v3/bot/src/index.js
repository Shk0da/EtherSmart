const config = require("./config");
const { createBotRunner } = require("@ethersmart/bot-core");
const { buildPlanForOpportunity } = require("./txBuilder");

createBotRunner({
  config,
  buildPlanForOpportunity,
  extraLogFields: { useV3Legs: config.useV3Legs },
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
