const fs = require("fs");
const { ethers } = require("ethers");

function validateConfig(config, extraChecks = []) {
  const errors = [];

  if (!config.wsUrl) errors.push("WS_URL is required");
  if (!config.rpcUrl) errors.push("MAINNET_RPC_URL (or RPC_URL) is required");
  if (!config.privateKey) errors.push("BOT_PK (or DEPLOYER_PK) is required");
  if (!config.contractAddress) errors.push("ARB_CONTRACT is required");
  if (!ethers.utils.isAddress(config.contractAddress)) {
    errors.push("ARB_CONTRACT is not a valid address");
  }
  if (!Number.isInteger(config.chainId) || config.chainId <= 0) {
    errors.push("CHAIN_ID must be a positive integer");
  }
  if (config.slippageBps < 0 || config.slippageBps > 2000) {
    errors.push("SLIPPAGE_BPS must be between 0 and 2000");
  }
  if (config.minProfitBps < 0 || config.minProfitBps > 5000) {
    errors.push("MIN_PROFIT_BPS must be between 0 and 5000");
  }
  if (config.multiBlockTargets < 1 || config.multiBlockTargets > 5) {
    errors.push("MULTI_BLOCK_TARGETS must be between 1 and 5");
  }
  if (!fs.existsSync(config.artifactPath)) {
    errors.push(
      `Contract artifact not found: ${config.artifactPath} — run "npx hardhat compile" in the parent folder`
    );
  }

  for (const check of extraChecks) {
    const msg = check(config);
    if (msg) errors.push(msg);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid configuration:\n- ${errors.join("\n- ")}`);
  }
}

module.exports = { validateConfig };
