const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const ONE = 10n ** 18n;
const FAR_DEADLINE = 9_999_999_999n;
const LOAN = 1000n * ONE;
const PREMIUM_BPS = 5n;
const PREMIUM = (LOAN * PREMIUM_BPS) / 10000n;
const FINAL_OUT = (LOAN * 3n * 34n) / 100n;
const DEBT = LOAN + PREMIUM;
const EXPECTED_PROFIT = FINAL_OUT - DEBT;
const FEE_3000 = 3000;

const LegKind = { V2: 0, V3: 1 };

function encodeV3Path(tokenIn, fee, tokenOut) {
  return ethers.solidityPacked(
    ["address", "uint24", "address"],
    [tokenIn, fee, tokenOut]
  );
}

async function deployFixture() {
  const [owner, pending, sink] = await ethers.getSigners();

  const ERC20 = await ethers.getContractFactory("MockERC20");
  const tka = await ERC20.deploy("TokenA", "TKA", 18);
  const tkb = await ERC20.deploy("TokenB", "TKB", 18);
  await tka.waitForDeployment();
  await tkb.waitForDeployment();

  const Pool = await ethers.getContractFactory("MockAavePool");
  const pool = await Pool.deploy(PREMIUM_BPS);
  await pool.waitForDeployment();

  const RouterV2 = await ethers.getContractFactory("MockRouter");
  const routerV2a = await RouterV2.deploy();
  const routerV2b = await RouterV2.deploy();
  await routerV2a.waitForDeployment();
  await routerV2b.waitForDeployment();

  const RouterV3 = await ethers.getContractFactory("MockSwapRouterV3");
  const routerV3a = await RouterV3.deploy();
  const routerV3b = await RouterV3.deploy();
  await routerV3a.waitForDeployment();
  await routerV3b.waitForDeployment();

  const tkaAddr = await tka.getAddress();
  const tkbAddr = await tkb.getAddress();
  const poolAddr = await pool.getAddress();
  const r2a = await routerV2a.getAddress();
  const r2b = await routerV2b.getAddress();
  const r3a = await routerV3a.getAddress();
  const r3b = await routerV3b.getAddress();

  const Arb = await ethers.getContractFactory("HonestFlashArbV3");
  const arb = await Arb.deploy(
    poolAddr,
    [r2a, r2b],
    [r3a, r3b],
    [tkaAddr, tkbAddr]
  );
  await arb.waitForDeployment();
  const arbAddr = await arb.getAddress();

  await tka.mint(poolAddr, 1_000_000n * ONE);
  await tkb.mint(r2a, 1_000_000n * ONE);
  await tka.mint(r2b, 1_000_000n * ONE);
  await tkb.mint(r3a, 1_000_000n * ONE);
  await tka.mint(r3b, 1_000_000n * ONE);

  await routerV2a.setRate(tkaAddr, tkbAddr, 3, 1);
  await routerV2b.setRate(tkbAddr, tkaAddr, 34, 100);
  await routerV3a.setRate(tkaAddr, tkbAddr, 3, 1);
  await routerV3b.setRate(tkbAddr, tkaAddr, 34, 100);

  const path1V3 = encodeV3Path(tkaAddr, FEE_3000, tkbAddr);
  const path2V3 = encodeV3Path(tkbAddr, FEE_3000, tkaAddr);

  const planV2 = {
    leg1Kind: LegKind.V2,
    leg2Kind: LegKind.V2,
    router1: r2a,
    router2: r2b,
    path1: [tkaAddr, tkbAddr],
    path2: [tkbAddr, tkaAddr],
    path1V3: "0x",
    path2V3: "0x",
    amountOutMin1: 1n,
    amountOutMin2: 1n,
    minProfit: 1n,
    deadline: FAR_DEADLINE,
  };

  const planV3 = {
    leg1Kind: LegKind.V3,
    leg2Kind: LegKind.V3,
    router1: r3a,
    router2: r3b,
    path1: [],
    path2: [],
    path1V3,
    path2V3,
    amountOutMin1: 1n,
    amountOutMin2: 1n,
    minProfit: 1n,
    deadline: FAR_DEADLINE,
  };

  const planMixed = {
    leg1Kind: LegKind.V2,
    leg2Kind: LegKind.V3,
    router1: r2a,
    router2: r3b,
    path1: [tkaAddr, tkbAddr],
    path2: [],
    path1V3: "0x",
    path2V3,
    amountOutMin1: 1n,
    amountOutMin2: 1n,
    minProfit: 1n,
    deadline: FAR_DEADLINE,
  };

  return {
    owner,
    pending,
    sink,
    tka,
    tkb,
    pool,
    arb,
    arbAddr,
    tkaAddr,
    tkbAddr,
    poolAddr,
    planV2,
    planV3,
    planMixed,
  };
}

