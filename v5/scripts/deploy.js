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
    ],
  },
};

async function main() {
  const cfg = CONFIG[network.name];
  if (!cfg) throw new Error(`No config for ${network.name}`);

  const rpcUrl = process.env.MAINNET_RPC_URL;
  const pk = process.env.DEPLOYER_PK || process.env.BOT_PK;
  if (!rpcUrl) throw new Error("MAINNET_RPC_URL is required");
  if (!pk)
    throw new Error(
      "No deploy signer. Set DEPLOYER_PK (or BOT_PK) in v5/.env for mainnet deploy."
    );

  // Use a plain ethers signer to avoid hardhat-ethers tx parsing issues on
  // some RPC responses for contract-creation txs ("to" field can be "").
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const deployer = new ethers.Wallet(pk, provider);
  const Arb = await ethers.getContractFactory("HonestFlashArbV5", deployer);
  const arb = await Arb.deploy(
    cfg.pool,
    cfg.balancerVault,
    cfg.routersV2,
    cfg.routersV3,
    cfg.curvePools,
    cfg.tokens
  );
  await arb.waitForDeployment();
  console.log("HonestFlashArbV5:", await arb.getAddress());
  console.log("Owner:", deployer.address);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
