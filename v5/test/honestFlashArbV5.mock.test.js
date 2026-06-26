const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const ONE = 10n ** 18n;
const FAR_DEADLINE = 9_999_999_999n;
const LOAN = 1000n * ONE;
const PREMIUM_BPS = 5n;
const PREMIUM = (LOAN * PREMIUM_BPS) / 10000n;
const DEBT = LOAN + PREMIUM;

const ADAPTER_V2 = "0x00000001";
const ADAPTER_V3 = "0x00000002";
const ADAPTER_CURVE = "0x00000003";
const FlashSource = { AAVE: 0, BALANCER_VAULT: 1, UNI_V3_POOL: 2 };

function v2Step(target, tokenIn, tokenOut) {
  return {
    adapterId: ADAPTER_V2,
    target,
    data: ethers.AbiCoder.defaultAbiCoder().encode(
      ["address[]"],
      [[tokenIn, tokenOut]]
    ),
    minAmountOut: 1n,
  };
}

async function deployFixture() {
  const [owner, pending, sink] = await ethers.getSigners();

  const ERC20 = await ethers.getContractFactory("MockERC20");
  const tka = await ERC20.deploy("TokenA", "TKA", 18);
  const tkb = await ERC20.deploy("TokenB", "TKB", 18);
  const tkc = await ERC20.deploy("TokenC", "TKC", 18);
  await tka.waitForDeployment();
  await tkb.waitForDeployment();
  await tkc.waitForDeployment();

  const Pool = await ethers.getContractFactory("MockAavePool");
  const pool = await Pool.deploy(PREMIUM_BPS);
  await pool.waitForDeployment();

  const Vault = await ethers.getContractFactory("MockBalancerVault");
  const vault = await Vault.deploy(0);
  await vault.waitForDeployment();

  const RouterV2 = await ethers.getContractFactory("MockRouter");
  const r2a = await (await RouterV2.deploy()).getAddress();
  const r2b = await (await RouterV2.deploy()).getAddress();
  const r2c = await (await RouterV2.deploy()).getAddress();

  const routerV2a = await ethers.getContractAt("MockRouter", r2a);
  const routerV2b = await ethers.getContractAt("MockRouter", r2b);
  const routerV2c = await ethers.getContractAt("MockRouter", r2c);

  const tkaAddr = await tka.getAddress();
  const tkbAddr = await tkb.getAddress();
  const tkcAddr = await tkc.getAddress();
  const poolAddr = await pool.getAddress();
  const vaultAddr = await vault.getAddress();

  const UniPool = await ethers.getContractFactory("MockUniV3FlashPool");
  const uniPool = await UniPool.deploy(tkaAddr, tkbAddr, 0);
  await uniPool.waitForDeployment();
  const uniPoolAddr = await uniPool.getAddress();

  const Arb = await ethers.getContractFactory("HonestFlashArbV5");
  const arb = await Arb.deploy(
    poolAddr,
    vaultAddr,
    [r2a, r2b, r2c],
    [],
    [],
    [tkaAddr, tkbAddr, tkcAddr]
  );
  await arb.waitForDeployment();

  await tka.mint(poolAddr, 1_000_000n * ONE);
  await tka.mint(vaultAddr, 1_000_000n * ONE);
  await tka.mint(uniPoolAddr, 1_000_000n * ONE);
  await tkb.mint(r2a, 1_000_000n * ONE);
  await tkc.mint(r2b, 1_000_000n * ONE);
  await tka.mint(r2c, 1_000_000n * ONE);

  await routerV2a.setRate(tkaAddr, tkbAddr, 2, 1);
  await routerV2b.setRate(tkbAddr, tkcAddr, 2, 1);
  await routerV2c.setRate(tkcAddr, tkaAddr, 55, 100);

  const FINAL_OUT = (LOAN * 2n * 2n * 55n) / 100n;
  const EXPECTED_PROFIT = FINAL_OUT - DEBT;

  const planTri = {
    steps: [
      v2Step(r2a, tkaAddr, tkbAddr),
      v2Step(r2b, tkbAddr, tkcAddr),
      v2Step(r2c, tkcAddr, tkaAddr),
    ],
    loanToken: tkaAddr,
    loanAmount: LOAN,
    minProfit: 1n,
    deadline: FAR_DEADLINE,
  };

  await arb.addUniV3Pool(uniPoolAddr);

  return {
    owner,
    pending,
    sink,
    tka,
    arb,
    tkaAddr,
    poolAddr,
    uniPoolAddr,
    planTri,
    EXPECTED_PROFIT,
    FINAL_OUT,
  };
}

