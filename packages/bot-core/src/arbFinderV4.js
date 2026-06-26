const { ethers } = require("ethers");
const { batchGetAmountsOut } = require("./multicallPriceMonitor");
const { estimateGasCostWei } = require("./gasOracle");
const { calcThresholds, parseLoanSizes } = require("./arbFinder");

const CURVE_ABI = [
  "function get_dy(int128 i, int128 j, uint256 dx) external view returns (uint256)",
];

const BALANCER_QUERY_ABI = [
  "function queryBatchSwap(uint8 kind, tuple(bytes32 poolId, uint256 assetInIndex, uint256 assetOutIndex, uint256 amount, bytes userData)[] swaps, address[] assets, tuple(address sender, bool fromInternalBalance, address recipient, bool toInternalBalance) funds) external returns (int256[] assetDeltas)",
];

function toBigInt(v) {
  if (typeof v === "bigint") return v;
  if (ethers.BigNumber.isBigNumber(v)) return BigInt(v.toString());
  return BigInt(v);
}

function parseLoanAmountsForTriangles(config) {
  const sizes = parseLoanSizes(config);
  const out = {};
  for (const tri of config.triangles || []) {
    out[tri.name] = sizes.map((size) =>
      ethers.utils.parseUnits(size, tri.assetDecimals)
    );
  }
  return out;
}

function venueTarget(config, leg) {
  switch (leg.venue) {
    case "uni":
      return config.addresses.uniV2Router;
    case "sushi":
      return config.addresses.sushiRouter;
    case "curve":
      return leg.pool || config.addresses.curve3pool;
    case "balancer":
      return config.addresses.balancerVault;
    default:
      throw new Error(`Unknown venue: ${leg.venue}`);
  }
}

async function quoteLegOut(provider, config, leg, amountIn) {
  const amount = toBigInt(amountIn);
  if (amount === 0n) return 0n;

  if (leg.venue === "uni" || leg.venue === "sushi") {
    const router = venueTarget(config, leg);
    const amounts = await batchGetAmountsOut(provider, config, [
      {
        target: router,
        amountIn: ethers.BigNumber.from(amount.toString()),
        path: [leg.tokenIn, leg.tokenOut],
      },
    ]);
    return amounts[0] ? toBigInt(amounts[0]) : 0n;
  }

  if (leg.venue === "curve") {
    const pool = new ethers.Contract(
      venueTarget(config, leg),
      CURVE_ABI,
      provider
    );
    try {
      const out = await pool.get_dy(leg.curveI, leg.curveJ, amount.toString());
      return toBigInt(out);
    } catch {
      return 0n;
    }
  }

  if (leg.venue === "balancer") {
    const vault = new ethers.Contract(
      config.addresses.balancerVault,
      BALANCER_QUERY_ABI,
      provider
    );
    const poolId = leg.poolId || config.addresses.balancerPoolId;
    const assets = leg.balancerAssets || [leg.tokenIn, leg.tokenOut];
    const assetInIndex = assets.indexOf(leg.tokenIn);
    const assetOutIndex = assets.indexOf(leg.tokenOut);
    if (assetInIndex < 0 || assetOutIndex < 0) return 0n;

    const swaps = [
      {
        poolId,
        assetInIndex,
        assetOutIndex,
        amount: amount.toString(),
        userData: "0x",
      },
    ];
    const funds = {
      sender: ethers.constants.AddressZero,
      fromInternalBalance: false,
      recipient: ethers.constants.AddressZero,
      toInternalBalance: false,
    };

    try {
      const deltas = await vault.queryBatchSwap(0, swaps, assets, funds);
      const out = deltas[assetOutIndex];
      return out.lt(0) ? toBigInt(out.mul(-1)) : 0n;
    } catch {
      return 0n;
    }
  }

  return 0n;
}

/**
 * Three-round tri-hop scan with gas-adjusted net profit ranking.
 */
async function scanOpportunitiesV4(
  provider,
  config,
  triangles,
  loanAmountsByTriangle
) {
  const opportunities = [];
  const gasCostWei = await estimateGasCostWei(provider, config);

  for (const tri of triangles) {
    const amounts = loanAmountsByTriangle[tri.name] || [];
    if (!tri.legs || tri.legs.length !== 3) continue;

    const [leg1, leg2, leg3] = tri.legs;

    for (const rawLoan of amounts) {
      if (!rawLoan) continue;
      const loanIn = toBigInt(rawLoan);
      if (!loanIn) continue;

      const out1 = await quoteLegOut(provider, config, leg1, loanIn);
      if (!out1) continue;

      const out2 = await quoteLegOut(provider, config, leg2, out1);
      if (!out2) continue;

      const finalOut = await quoteLegOut(provider, config, leg3, out2);
      if (!finalOut) continue;

      const { debt, minProfit } = calcThresholds(loanIn, config);
      if (finalOut < debt + minProfit) continue;

      const grossProfit = finalOut - debt;
      const netProfit = grossProfit - gasCostWei;
      if (netProfit <= 0n) continue;

      opportunities.push({
        triangle: tri.name,
        loanToken: tri.loanToken,
        loanAmount: loanIn,
        legs: tri.legs,
        estimatedProfit: grossProfit,
        netProfit,
        gasCostWei,
        direction: tri.legs.map((l) => l.venue).join("->"),
      });
    }
  }

  return opportunities.sort((a, b) => (a.netProfit > b.netProfit ? -1 : 1));
}

module.exports = {
  scanOpportunitiesV4,
  parseLoanAmountsForTriangles,
  quoteLegOut,
  venueTarget,
};
