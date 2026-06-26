const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const ONE = 10n ** 18n;
const FAR_DEADLINE = 9_999_999_999n;

// Borrowed amount and mock DEX rates chosen to yield a deterministic profit:
//   leg1: TKA -> TKB at 3x   (out = in * 3)
//   leg2: TKB -> TKA at 0.34 (out = in * 34/100)
//   round trip multiplier = 3 * 0.34 = 1.02  => +2% gross
const LOAN = 1000n * ONE;
const PREMIUM_BPS = 5n; // 0.05%, Aave-like
const PREMIUM = (LOAN * PREMIUM_BPS) / 10000n; // 0.5 TKA
const FINAL_OUT = (LOAN * 3n * 34n) / 100n; // 1020 TKA
const DEBT = LOAN + PREMIUM; // 1000.5 TKA
const EXPECTED_PROFIT = FINAL_OUT - DEBT; // 19.5 TKA

async function deployFixture() {
  const [owner, other, sink] = await ethers.getSigners();

  const ERC20 = await ethers.getContractFactory("MockERC20");
  const tka = await ERC20.deploy("TokenA", "TKA", 18);
  const tkb = await ERC20.deploy("TokenB", "TKB", 18);
  await tka.waitForDeployment();
  await tkb.waitForDeployment();

  const Pool = await ethers.getContractFactory("MockAavePool");
  const pool = await Pool.deploy(PREMIUM_BPS);
  await pool.waitForDeployment();

  const Router = await ethers.getContractFactory("MockRouter");
  const router1 = await Router.deploy();
  const router2 = await Router.deploy();
  await router1.waitForDeployment();
  await router2.waitForDeployment();

  const tkaAddr = await tka.getAddress();
  const tkbAddr = await tkb.getAddress();
  const poolAddr = await pool.getAddress();
  const r1Addr = await router1.getAddress();
  const r2Addr = await router2.getAddress();

  const Arb = await ethers.getContractFactory("HonestFlashArbV2");
  const arb = await Arb.deploy(poolAddr, [r1Addr, r2Addr], [tkaAddr, tkbAddr]);
  await arb.waitForDeployment();
  const arbAddr = await arb.getAddress();

  // Liquidity: pool lends TKA; router1 pays out TKB; router2 pays out TKA.
  await tka.mint(poolAddr, 1_000_000n * ONE);
  await tkb.mint(r1Addr, 1_000_000n * ONE);
  await tka.mint(r2Addr, 1_000_000n * ONE);

  await router1.setRate(tkaAddr, tkbAddr, 3, 1);
  await router2.setRate(tkbAddr, tkaAddr, 34, 100);

  const plan = {
    router1: r1Addr,
    router2: r2Addr,
    path1: [tkaAddr, tkbAddr],
    path2: [tkbAddr, tkaAddr],
    amountOutMin1: 1n,
    amountOutMin2: 1n,
    minProfit: 1n,
    deadline: FAR_DEADLINE,
  };

  return {
    owner, other, sink,
    tka, tkb, pool, router1, router2, arb,
    tkaAddr, tkbAddr, poolAddr, r1Addr, r2Addr, arbAddr,
    plan,
  };
}

