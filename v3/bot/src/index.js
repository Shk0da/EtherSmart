const config = require("./config");
const { createBotRunner } = require("@ethersmart/bot-core");
const { buildPlanForOpportunity } = require("./txBuilder");
const { refineOpportunityFinalOut } = require("./scanRefine");

createBotRunner({
  config,
  buildPlanForOpportunity,
  refineOpportunityFinalOut: config.useV3Legs
    ? refineOpportunityFinalOut
    : null,
  extraLogFields: { useV3Legs: config.useV3Legs },
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
