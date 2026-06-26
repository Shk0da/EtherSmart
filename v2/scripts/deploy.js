const { ethers, network, run } = require("hardhat");

// HonestFlashArbV2 constructor: (pool, routers[], tokens[])
// No WETH, no V3 routers — V2-only flash arb.
const CONFIG = {
  mainnet: {
    pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2", // Aave V3 Pool
    routers: [
      "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Uniswap V2 Router02
      "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F", // SushiSwap Router
    ],
    tokens: [
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
      "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI
    ],
  },
  sepolia: {
    pool: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951", // Aave V3 Sepolia
    // Replace with real Sepolia testnet router/token addresses before deploy.
    routers: [],
    tokens: [],
  },
};

function getConfig() {
  const cfg = CONFIG[network.name];
  if (!cfg) {
    throw new Error(
      `No V2 deploy config for "${network.name}". Add it to scripts/deploy.js.`
    );
  }
  if (cfg.pool === ethers.ZeroAddress) {
    throw new Error("pool must be non-zero");
  }
  if (cfg.routers.length === 0 || cfg.tokens.length === 0) {
    throw new Error(
      "routers and tokens must be non-empty. Fill CONFIG for this network."
    );
  }
  const zero = ethers.ZeroAddress;
  if ([cfg.pool, ...cfg.routers, ...cfg.tokens].some((a) => !a || a === zero)) {
    throw new Error("Config contains a zero/empty address.");
  }
  return cfg;
}

async function main() {
  const cfg = getConfig();
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No signer. Set DEPLOYER_PK in .env.");

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Network :", network.name);
  console.log("Contract: HonestFlashArbV2");
  console.log("Deployer:", deployer.address);
  console.log("Balance :", ethers.formatEther(balance), "ETH");
  console.log("Pool    :", cfg.pool);
  console.log("Routers :", cfg.routers);
  console.log("Tokens  :", cfg.tokens);

  const Arb = await ethers.getContractFactory("HonestFlashArbV2");
  const arb = await Arb.deploy(cfg.pool, cfg.routers, cfg.tokens);
  console.log("Deploy tx:", arb.deploymentTransaction().hash);
  await arb.waitForDeployment();

  const address = await arb.getAddress();
  console.log("\nHonestFlashArbV2 deployed at:", address);
  console.log("Owner (immutable) / profitReceiver:", await arb.owner());

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
        constructorArguments: [cfg.pool, cfg.routers, cfg.tokens],
      });
      console.log("Verified on Etherscan.");
    } catch (e) {
      console.log("Verification skipped/failed:", e.message);
    }
  }

  console.log("\nNext steps — see DEPLOY.md");
  console.log(`  ARB_CONTRACT=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
