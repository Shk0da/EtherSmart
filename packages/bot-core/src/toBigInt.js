const { ethers } = require("ethers");

function toBigInt(value) {
  if (value === null || value === undefined) return 0n;
  if (typeof value === "bigint") return value;
  if (ethers.BigNumber.isBigNumber(value)) return BigInt(value.toString());
  return BigInt(value);
}

module.exports = { toBigInt };
