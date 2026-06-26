const config = require("./config");
const { createBotRunner } = require("@ethersmart/bot-core");
const { buildPlanForOpportunity } = require("./txBuilder");

function validateV4FlashSource(cfg) {
  const src = cfg.flashSource ?? 0;
  if (src !== 0 && src !== 1) {
    return "FLASH_SOURCE must be 0 (Aave) or 1 (Balancer) for V4";
  }
  return null;
}

createBotRunner({
  config,
  buildPlanForOpportunity,
  extraValidateChecks: [validateV4FlashSource],
  extraLogFields: {
    scanStrategy: config.scanStrategy,
    useMempool: config.useMempool,
    flashSource: config.flashSource,
  },
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
