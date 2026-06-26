const config = require("./config");
const { createBotRunner } = require("@ethersmart/bot-core");
const { buildPlanForOpportunity } = require("./txBuilder");

createBotRunner({ config, buildPlanForOpportunity }).catch((err) => {
  console.error(err);
  process.exit(1);
});
