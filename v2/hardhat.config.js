require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL || "";
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const DEPLOYER_PK = process.env.DEPLOYER_PK || process.env.BOT_PK || "";
const FORK_BLOCK = process.env.FORK_BLOCK
  ? parseInt(process.env.FORK_BLOCK, 10)
  : 19000000;

const deployerAccounts = DEPLOYER_PK ? [DEPLOYER_PK] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.21",
    settings: {
      viaIR: true,
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      forking: MAINNET_RPC_URL
        ? { url: MAINNET_RPC_URL, blockNumber: FORK_BLOCK }
        : undefined,
    },
    sepolia: { url: SEPOLIA_RPC_URL, accounts: deployerAccounts },
    mainnet: { url: MAINNET_RPC_URL, accounts: deployerAccounts },
  },
  etherscan: { apiKey: process.env.ETHERSCAN_API_KEY || "" },
  mocha: { timeout: 120000 },
};
