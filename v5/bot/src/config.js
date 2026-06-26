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
  curve3pool: "0xbEbc44782C7Db0a1A60Cb6fe97d0b48303205716",
  balancerVault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
  balancerPoolId:
    "0x96646936b91b6be07d7e27e47baae2af033e58dce4e8d2f5428e5a9e294aae38",
  uniV3FlashPool: process.env.UNI_V3_FLASH_POOL || "",
  multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11",
};

/** Set when using FLASH_SOURCE=2 (Uni V3 pool flash). */
const uniV3FlashMeta = {
  pool: process.env.UNI_V3_FLASH_POOL || "",
  token0: MAINNET.usdc,
  token1: MAINNET.weth,
};

const rootDir = path.join(__dirname, "..", "..");

const graphEdges = [
  {
    id: "usdc-dai-curve",
    venue: "curve",
    tokenIn: MAINNET.usdc,
    tokenOut: MAINNET.dai,
    curveI: 1,
    curveJ: 0,
  },
  {
    id: "dai-weth-uni",
    venue: "uni",
    tokenIn: MAINNET.dai,
    tokenOut: MAINNET.weth,
  },
  {
    id: "weth-usdc-sushi",
    venue: "sushi",
    tokenIn: MAINNET.weth,
    tokenOut: MAINNET.usdc,
  },
  {
    id: "usdc-weth-uni",
    venue: "uni",
    tokenIn: MAINNET.usdc,
    tokenOut: MAINNET.weth,
  },
  {
    id: "weth-dai-sushi",
    venue: "sushi",
    tokenIn: MAINNET.weth,
    tokenOut: MAINNET.dai,
  },
  {
    id: "dai-usdc-curve",
    venue: "curve",
    tokenIn: MAINNET.dai,
    tokenOut: MAINNET.usdc,
    curveI: 0,
    curveJ: 1,
  },
];

module.exports = {
  version: "v5",
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
  loanSizesUsdc:
    process.env.LOAN_SIZES_USDC || "5000,10000,25000",
  estimatedArbGas: parseInt(process.env.ESTIMATED_ARB_GAS || "1200000", 10),
  maxGasPriceGwei: parseInt(process.env.MAX_GAS_PRICE_GWEI || "120", 10),
  multiBlockTargets: parseInt(process.env.MULTI_BLOCK_TARGETS || "1", 10),
  healthPort: parseInt(process.env.HEALTH_PORT || "8790", 10),
  healthBind: process.env.HEALTH_BIND || "127.0.0.1",
  healthToken: process.env.HEALTH_TOKEN || "",
  flashSource: parseInt(process.env.FLASH_SOURCE || "0", 10),
  useMempool: process.env.USE_MEMPOOL === "true",
  mempoolMinEth: process.env.MEMPOOL_MIN_ETH || "1",
  graphLoanToken: MAINNET.usdc,
  graphAssetDecimals: 6,
  graphMinSteps: 3,
  graphMaxSteps: 4,
  graphEdges,
  uniV3FlashMeta,
  addresses: MAINNET,
  wsHealthIntervalMs: parseInt(
    process.env.WS_HEALTH_INTERVAL_MS || "30000",
    10
  ),
  minEthBalanceWei: ethers.utils.parseEther(
    process.env.MIN_ETH_BALANCE || "0.05"
  ),
  artifactPath: path.join(
    rootDir,
    "artifacts",
    "contracts",
    "HonestFlashArbV5.sol",
    "HonestFlashArbV5.json"
  ),
  logDir: process.env.LOG_DIR || path.join(rootDir, "logs"),
  metricsEnabled: process.env.METRICS_ENABLED !== "false",
  metricsDbPath:
    process.env.METRICS_DB_PATH ||
    path.join(rootDir, "logs", "metrics-v5.db"),
};
