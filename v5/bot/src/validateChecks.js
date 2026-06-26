const { ethers } = require("ethers");

function validateV5Config(config) {
  if (!config.graphEdges || config.graphEdges.length === 0) {
    return "graphEdges must not be empty for V5 graph scan";
  }
  if (!config.graphLoanToken || !ethers.utils.isAddress(config.graphLoanToken)) {
    return "graphLoanToken must be a valid address";
  }
  if (!config.addresses?.multicall3) {
    return "addresses.multicall3 is required";
  }
  const fs = config.flashSource ?? 0;
  if (![0, 1, 2].includes(fs)) {
    return "FLASH_SOURCE must be 0 (Aave), 1 (Balancer), or 2 (Uni V3 pool)";
  }
  if (fs === 2) {
    const pool =
      config.addresses?.uniV3FlashPool || config.uniV3FlashMeta?.pool;
    if (!pool || !ethers.utils.isAddress(pool)) {
      return "FLASH_SOURCE=2 requires UNI_V3_FLASH_POOL / uniV3FlashMeta.pool";
    }
    const meta = config.uniV3FlashMeta || {};
    if (!meta.token0 || !meta.token1) {
      return "uniV3FlashMeta.token0 and token1 required when FLASH_SOURCE=2";
    }
    const lt = config.graphLoanToken.toLowerCase();
    if (
      lt !== meta.token0.toLowerCase() &&
      lt !== meta.token1.toLowerCase()
    ) {
      return "graphLoanToken must match uniV3FlashMeta.token0 or token1";
    }
  }
  return null;
}

module.exports = { validateV5Config };
