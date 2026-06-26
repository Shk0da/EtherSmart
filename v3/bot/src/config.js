require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env") });

const path = require("path");
const { ethers } = require("ethers");

const MAINNET = {
  aavePool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
  weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  dai: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  uniV2Router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  sushiRouter: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
  uniV3Router: "0x68b3465833fb72A70eDF967F1a4677710b7893f0",
  uniV3Quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11",
};

const rootDir = path.join(__dirname, "..", "..");

module.exports = {
  version: "v3",
  wsUrl: process.env.WS_URL || "",
  rpcUrl: process.env.MAINNET_RPC_URL || process.env.RPC_URL || "",
  chainId: parseInt(process.env.CHAIN_ID || "1", 10),
  contractAddress: process.env.ARB_CONTRACT || "",
  privateKey: process.env.BOT_PK || "",
  flashbotsAuthKey: process.env.FLASHBOTS_AUTH_PK || "",
  flashbotsRelay:
    process.env.FLASHBOTS_RELAY || "https://relay.flashbots.net",
  dryRun: process.env.DRY_RUN !== "false",
  builderTipWei: process.env.BUILDER_TIP_WEI || "0",
  slippageBps: parseInt(process.env.SLIPPAGE_BPS || "50", 10),
  minProfitBps: parseInt(process.env.MIN_PROFIT_BPS || "10", 10),
  loanAmountUsdc: process.env.LOAN_AMOUNT_USDC || "10000",
  loanSizesUsdc:
    process.env.LOAN_SIZES_USDC ||
    process.env.LOAN_AMOUNT_USDC ||
    "5000,10000,25000",
  estimatedArbGas: parseInt(process.env.ESTIMATED_ARB_GAS || "950000", 10),
  maxGasPriceGwei: parseInt(process.env.MAX_GAS_PRICE_GWEI || "120", 10),
  multiBlockTargets: parseInt(process.env.MULTI_BLOCK_TARGETS || "1", 10),
  healthPort: parseInt(process.env.HEALTH_PORT || "8788", 10),
  healthBind: process.env.HEALTH_BIND || "127.0.0.1",
  healthToken: process.env.HEALTH_TOKEN || "",
  useV3Legs: process.env.USE_V3_LEGS === "true",
  metricsEnabled: process.env.METRICS_ENABLED !== "false",
  metricsDbPath:
    process.env.METRICS_DB_PATH ||
    path.join(rootDir, "logs", "metrics-v3.db"),
  wsHealthIntervalMs: parseInt(
    process.env.WS_HEALTH_INTERVAL_MS || "30000",
    10
  ),
  minEthBalanceWei: ethers.utils.parseEther(
    process.env.MIN_ETH_BALANCE || "0.05"
  ),
  logDir: process.env.LOG_DIR || path.join(rootDir, "logs"),
  addresses: MAINNET,
  pairs: [
    {
      name: "USDC-WETH",
      asset: MAINNET.usdc,
      bridge: MAINNET.weth,
      assetDecimals: 6,
      bridgeDecimals: 18,
      v3Fee: 3000,
    },
    {
      name: "USDC-DAI",
      asset: MAINNET.usdc,
      bridge: MAINNET.dai,
      assetDecimals: 6,
      bridgeDecimals: 18,
      v3Fee: 500,
    },
  ],
  artifactPath: path.join(
    rootDir,
    "artifacts",
    "contracts",
    "HonestFlashArbV3.sol",
    "HonestFlashArbV3.json"
  ),
};