describe("HonestFlashArbV3", () => {
  it("V2+V2: credits profit and repays pool", async () => {
    const f = await loadFixture(deployFixture);
    const poolBefore = await f.tka.balanceOf(f.poolAddr);

    await expect(f.arb.startArbitrage(f.tkaAddr, LOAN, f.planV2))
      .to.emit(f.arb, "FlashCompleted")
      .withArgs(f.tkaAddr, LOAN, PREMIUM, EXPECTED_PROFIT);

    expect(await f.arb.accumulatedProfit(f.tkaAddr)).to.equal(EXPECTED_PROFIT);
    expect(await f.tka.balanceOf(f.poolAddr)).to.equal(poolBefore + PREMIUM);
  });

  it("V3+V3: emits SwapExecuted on both legs", async () => {
    const f = await loadFixture(deployFixture);

    const tx = await f.arb.startArbitrage(f.tkaAddr, LOAN, f.planV3);
    const receipt = await tx.wait();
    const swapEvents = receipt.logs.filter(
      (l) => l.fragment && l.fragment.name === "SwapExecuted"
    );
    expect(swapEvents.length).to.equal(2);
    expect(await f.arb.accumulatedProfit(f.tkaAddr)).to.equal(EXPECTED_PROFIT);
  });

  it("V2+V3 mixed legs succeed", async () => {
    const f = await loadFixture(deployFixture);
    await f.arb.startArbitrage(f.tkaAddr, LOAN, f.planMixed);
    expect(await f.arb.accumulatedProfit(f.tkaAddr)).to.equal(EXPECTED_PROFIT);
  });

  it("Ownable2Step: transfer requires accept", async () => {
    const f = await loadFixture(deployFixture);
    await f.arb.transferOwnership(f.pending.address);
    expect(await f.arb.pendingOwner()).to.equal(f.pending.address);
    expect(await f.arb.owner()).to.equal(f.owner.address);

    await f.arb.connect(f.pending).acceptOwnership();
    expect(await f.arb.owner()).to.equal(f.pending.address);
  });

  it("dynamic whitelist: add/remove router and token", async () => {
    const f = await loadFixture(deployFixture);
    const ERC20 = await ethers.getContractFactory("MockERC20");
    const stray = await ERC20.deploy("X", "X", 18);
    await stray.waitForDeployment();
    const strayAddr = await stray.getAddress();

    await f.arb.addToken(strayAddr);
    expect(await f.arb.tokenWhitelist(strayAddr)).to.equal(true);
    await f.arb.removeToken(strayAddr);
    expect(await f.arb.tokenWhitelist(strayAddr)).to.equal(false);

    const Router = await ethers.getContractFactory("MockRouter");
    const extra = await Router.deploy();
    await extra.waitForDeployment();
    const extraAddr = await extra.getAddress();
    await f.arb.addRouterV2(extraAddr);
    expect(await f.arb.routerV2Whitelist(extraAddr)).to.equal(true);
    await f.arb.removeRouterV2(extraAddr);
    expect(await f.arb.routerV2Whitelist(extraAddr)).to.equal(false);
  });

  it("sweepToken syncs accumulatedProfit", async () => {
    const f = await loadFixture(deployFixture);
    await f.arb.startArbitrage(f.tkaAddr, LOAN, f.planV2);
    await f.arb.pause();
    await f.arb.sweepToken(f.tkaAddr, f.sink.address, EXPECTED_PROFIT);
    expect(await f.arb.accumulatedProfit(f.tkaAddr)).to.equal(0n);
  });

  it("INVARIANT: balance >= accumulatedProfit after arb", async () => {
    const f = await loadFixture(deployFixture);
    await f.arb.startArbitrage(f.tkaAddr, LOAN, f.planV2);
    const bal = await f.tka.balanceOf(f.arbAddr);
    const acc = await f.arb.accumulatedProfit(f.tkaAddr);
    expect(bal).to.be.gte(acc);
  });
});
