const { ethers } = require("ethers");
const config = require("./config");
const { encodeV3Path } = require("./v3Path");

const QUOTER_ABI = [
  "function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)",
];

/**
 * Quote Uniswap V3 exactInput via QuoterV2 staticcall.
 * @returns {bigint | null} amountOut or null on failure
 */
async function quoteV3ExactInput(provider, path, amountIn) {
  const quoter = new ethers.Contract(
    config.addresses.uniV3Quoter,
    QUOTER_ABI,
    provider
  );

  try {
    const result = await quoter.callStatic.quoteExactInput(path, amountIn);
    const amountOut = Array.isArray(result) ? result[0] : result.amountOut;
    return BigInt(amountOut.toString());
  } catch {
    return null;
  }
}

module.exports = { quoteV3ExactInput, encodeV3Path };
