const { expect } = require("chai");
const { ethers } = require("hardhat");

// Real mainnet integration. Requires MAINNET_RPC_URL (set in .env).
// Without it, the whole suite is skipped so `npm test` stays green offline.
const RUN_FORK = !!process.env.MAINNET_RPC_URL;

const AAVE_V3_POOL = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2";
const UNISWAP_V2_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const SUSHI_ROUTER = "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const LOAN_USDC = 10_000n * 10n ** 6n; // 10,000 USDC (6 decimals)

(RUN_FORK ? describe : describe.skip)(
  "HonestFlashArbV2 (mainnet fork integration)",
  () => {
    async function deploy() {
      const [owner] = await ethers.getSigners();
      const Arb = await ethers.getContractFactory("HonestFlashArbV2");
      const arb = await Arb.deploy(
        AAVE_V3_POOL,
        [UNISWAP_V2_ROUTER, SUSHI_ROUTER],
        [USDC, WETH]
      );
      await arb.waitForDeployment();
      return { owner, arb };
    }

    async function futureDeadline() {
      const block = await ethers.provider.getBlock("latest");
      return BigInt(block.timestamp) + 3600n;
    }

    it("real Aave flash + real V2 swaps: unprofitable round-trip reverts GainTooSmall", async () => {
      const { arb } = await deploy();
      const deadline = await futureDeadline();

      // USDC -> WETH on Uniswap, WETH -> USDC on Sushi.
      // A bare round-trip loses DEX fees + Aave premium, so the on-chain
      // profit guard must revert. minOut=1 lets the swaps execute first.
      const plan = {
        router1: UNISWAP_V2_ROUTER,
        router2: SUSHI_ROUTER,
        path1: [USDC, WETH],
        path2: [WETH, USDC],
        amountOutMin1: 1n,
        amountOutMin2: 1n,
        minProfit: 1n,
        deadline,
      };

      await expect(
        arb.startArbitrage(USDC, LOAN_USDC, plan)
      ).to.be.revertedWithCustomError(arb, "GainTooSmall");

      // State must be clean after the revert.
      expect(await arb.loanOpen()).to.equal(false);
      expect(await arb.accumulatedProfit(USDC)).to.equal(0n);
    });

    it("rejects non-whitelisted router against real pool", async () => {
      const { arb } = await deploy();
      const deadline = await futureDeadline();
      const plan = {
        router1: SUSHI_ROUTER,
        router2: SUSHI_ROUTER,
        path1: [USDC, WETH],
        path2: [WETH, USDC],
        amountOutMin1: 1n,
        amountOutMin2: 1n,
        minProfit: 1n,
        deadline,
      };
      // DAI is not whitelisted -> TokenNotAllowed before any flash loan.
      const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
      const badPlan = { ...plan, path1: [USDC, DAI], path2: [DAI, USDC] };
      await expect(
        arb.startArbitrage(USDC, LOAN_USDC, badPlan)
      ).to.be.revertedWithCustomError(arb, "TokenNotAllowed");
    });
  }
);