describe("HonestFlashArbV2 (mock-based invariants)", () => {
  describe("deployment / config", () => {
    it("sets owner, pool, profitReceiver and whitelists", async () => {
      const f = await loadFixture(deployFixture);
      expect(await f.arb.owner()).to.equal(f.owner.address);
      expect(await f.arb.pool()).to.equal(f.poolAddr);
      expect(await f.arb.profitReceiver()).to.equal(f.owner.address);
      expect(await f.arb.routerWhitelist(f.r1Addr)).to.equal(true);
      expect(await f.arb.routerWhitelist(f.r2Addr)).to.equal(true);
      expect(await f.arb.tokenWhitelist(f.tkaAddr)).to.equal(true);
      expect(await f.arb.tokenWhitelist(f.tkbAddr)).to.equal(true);
      expect(await f.arb.paused()).to.equal(false);
      expect(await f.arb.loanOpen()).to.equal(false);
    });
  });

  describe("access control (onlyOwner)", () => {
    it("reverts startArbitrage / pause / sweep / setters for non-owner", async () => {
      const f = await loadFixture(deployFixture);
      const a = f.arb.connect(f.other);
      await expect(a.startArbitrage(f.tkaAddr, LOAN, f.plan))
        .to.be.revertedWithCustomError(f.arb, "Unauthorized");
      await expect(a.pause())
        .to.be.revertedWithCustomError(f.arb, "Unauthorized");
      await expect(a.unpause())
        .to.be.revertedWithCustomError(f.arb, "Unauthorized");
      await expect(a.setProfitReceiver(f.other.address))
        .to.be.revertedWithCustomError(f.arb, "Unauthorized");
      await expect(a.setAutoWithdrawThreshold(f.tkaAddr, 1n))
        .to.be.revertedWithCustomError(f.arb, "Unauthorized");
      await expect(a.withdrawAccumulatedProfit(f.tkaAddr))
        .to.be.revertedWithCustomError(f.arb, "Unauthorized");
    });
  });

  describe("_checkPlan validation", () => {
    it("reverts on non-whitelisted asset", async () => {
      const f = await loadFixture(deployFixture);
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const stray = await ERC20.deploy("Stray", "STR", 18);
      await stray.waitForDeployment();
      await expect(
        f.arb.startArbitrage(await stray.getAddress(), LOAN, f.plan)
      ).to.be.revertedWithCustomError(f.arb, "TokenNotAllowed");
    });

    it("reverts on non-whitelisted router", async () => {
      const f = await loadFixture(deployFixture);
      const bad = { ...f.plan, router1: f.other.address };
      await expect(
        f.arb.startArbitrage(f.tkaAddr, LOAN, bad)
      ).to.be.revertedWithCustomError(f.arb, "RouterNotAllowed");
    });

    it("reverts on short path", async () => {
      const f = await loadFixture(deployFixture);
      const bad = { ...f.plan, path1: [f.tkaAddr] };
      await expect(
        f.arb.startArbitrage(f.tkaAddr, LOAN, bad)
      ).to.be.revertedWithCustomError(f.arb, "BadPlan");
    });

    it("reverts when path1[0] != asset", async () => {
      const f = await loadFixture(deployFixture);
      const bad = { ...f.plan, path1: [f.tkbAddr, f.tkaAddr] };
      await expect(
        f.arb.startArbitrage(f.tkaAddr, LOAN, bad)
      ).to.be.revertedWithCustomError(f.arb, "BadPlan");
    });

    it("reverts on bridge-token mismatch", async () => {
      const f = await loadFixture(deployFixture);
      // path1 ends in TKB, but path2 starts with TKA -> mismatch
      const bad = { ...f.plan, path2: [f.tkaAddr, f.tkaAddr] };
      await expect(
        f.arb.startArbitrage(f.tkaAddr, LOAN, bad)
      ).to.be.revertedWithCustomError(f.arb, "BadPlan");
    });

    it("reverts on zero minProfit / minOut", async () => {
      const f = await loadFixture(deployFixture);
      await expect(
        f.arb.startArbitrage(f.tkaAddr, LOAN, { ...f.plan, minProfit: 0n })
      ).to.be.revertedWithCustomError(f.arb, "BadPlan");
      await expect(
        f.arb.startArbitrage(f.tkaAddr, LOAN, { ...f.plan, amountOutMin1: 0n })
      ).to.be.revertedWithCustomError(f.arb, "BadPlan");
    });

    it("reverts on expired deadline", async () => {
      const f = await loadFixture(deployFixture);
      await expect(
        f.arb.startArbitrage(f.tkaAddr, LOAN, { ...f.plan, deadline: 1n })
      ).to.be.revertedWithCustomError(f.arb, "BadPlan");
    });

    it("reverts on zero amount", async () => {
      const f = await loadFixture(deployFixture);
      await expect(
        f.arb.startArbitrage(f.tkaAddr, 0n, f.plan)
      ).to.be.revertedWithCustomError(f.arb, "ZeroAmount");
    });
  });

  describe("callback authentication", () => {
    it("reverts a direct executeOperation call (not from pool)", async () => {
      const f = await loadFixture(deployFixture);
      await expect(
        f.arb.executeOperation(f.tkaAddr, LOAN, 0n, f.arbAddr, "0x")
      ).to.be.revertedWithCustomError(f.arb, "BadCallback");
    });
  });

  describe("happy path: profit accounting & repayment (auto-withdraw off)", () => {
    it("credits exact profit, repays pool, leaves funds in contract", async () => {
      const f = await loadFixture(deployFixture);
      const poolBefore = await f.tka.balanceOf(f.poolAddr);

      await expect(f.arb.startArbitrage(f.tkaAddr, LOAN, f.plan))
        .to.emit(f.arb, "FlashCompleted")
        .withArgs(f.tkaAddr, LOAN, PREMIUM, EXPECTED_PROFIT);

      expect(await f.arb.accumulatedProfit(f.tkaAddr)).to.equal(EXPECTED_PROFIT);
      expect(await f.tka.balanceOf(f.arbAddr)).to.equal(EXPECTED_PROFIT);
      // Pool got principal + premium back (net +PREMIUM vs before).
      expect(await f.tka.balanceOf(f.poolAddr)).to.equal(poolBefore + PREMIUM);
      expect(await f.arb.loanOpen()).to.equal(false);
    });

    it("INVARIANT: contract balance >= accumulatedProfit after arb", async () => {
      const f = await loadFixture(deployFixture);
      await f.arb.startArbitrage(f.tkaAddr, LOAN, f.plan);
      const bal = await f.tka.balanceOf(f.arbAddr);
      const acc = await f.arb.accumulatedProfit(f.tkaAddr);
      expect(bal).to.be.gte(acc);
    });
  });

  describe("auto-withdraw on (threshold reached)", () => {
    it("sends profit to receiver, zeroes accumulated, still repays pool", async () => {
      const f = await loadFixture(deployFixture);
      await f.arb.setAutoWithdrawThreshold(f.tkaAddr, ONE); // 1 TKA threshold
      const poolBefore = await f.tka.balanceOf(f.poolAddr);
      const recvBefore = await f.tka.balanceOf(f.owner.address);

      await expect(f.arb.startArbitrage(f.tkaAddr, LOAN, f.plan))
        .to.emit(f.arb, "ProfitAutoWithdrawn")
        .withArgs(f.tkaAddr, f.owner.address, EXPECTED_PROFIT);

      expect(await f.arb.accumulatedProfit(f.tkaAddr)).to.equal(0n);
      expect(await f.tka.balanceOf(f.arbAddr)).to.equal(0n);
      expect(await f.tka.balanceOf(f.owner.address)).to.equal(
        recvBefore + EXPECTED_PROFIT
      );
      expect(await f.tka.balanceOf(f.poolAddr)).to.equal(poolBefore + PREMIUM);
    });

    it("does not auto-withdraw below threshold", async () => {
      const f = await loadFixture(deployFixture);
      await f.arb.setAutoWithdrawThreshold(f.tkaAddr, 1_000_000n * ONE);
      await f.arb.startArbitrage(f.tkaAddr, LOAN, f.plan);
      expect(await f.arb.accumulatedProfit(f.tkaAddr)).to.equal(EXPECTED_PROFIT);
      expect(await f.tka.balanceOf(f.arbAddr)).to.equal(EXPECTED_PROFIT);
    });
  });

  describe("sweepToken keeps accumulatedProfit in sync (desync fix)", () => {
    it("decrements accumulatedProfit by swept amount", async () => {
      const f = await loadFixture(deployFixture);
      await f.arb.startArbitrage(f.tkaAddr, LOAN, f.plan); // acc = 19.5 TKA
      await f.arb.pause();

      await f.arb.sweepToken(f.tkaAddr, f.sink.address, 5n * ONE);
      expect(await f.arb.accumulatedProfit(f.tkaAddr)).to.equal(
        EXPECTED_PROFIT - 5n * ONE
      );
      expect(await f.tka.balanceOf(f.sink.address)).to.equal(5n * ONE);

      // Sweep the rest -> accumulated must hit zero (amount >= acc).
      const remaining = EXPECTED_PROFIT - 5n * ONE;
      await f.arb.sweepToken(f.tkaAddr, f.sink.address, remaining);
      expect(await f.arb.accumulatedProfit(f.tkaAddr)).to.equal(0n);
    });

    it("reverts sweep when not paused", async () => {
      const f = await loadFixture(deployFixture);
      await expect(
        f.arb.sweepToken(f.tkaAddr, f.sink.address, 1n)
      ).to.be.revertedWithCustomError(f.arb, "MustBePaused");
    });

    it("reverts sweep above accumulated profit", async () => {
      const f = await loadFixture(deployFixture);
      await f.arb.startArbitrage(f.tkaAddr, LOAN, f.plan);
      await f.arb.pause();
      await expect(
        f.arb.sweepToken(f.tkaAddr, f.sink.address, EXPECTED_PROFIT + 1n)
      ).to.be.revertedWithCustomError(f.arb, "SweepExceedsAccumulated");
    });
  });

  describe("withdrawAccumulatedProfit", () => {
    it("decrements (not zeroes) accumulated when balance < accumulated", async () => {
      const f = await loadFixture(deployFixture);
      await f.arb.startArbitrage(f.tkaAddr, LOAN, f.plan); // acc = bal = 19.5 TKA

      // Simulate an external drain so balance < accumulated.
      await f.tka.burn(f.arbAddr, 19n * ONE); // leaves 0.5 TKA in contract
      const recvBefore = await f.tka.balanceOf(f.owner.address);

      await f.arb.withdrawAccumulatedProfit(f.tkaAddr);

      // Only what existed (0.5 TKA) is sent; remainder stays tracked.
      expect(await f.tka.balanceOf(f.owner.address)).to.equal(
        recvBefore + 5n * ONE / 10n
      );
      expect(await f.arb.accumulatedProfit(f.tkaAddr)).to.equal(
        EXPECTED_PROFIT - 5n * ONE / 10n
      );
    });

    it("reverts when nothing accumulated", async () => {
      const f = await loadFixture(deployFixture);
      await expect(
        f.arb.withdrawAccumulatedProfit(f.tkaAddr)
      ).to.be.revertedWithCustomError(f.arb, "ZeroAmount");
    });
  });

  describe("native ETH rejection", () => {
    it("reverts on receive()", async () => {
      const f = await loadFixture(deployFixture);
      await expect(
        f.owner.sendTransaction({ to: f.arbAddr, value: 1n })
      ).to.be.revertedWithCustomError(f.arb, "NativeTransfersDisabled");
    });
  });

  describe("reentrancy guard", () => {
    it("blocks a nested guarded call during an active startArbitrage", async () => {
      const [owner] = await ethers.getSigners();

      const ERC20 = await ethers.getContractFactory("MockERC20");
      const tka = await ERC20.deploy("TokenA", "TKA", 18);
      const tkb = await ERC20.deploy("TokenB", "TKB", 18);
      await tka.waitForDeployment();
      await tkb.waitForDeployment();

      const Pool = await ethers.getContractFactory("MockAavePool");
      const pool = await Pool.deploy(PREMIUM_BPS);
      await pool.waitForDeployment();

      const RR = await ethers.getContractFactory("ReentrantRouter");
      const rr = await RR.deploy(); // router1, re-enters
      await rr.waitForDeployment();
      const Router = await ethers.getContractFactory("MockRouter");
      const router2 = await Router.deploy();
      await router2.waitForDeployment();

      const tkaAddr = await tka.getAddress();
      const tkbAddr = await tkb.getAddress();
      const poolAddr = await pool.getAddress();
      const rrAddr = await rr.getAddress();
      const r2Addr = await router2.getAddress();

      // MaliciousOwner deploys the arb (owner == MaliciousOwner).
      const MO = await ethers.getContractFactory("MaliciousOwner");
      const mo = await MO.deploy(poolAddr, [rrAddr, r2Addr], [tkaAddr, tkbAddr]);
      await mo.waitForDeployment();
      const arbAddr = await mo.arb();
      const arb = await ethers.getContractAt("HonestFlashArbV2", arbAddr);

      await tka.mint(poolAddr, 1_000_000n * ONE);
      await tkb.mint(rrAddr, 1_000_000n * ONE);
      await tka.mint(r2Addr, 1_000_000n * ONE);
      await rr.setRate(tkaAddr, tkbAddr, 3, 1);
      await router2.setRate(tkbAddr, tkaAddr, 34, 100);

      await mo.setReenterToken(tkaAddr);
      await rr.setHook(await mo.getAddress());

      const plan = {
        router1: rrAddr,
        router2: r2Addr,
        path1: [tkaAddr, tkbAddr],
        path2: [tkbAddr, tkaAddr],
        amountOutMin1: 1n,
        amountOutMin2: 1n,
        minProfit: 1n,
        deadline: FAR_DEADLINE,
      };

      await mo.run(tkaAddr, LOAN, plan);

      // The re-entry was attempted and blocked by the nonReentrant guard.
      expect(await rr.triggered()).to.equal(true);
      expect(await rr.reentryBlocked()).to.equal(true);

      const reentrancySelector = ethers.id("Reentrancy()").slice(0, 10);
      const lastRevert = await rr.lastRevert();
      expect(lastRevert.slice(0, 10)).to.equal(reentrancySelector);

      // Despite the blocked re-entry, the arbitrage completed normally.
      expect(await arb.accumulatedProfit(tkaAddr)).to.equal(EXPECTED_PROFIT);
      expect(await arb.loanOpen()).to.equal(false);
    });
  });
});
