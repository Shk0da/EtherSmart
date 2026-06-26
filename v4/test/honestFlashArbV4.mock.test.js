const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const ONE = 10n ** 18n;
const FAR_DEADLINE = 9_999_999_999n;
const LOAN = 1000n * ONE;
const PREMIUM_BPS = 5n;
const PREMIUM = (LOAN * PREMIUM_BPS) / 10000n;
const DEBT = LOAN + PREMIUM;
const FEE_3000 = 3000;

const LegType = { V2: 0, V3: 1, CURVE: 2, BALANCER: 3 };
const FlashSource = { AAVE: 0, BALANCER_VAULT: 1 };

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
  const routerV2a = await RouterV2.deploy();
  const routerV2b = await RouterV2.deploy();
  const routerV2c = await RouterV2.deploy();
  await routerV2a.waitForDeployment();
  await routerV2b.waitForDeployment();
  await routerV2c.waitForDeployment();

  const RouterV3 = await ethers.getContractFactory("MockSwapRouterV3");
  const routerV3 = await RouterV3.deploy();
  await routerV3.waitForDeployment();

  const Curve = await ethers.getContractFactory("MockCurvePool");
  const curve = await Curve.deploy();
  await curve.waitForDeployment();

  const tkaAddr = await tka.getAddress();
  const tkbAddr = await tkb.getAddress();
  const tkcAddr = await tkc.getAddress();
  const poolAddr = await pool.getAddress();
  const vaultAddr = await vault.getAddress();
  const r2a = await routerV2a.getAddress();
  const r2b = await routerV2b.getAddress();
  const r2c = await routerV2c.getAddress();
  const r3 = await routerV3.getAddress();
  const curveAddr = await curve.getAddress();

  const Arb = await ethers.getContractFactory("HonestFlashArbV4");
  const arb = await Arb.deploy(
    poolAddr,
    vaultAddr,
    [r2a, r2b, r2c],
    [r3],
    [curveAddr],
    [tkaAddr, tkbAddr, tkcAddr]
  );
  await arb.waitForDeployment();
  const arbAddr = await arb.getAddress();

  await tka.mint(poolAddr, 1_000_000n * ONE);
  await tka.mint(vaultAddr, 1_000_000n * ONE);
  await tkb.mint(r2a, 1_000_000n * ONE);
  await tkc.mint(r2b, 1_000_000n * ONE);
  await tka.mint(r2c, 1_000_000n * ONE);
  await tkb.mint(curve, 1_000_000n * ONE);
  await tkc.mint(curve, 1_000_000n * ONE);
  await tka.mint(vault, 1_000_000n * ONE);
  await tkb.mint(vault, 1_000_000n * ONE);

  await routerV2a.setRate(tkaAddr, tkbAddr, 2, 1);
  await routerV2b.setRate(tkbAddr, tkcAddr, 2, 1);
  await routerV2c.setRate(tkcAddr, tkaAddr, 55, 100);

  await curve.setCoin(0, tkaAddr);
  await curve.setCoin(1, tkbAddr);
  await curve.setRate(0, 1, 2, 1);
  await routerV2b.setRate(tkbAddr, tkcAddr, 2, 1);
  await routerV2c.setRate(tkcAddr, tkaAddr, 55, 100);

  const poolId = ethers.id("test-pool");
  await vault.setRate(poolId, tkbAddr, tkcAddr, 2, 1);
  await tkc.mint(vaultAddr, 1_000_000n * ONE);

  const FINAL_OUT = (LOAN * 2n * 2n * 55n) / 100n;
  const EXPECTED_PROFIT = FINAL_OUT - DEBT;

  const planV2Tri = {
    legs: [
      {
        legType: LegType.V2,
        target: r2a,
        data: ethers.AbiCoder.defaultAbiCoder().encode(
          ["address[]"],
          [[tkaAddr, tkbAddr]]
        ),
        amountIn: 0,
        minAmountOut: 1n,
      },
      {
        legType: LegType.V2,
        target: r2b,
        data: ethers.AbiCoder.defaultAbiCoder().encode(
          ["address[]"],
          [[tkbAddr, tkcAddr]]
        ),
        amountIn: 0,
        minAmountOut: 1n,
      },
      {
        legType: LegType.V2,
        target: r2c,
        data: ethers.AbiCoder.defaultAbiCoder().encode(
          ["address[]"],
          [[tkcAddr, tkaAddr]]
        ),
        amountIn: 0,
        minAmountOut: 1n,
      },
    ],
    loanToken: tkaAddr,
    loanAmount: LOAN,
    minProfit: 1n,
    deadline: FAR_DEADLINE,
  };

  const planCurveTri = {
    legs: [
      {
        legType: LegType.CURVE,
        target: curveAddr,
        data: ethers.AbiCoder.defaultAbiCoder().encode(
          ["int128", "int128", "address", "address"],
          [0, 1, tkaAddr, tkbAddr]
        ),
        amountIn: 0,
        minAmountOut: 1n,
      },
      {
        legType: LegType.V2,
        target: r2b,
        data: ethers.AbiCoder.defaultAbiCoder().encode(
          ["address[]"],
          [[tkbAddr, tkcAddr]]
        ),
        amountIn: 0,
        minAmountOut: 1n,
      },
      {
        legType: LegType.V2,
        target: r2c,
        data: ethers.AbiCoder.defaultAbiCoder().encode(
          ["address[]"],
          [[tkcAddr, tkaAddr]]
        ),
        amountIn: 0,
        minAmountOut: 1n,
      },
    ],
    loanToken: tkaAddr,
    loanAmount: LOAN,
    minProfit: 1n,
    deadline: FAR_DEADLINE,
  };

  const planBalancerTri = {
    legs: [
      {
        legType: LegType.V2,
        target: r2a,
        data: ethers.AbiCoder.defaultAbiCoder().encode(
          ["address[]"],
          [[tkaAddr, tkbAddr]]
        ),
        amountIn: 0,
        minAmountOut: 1n,
      },
      {
        legType: LegType.BALANCER,
        target: vaultAddr,
        data: ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "uint256", "uint256", "address[]"],
          [poolId, 0, 1, [tkbAddr, tkcAddr]]
        ),
        amountIn: 0,
        minAmountOut: 1n,
      },
      {
        legType: LegType.V2,
        target: r2c,
        data: ethers.AbiCoder.defaultAbiCoder().encode(
          ["address[]"],
          [[tkcAddr, tkaAddr]]
        ),
        amountIn: 0,
        minAmountOut: 1n,
      },
    ],
    loanToken: tkaAddr,
    loanAmount: LOAN,
    minProfit: 1n,
    deadline: FAR_DEADLINE,
  };

  const pathV3 = encodeV3Path(tkaAddr, FEE_3000, tkbAddr);
  await routerV3.setRate(tkaAddr, tkbAddr, 2, 1);
  await tkb.mint(r3, 1_000_000n * ONE);

  const planV3Leg = {
    legs: [
      {
        legType: LegType.V3,
        target: r3,
        data: pathV3,
        amountIn: 0,
        minAmountOut: 1n,
      },
      {
        legType: LegType.V2,
        target: r2b,
        data: ethers.AbiCoder.defaultAbiCoder().encode(
          ["address[]"],
          [[tkbAddr, tkcAddr]]
        ),
        amountIn: 0,
        minAmountOut: 1n,
      },
      {
        legType: LegType.V2,
        target: r2c,
        data: ethers.AbiCoder.defaultAbiCoder().encode(
          ["address[]"],
          [[tkcAddr, tkaAddr]]
        ),
        amountIn: 0,
        minAmountOut: 1n,
      },
    ],
    loanToken: tkaAddr,
    loanAmount: LOAN,
    minProfit: 1n,
    deadline: FAR_DEADLINE,
  };

  return {
    owner,
    pending,
    sink,
    tka,
    tkb,
    arb,
    arbAddr,
    tkaAddr,
    poolAddr,
    vaultAddr,
    planV2Tri,
    planCurveTri,
    planBalancerTri,
    planV3Leg,
    EXPECTED_PROFIT,
    FINAL_OUT,
  };
}

