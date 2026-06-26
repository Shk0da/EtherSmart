const path = require("path");

const repoRoot =
  process.env.REPO_ROOT || path.resolve(__dirname, "..", "..");

const SECRET_KEYS = new Set([
  "BOT_PK",
  "DEPLOYER_PK",
  "FLASHBOTS_AUTH_PK",
  "HEALTH_TOKEN",
  "DASHBOARD_PASSWORD",
]);

const EDITABLE_KEYS = new Set([
  "DRY_RUN",
  "LOAN_SIZES_USDC",
  "LOAN_AMOUNT_USDC",
  "SLIPPAGE_BPS",
  "MIN_PROFIT_BPS",
  "BUILDER_TIP_WEI",
  "MAX_GAS_PRICE_GWEI",
  "ESTIMATED_ARB_GAS",
  "MULTI_BLOCK_TARGETS",
  "MIN_ETH_BALANCE",
  "USE_V3_LEGS",
  "USE_MEMPOOL",
  "MEMPOOL_MIN_ETH",
  "FLASH_SOURCE",
  "UNI_V3_FLASH_POOL",
  "HEALTH_PORT",
  "HEALTH_BIND",
  "METRICS_ENABLED",
  "LOG_LEVEL",
  "WS_HEALTH_INTERVAL_MS",
  "ARB_CONTRACT",
  "WS_URL",
  "MAINNET_RPC_URL",
]);

const BOTS = [
  {
    id: "v2",
    version: "v2",
    label: "HonestFlashArb V2",
    service: "v2-bot",
    healthPort: 8787,
    envPath: "v2/.env",
    metricsDb: "v2/logs/metrics-v2.db",
    botDir: "v2/bot",
    deployScript: "v2:deploy",
    compileScript: "v2:compile",
    contractArtifact:
      "v2/artifacts/contracts/HonestFlashArbV2.sol/HonestFlashArbV2.json",
    profitTokens: [
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    ],
  },
  {
    id: "v3",
    version: "v3",
    label: "HonestFlashArb V3",
    service: "v3-bot",
    healthPort: 8788,
    envPath: "v3/.env",
    metricsDb: "v3/logs/metrics-v3.db",
    botDir: "v3/bot",
    deployScript: "v3:deploy",
    compileScript: "v3:compile",
    contractArtifact:
      "v3/artifacts/contracts/HonestFlashArbV3.sol/HonestFlashArbV3.json",
    profitTokens: [
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    ],
  },
  {
    id: "v4",
    version: "v4",
    label: "HonestFlashArb V4",
    service: "v4-bot",
    healthPort: 8789,
    envPath: "v4/.env",
    metricsDb: "v4/logs/metrics-v4.db",
    botDir: "v4/bot",
    deployScript: "v4:deploy",
    compileScript: "v4:compile",
    contractArtifact:
      "v4/artifacts/contracts/HonestFlashArbV4.sol/HonestFlashArbV4.json",
    profitTokens: [
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    ],
  },
  {
    id: "v5",
    version: "v5",
    label: "HonestFlashArb V5",
    service: "v5-bot",
    healthPort: 8790,
    envPath: "v5/.env",
    metricsDb: "v5/logs/metrics-v5.db",
    botDir: "v5/bot",
    deployScript: "v5:deploy",
    compileScript: "v5:compile",
    contractArtifact:
      "v5/artifacts/contracts/HonestFlashArbV5.sol/HonestFlashArbV5.json",
    profitTokens: [
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    ],
  },
];

function abs(p) {
  return path.join(repoRoot, p);
}

const DEFAULT_DASHBOARD_PASSWORD = "12345";
const WEAK_DASHBOARD_PASSWORDS = new Set(["changeme", DEFAULT_DASHBOARD_PASSWORD]);

const isProduction = process.env.NODE_ENV === "production";

function validateStartup() {
  const pwd = process.env.DASHBOARD_PASSWORD || DEFAULT_DASHBOARD_PASSWORD;
  if (isProduction && WEAK_DASHBOARD_PASSWORDS.has(pwd)) {
    throw new Error(
      "DASHBOARD_PASSWORD must be set to a strong secret in production"
    );
  }
  if (pwd.length < 8) {
    console.warn("[control-plane] DASHBOARD_PASSWORD is shorter than 8 chars");
  }
}

module.exports = {
  repoRoot,
  SECRET_KEYS,
  EDITABLE_KEYS,
  BOTS,
  abs,
  port: parseInt(process.env.DASHBOARD_PORT || "3001", 10),
  bind: process.env.DASHBOARD_BIND || "127.0.0.1",
  password: process.env.DASHBOARD_PASSWORD || DEFAULT_DASHBOARD_PASSWORD,
  controlMode: process.env.CONTROL_MODE || "process",
  rpcUrl: process.env.MAINNET_RPC_URL || "",
  corsOrigin: process.env.CORS_ORIGIN || "http://127.0.0.1:3000",
  isProduction,
  validateStartup,
  composeFile:
    process.env.DOCKER_COMPOSE_FILE || path.join(repoRoot, "docker-compose.yml"),
  indexerFromBlock: parseInt(process.env.INDEXER_FROM_BLOCK || "19000000", 10),
  indexerChunkSize: parseInt(process.env.INDEXER_CHUNK_SIZE || "2000", 10),
  liveFeedMetricsMs: parseInt(process.env.LIVE_FEED_METRICS_MS || "5000", 10),
  indexerEnabled: process.env.INDEXER_ENABLED !== "false",
};
