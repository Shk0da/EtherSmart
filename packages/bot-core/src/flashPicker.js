const { ethers } = require("ethers");

const FlashSource = {
  AAVE: 0,
  BALANCER_VAULT: 1,
  UNI_V3_POOL: 2,
};

const PREMIUM_BPS = {
  AAVE: 5n,
  BALANCER_VAULT: 0n,
  UNI_V3_POOL: 0n,
};

function premiumBpsForSource(source) {
  if (source === FlashSource.BALANCER_VAULT) return PREMIUM_BPS.BALANCER_VAULT;
  if (source === FlashSource.UNI_V3_POOL) return PREMIUM_BPS.UNI_V3_POOL;
  return PREMIUM_BPS.AAVE;
}

/**
 * Build amount0/amount1 for Uni V3 pool flash from loan token side.
 */
function buildUniV3FlashAmounts(loanToken, loanAmount, token0, token1) {
  const amount = loanAmount.toString();
  const lt = loanToken.toLowerCase();
  if (lt === token0.toLowerCase()) {
    return { amount0: amount, amount1: "0" };
  }
  if (lt === token1.toLowerCase()) {
    return { amount0: "0", amount1: amount };
  }
  return null;
}

/**
 * Pick flash source aligned with config; validates Uni V3 pool metadata.
 */
function pickFlashSource(config, opportunity) {
  const preferred = config.flashSource ?? FlashSource.AAVE;
  const loanToken = opportunity.loanToken;
  const loanAmount = opportunity.loanAmount;

  if (preferred === FlashSource.UNI_V3_POOL) {
    const meta = config.uniV3FlashMeta || {};
    const pool = config.addresses?.uniV3FlashPool || meta.pool;
    if (!pool || !ethers.utils.isAddress(pool)) {
      throw new Error(
        "FLASH_SOURCE=2 requires addresses.uniV3FlashPool or uniV3FlashMeta.pool"
      );
    }
    const token0 = meta.token0;
    const token1 = meta.token1;
    if (!token0 || !token1) {
      throw new Error(
        "uniV3FlashMeta.token0 and token1 required for Uni V3 pool flash"
      );
    }
    const amounts = buildUniV3FlashAmounts(
      loanToken,
      loanAmount,
      token0,
      token1
    );
    if (!amounts) {
      throw new Error("loanToken is not token0 or token1 of Uni V3 flash pool");
    }
    return {
      source: FlashSource.UNI_V3_POOL,
      flashParams: { pool, ...amounts },
      premiumBps: PREMIUM_BPS.UNI_V3_POOL,
    };
  }

  if (preferred === FlashSource.BALANCER_VAULT) {
    return {
      source: FlashSource.BALANCER_VAULT,
      flashParams: "0x",
      premiumBps: PREMIUM_BPS.BALANCER_VAULT,
    };
  }

  return {
    source: FlashSource.AAVE,
    flashParams: "0x",
    premiumBps: PREMIUM_BPS.AAVE,
  };
}

function encodeFlashParams(flashParams) {
  if (!flashParams || flashParams === "0x") return "0x";
  return ethers.utils.defaultAbiCoder.encode(
    ["address", "uint256", "uint256"],
    [flashParams.pool, flashParams.amount0, flashParams.amount1]
  );
}

module.exports = {
  FlashSource,
  pickFlashSource,
  encodeFlashParams,
  PREMIUM_BPS,
  premiumBpsForSource,
  buildUniV3FlashAmounts,
};
