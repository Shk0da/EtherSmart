require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL || "";
const DEPLOYER_PK = process.env.DEPLOYER_PK || process.env.BOT_PK || "";

module.exports = {
  solidity: {
    version: "0.8.21",
    settings: {
      viaIR: true,
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    mainnet: { url: MAINNET_RPC_URL, accounts: DEPLOYER_PK ? [DEPLOYER_PK] : [] },
  },
  mocha: { timeout: 120000 },
};
