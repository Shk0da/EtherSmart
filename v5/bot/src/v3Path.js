const { ethers } = require("ethers");

const FEE_3000 = 3000;

function encodeV3Path(tokens, fees) {
  let encoded = "0x";
  for (let i = 0; i < fees.length; i++) {
    encoded += ethers.utils
      .solidityPack(
        ["address", "uint24", "address"],
        [tokens[i], fees[i], tokens[i + 1]]
      )
      .slice(2);
  }
  return encoded;
}

module.exports = { encodeV3Path, FEE_3000 };
