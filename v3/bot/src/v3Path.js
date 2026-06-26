const { ethers } = require("ethers");

const LegKind = { V2: 0, V3: 1 };

/** Encode Uniswap V3 path: tokenIn + fee + tokenOut (+ fee + token ...). */
function encodeV3Path(tokens, fees) {
  if (tokens.length !== fees.length + 1) {
    throw new Error("encodeV3Path: tokens.length must be fees.length + 1");
  }
  const types = ["address"];
  const values = [tokens[0]];
  for (let i = 0; i < fees.length; i++) {
    types.push("uint24", "address");
    values.push(fees[i], tokens[i + 1]);
  }
  return ethers.utils.solidityPack(types, values);
}

module.exports = { LegKind, encodeV3Path };
