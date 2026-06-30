const { ethers, network, run } = require("hardhat");

const CONFIG = {
  mainnet: {
    pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    balancerVault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
    routersV2: [
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
      "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
    ],
    routersV3: ["0x68b3465833Fb72a70edf967f1A4677710B7893f0"],
    curvePools: ["0xBEbc44782c7DB0a1A60cb6fe97d0b48303205716"],
    tokens: [
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    ],
  },
  sepolia: {
    pool: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
    balancerVault: ethers.ZeroAddress,
    routersV2: [],
    routersV3: [],
    curvePools: [],
    tokens: [],
  },
};

function getConfig() {
  const cfg = CONFIG[network.name];
  if (!cfg) {
    throw new Error(
      `No deploy config for network "${network.name}". Add it to scripts/deploy.js.`
    );
  }
  if (cfg.pool === ethers.ZeroAddress) {
    throw new Error("pool must be non-zero");
  }
  return cfg;
}

async function main() {
  const cfg = getConfig();
  const rpcUrl = process.env.MAINNET_RPC_URL;
  const pk = process.env.DEPLOYER_PK || process.env.BOT_PK;
  if (!rpcUrl) throw new Error("MAINNET_RPC_URL is required");
  if (!pk) throw new Error("No signer. Set DEPLOYER_PK (or BOT_PK) in .env.");
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const deployer = new ethers.Wallet(pk, provider);

  const balance = await provider.getBalance(deployer.address);
  console.log("Network       :", network.name);
  console.log("Deployer      :", deployer.address);
  console.log("Balance       :", ethers.formatEther(balance), "ETH");
  console.log("Pool          :", cfg.pool);
  console.log("Balancer Vault:", cfg.balancerVault);
  console.log("RoutersV2     :", cfg.routersV2);
  console.log("RoutersV3     :", cfg.routersV3);
  console.log("Curve pools   :", cfg.curvePools);
  console.log("Tokens        :", cfg.tokens);

  const Arb = await ethers.getContractFactory("HonestFlashArbV4", deployer);
  const arb = await Arb.deploy(
    cfg.pool,
    cfg.balancerVault,
    cfg.routersV2,
    cfg.routersV3,
    cfg.curvePools,
    cfg.tokens
  );
  console.log("Deploy tx:", arb.deploymentTransaction().hash);
  await arb.waitForDeployment();

  const address = await arb.getAddress();
  console.log("\nHonestFlashArbV4 deployed at:", address);
  console.log("Owner / profitReceiver:", await arb.owner());

  if (
    network.name !== "hardhat" &&
    network.name !== "localhost" &&
    process.env.ETHERSCAN_API_KEY
  ) {
    console.log("\nWaiting for confirmations before verification...");
    await arb.deploymentTransaction().wait(5);
    try {
      await run("verify:verify", {
        address,
        constructorArguments: [
          cfg.pool,
          cfg.balancerVault,
          cfg.routersV2,
          cfg.routersV3,
          cfg.curvePools,
          cfg.tokens,
        ],
      });
      console.log("Verified on Etherscan.");
    } catch (e) {
      console.log("Verification skipped/failed:", e.message);
    }
  }

  console.log("\nNext steps — see DEPLOY.md");
  console.log(`  1. Set ARB_CONTRACT=${address} in v4/.env`);
  console.log(`  2. cd bot && npm start`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