describe("HonestFlashArbV5", () => {
  it("3-hop V2 via Aave flash", async () => {
    const f = await loadFixture(deployFixture);
    await expect(
      f.arb.startArbitrage(FlashSource.AAVE, f.planTri, "0x")
    )
      .to.emit(f.arb, "FlashCompleted")
      .withArgs(f.tkaAddr, LOAN, PREMIUM, f.EXPECTED_PROFIT);
    expect(await f.arb.accumulatedProfit(f.tkaAddr)).to.equal(
      f.EXPECTED_PROFIT
    );
  });

  it("3-hop via Uni V3 pool flash (0 fee mock)", async () => {
    const f = await loadFixture(deployFixture);
    const flashParams = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "uint256"],
      [f.uniPoolAddr, LOAN, 0]
    );
    await f.arb.startArbitrage(
      FlashSource.UNI_V3_POOL,
      f.planTri,
      flashParams
    );
    expect(await f.arb.accumulatedProfit(f.tkaAddr)).to.equal(f.FINAL_OUT - LOAN);
  });

  it("reverts GainTooSmall", async () => {
    const f = await loadFixture(deployFixture);
    const bad = { ...f.planTri, minProfit: f.FINAL_OUT };
    await expect(
      f.arb.startArbitrage(FlashSource.AAVE, bad, "0x")
    ).to.be.revertedWithCustomError(f.arb, "GainTooSmall");
  });

  it("3-hop via Balancer vault flash", async () => {
    const f = await loadFixture(deployFixture);
    await f.arb.startArbitrage(FlashSource.BALANCER_VAULT, f.planTri, "0x");
    expect(await f.arb.accumulatedProfit(f.tkaAddr)).to.be.gt(0n);
  });

  it("reverts BadCallback from direct executeOperation", async () => {
    const f = await loadFixture(deployFixture);
    await expect(
      f.arb.executeOperation(f.tkaAddr, LOAN, PREMIUM, f.owner.address, "0x")
    ).to.be.revertedWithCustomError(f.arb, "BadCallback");
  });

  it("reverts TooManySteps when exceeding MAX_STEPS", async () => {
    const f = await loadFixture(deployFixture);
    const bad = {
      ...f.planTri,
      steps: Array(9).fill(f.planTri.steps[0]),
    };
    await expect(
      f.arb.startArbitrage(FlashSource.AAVE, bad, "0x")
    ).to.be.revertedWithCustomError(f.arb, "TooManySteps");
  });

  it("reverts unauthorized", async () => {
    const f = await loadFixture(deployFixture);
    await expect(
      f.arb.connect(f.pending).startArbitrage(FlashSource.AAVE, f.planTri, "0x")
    ).to.be.revertedWithCustomError(f.arb, "Unauthorized");
  });

  it("reverts when paused", async () => {
    const f = await loadFixture(deployFixture);
    await f.arb.pause();
    await expect(
      f.arb.startArbitrage(FlashSource.AAVE, f.planTri, "0x")
    ).to.be.revertedWithCustomError(f.arb, "ContractPaused");
  });

  it("reverts TooFewSteps", async () => {
    const f = await loadFixture(deployFixture);
    const bad = { ...f.planTri, steps: [f.planTri.steps[0]] };
    await expect(
      f.arb.startArbitrage(FlashSource.AAVE, bad, "0x")
    ).to.be.revertedWithCustomError(f.arb, "TooFewSteps");
  });

  it("Ownable2Step works", async () => {
    const f = await loadFixture(deployFixture);
    await f.arb.transferOwnership(f.pending.address);
    await f.arb.connect(f.pending).acceptOwnership();
    expect(await f.arb.owner()).to.equal(f.pending.address);
  });

  it("sweepToken syncs accumulatedProfit", async () => {
    const f = await loadFixture(deployFixture);
    await f.arb.startArbitrage(FlashSource.AAVE, f.planTri, "0x");
    const profit = await f.arb.accumulatedProfit(f.tkaAddr);
    await f.arb.pause();
    await f.arb.sweepToken(f.tkaAddr, f.sink.address, profit);
    expect(await f.arb.accumulatedProfit(f.tkaAddr)).to.equal(0n);
  });

  it("INVARIANT balance >= accumulatedProfit", async () => {
    const f = await loadFixture(deployFixture);
    await f.arb.startArbitrage(FlashSource.AAVE, f.planTri, "0x");
    const bal = await f.tka.balanceOf(await f.arb.getAddress());
    const acc = await f.arb.accumulatedProfit(f.tkaAddr);
    expect(bal).to.be.gte(acc);
  });

  it("addUniV3Pool whitelist", async () => {
    const f = await loadFixture(deployFixture);
    const extra = await (
      await ethers.getContractFactory("MockUniV3FlashPool")
    ).deploy(f.tkaAddr, f.tkaAddr, 0);
    const addr = await extra.getAddress();
    await f.arb.addUniV3Pool(addr);
    expect(await f.arb.uniV3PoolWhitelist(addr)).to.equal(true);
  });
});
