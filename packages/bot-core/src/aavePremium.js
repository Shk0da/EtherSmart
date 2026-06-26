const { ethers } = require("ethers");

const AAVE_POOL_ABI = [
  "function FLASHLOAN_PREMIUM_TOTAL() external view returns (uint128)",
];

const DEFAULT_PREMIUM_BPS = 5n;
const CACHE_MS = 60_000;

/** @type {{ bps: bigint | null, fetchedAt: number, pool: string | null }} */
const cache = { bps: null, fetchedAt: 0, pool: null };

async function fetchAavePremiumBps(provider, poolAddress) {
  if (!poolAddress || !ethers.utils.isAddress(poolAddress)) {
    return DEFAULT_PREMIUM_BPS;
  }

  const now = Date.now();
  const poolKey = poolAddress.toLowerCase();
  if (
    cache.bps !== null &&
    cache.pool === poolKey &&
    now - cache.fetchedAt < CACHE_MS
  ) {
    return cache.bps;
  }

  try {
    const pool = new ethers.Contract(poolAddress, AAVE_POOL_ABI, provider);
    const raw = await pool.FLASHLOAN_PREMIUM_TOTAL();
    cache.bps = BigInt(raw.toString());
    cache.pool = poolKey;
    cache.fetchedAt = now;
    return cache.bps;
  } catch {
    return DEFAULT_PREMIUM_BPS;
  }
}

function clearAavePremiumCache() {
  cache.bps = null;
  cache.fetchedAt = 0;
  cache.pool = null;
}

module.exports = { fetchAavePremiumBps, clearAavePremiumCache, DEFAULT_PREMIUM_BPS };