describe("HonestFlashArbV4", () => {
  it("3-hop V2: credits profit via Aave flash", async () => {
    const f = await loadFixture(deployFixture);
    const poolBefore = await f.tka.balanceOf(f.poolAddr);

    await expect(
      f.arb.startArbitrage(FlashSource.AAVE, f.planV2Tri)
    )
      .to.emit(f.arb, "FlashCompleted")
      .withArgs(f.tkaAddr, LOAN, PREMIUM, f.EXPECTED_PROFIT);

    expect(await f.arb.accumulatedProfit(f.tkaAddr)).to.equal(
      f.EXPECTED_PROFIT
    );
    expect(await f.tka.balanceOf(f.poolAddr)).to.equal(poolBefore + PREMIUM);
  });

  it("3-hop with Curve leg succeeds", async () => {
    const f = await loadFixture(deployFixture);
    await f.arb.startArbitrage(FlashSource.AAVE, f.planCurveTri);
    expect(await f.arb.accumulatedProfit(f.tkaAddr)).to.equal(
      f.EXPECTED_PROFIT
    );
  });

  it("3-hop with Balancer leg via vault flash", async () => {
    const f = await loadFixture(deployFixture);
    await f.arb.startArbitrage(FlashSource.BALANCER_VAULT, f.planBalancerTri);
    expect(await f.arb.accumulatedProfit(f.tkaAddr)).to.be.gt(0n);
  });

  it("V3+V2 tri-hop emits SwapExecuted on all legs", async () => {
    const f = await loadFixture(deployFixture);
    const tx = await f.arb.startArbitrage(FlashSource.AAVE, f.planV3Leg);
    const receipt = await tx.wait();
    const swaps = receipt.logs.filter(
      (l) => l.fragment && l.fragment.name === "SwapExecuted"
    );
    expect(swaps.length).to.equal(3);
  });

  it("reverts GainTooSmall when minProfit too high", async () => {
    const f = await loadFixture(deployFixture);
    const bad = { ...f.planV2Tri, minProfit: f.FINAL_OUT };
    await expect(
      f.arb.startArbitrage(FlashSource.AAVE, bad)
    ).to.be.revertedWithCustomError(f.arb, "GainTooSmall");
  });

  it("reverts BadCallback from direct executeOperation", async () => {
    const f = await loadFixture(deployFixture);
    await expect(
      f.arb.executeOperation(f.tkaAddr, LOAN, PREMIUM, f.owner.address, "0x")
    ).to.be.revertedWithCustomError(f.arb, "BadCallback");
  });

  it("reverts when not owner", async () => {
    const f = await loadFixture(deployFixture);
    await expect(
      f.arb.connect(f.pending).startArbitrage(FlashSource.AAVE, f.planV2Tri)
    ).to.be.revertedWithCustomError(f.arb, "Unauthorized");
  });

  it("reverts when paused", async () => {
    const f = await loadFixture(deployFixture);
    await f.arb.pause();
    await expect(
      f.arb.startArbitrage(FlashSource.AAVE, f.planV2Tri)
    ).to.be.revertedWithCustomError(f.arb, "ContractPaused");
  });

  it("reverts TooFewLegs for single leg", async () => {
    const f = await loadFixture(deployFixture);
    const bad = {
      ...f.planV2Tri,
      legs: [f.planV2Tri.legs[0]],
    };
    await expect(
      f.arb.startArbitrage(FlashSource.AAVE, bad)
    ).to.be.revertedWithCustomError(f.arb, "TooFewLegs");
  });

  it("Ownable2Step: transfer requires accept", async () => {
    const f = await loadFixture(deployFixture);
    await f.arb.transferOwnership(f.pending.address);
    await f.arb.connect(f.pending).acceptOwnership();
    expect(await f.arb.owner()).to.equal(f.pending.address);
  });

  it("dynamic whitelist: curve pool and token", async () => {
    const f = await loadFixture(deployFixture);
    const ERC20 = await ethers.getContractFactory("MockERC20");
    const stray = await ERC20.deploy("X", "X", 18);
    await stray.waitForDeployment();
    const strayAddr = await stray.getAddress();

    await f.arb.addToken(strayAddr);
    expect(await f.arb.tokenWhitelist(strayAddr)).to.equal(true);
    await f.arb.removeToken(strayAddr);

    const Curve = await ethers.getContractFactory("MockCurvePool");
    const extra = await Curve.deploy();
    await extra.waitForDeployment();
    const extraAddr = await extra.getAddress();
    await f.arb.addCurvePool(extraAddr);
    expect(await f.arb.curvePoolWhitelist(extraAddr)).to.equal(true);
    await f.arb.removeCurvePool(extraAddr);
  });

  it("sweepToken syncs accumulatedProfit", async () => {
    const f = await loadFixture(deployFixture);
    await f.arb.startArbitrage(FlashSource.AAVE, f.planV2Tri);
    const profit = await f.arb.accumulatedProfit(f.tkaAddr);
    await f.arb.pause();
    await f.arb.sweepToken(f.tkaAddr, f.sink.address, profit);
    expect(await f.arb.accumulatedProfit(f.tkaAddr)).to.equal(0n);
  });

  it("INVARIANT: balance >= accumulatedProfit after arb", async () => {
    const f = await loadFixture(deployFixture);
    await f.arb.startArbitrage(FlashSource.AAVE, f.planV2Tri);
    const bal = await f.tka.balanceOf(f.arbAddr);
    const acc = await f.arb.accumulatedProfit(f.tkaAddr);
    expect(bal).to.be.gte(acc);
  });
});
