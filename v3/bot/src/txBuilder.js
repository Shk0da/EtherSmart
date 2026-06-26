const { ethers } = require("ethers");
const config = require("./config");
const { calcThresholds } = require("@ethersmart/bot-core");
const { LegKind } = require("./v3Path");
const { quoteV3ExactInput, encodeV3Path } = require("./quoterV2");

const ROUTER_ABI = [
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)",
];

const DEX_ROUTERS = {
  uni: () => config.addresses.uniV2Router,
  sushi: () => config.addresses.sushiRouter,
};

function applySlippage(amount, bps) {
  return (amount * BigInt(10000 - bps)) / 10000n;
}

async function quoteV2Out(provider, router, amountIn, path) {
  const r = new ethers.Contract(router, ROUTER_ABI, provider);
  const amounts = await r.getAmountsOut(amountIn, path);
  return amounts.amounts[amounts.amounts.length - 1];
}

async function buildV2Plan({
  router1,
  router2,
  asset,
  bridge,
  loanAmount,
  minProfit,
  deadline,
  slippageBps,
  provider,
}) {
  const path1 = [asset, bridge];
  const path2 = [bridge, asset];
  const out1 = await quoteV2Out(provider, router1, loanAmount, path1);
  const out2 = await quoteV2Out(provider, router2, out1, path2);

  return {
    leg1Kind: LegKind.V2,
    leg2Kind: LegKind.V2,
    router1,
    router2,
    path1,
    path2,
    path1V3: "0x",
    path2V3: "0x",
    amountOutMin1: applySlippage(out1, slippageBps),
    amountOutMin2: applySlippage(out2, slippageBps),
    minProfit,
    deadline,
  };
}

async function buildMixedPlan({
  opportunity,
  routerV2Leg1,
  routerV2Leg2,
  routerV3,
  asset,
  bridge,
  v3Fee,
  loanAmount,
  minProfit,
  deadline,
  slippageBps,
  provider,
}) {
  const pathToBridge = encodeV3Path([asset, bridge], [v3Fee]);
  const pathToAsset = encodeV3Path([bridge, asset], [v3Fee]);

  if (opportunity.leg2Dex === "uni") {
    const out1 = await quoteV2Out(provider, routerV2Leg1, loanAmount, [
      asset,
      bridge,
    ]);
    const v3Out = await quoteV3ExactInput(provider, pathToAsset, out1);

    return {
      leg1Kind: LegKind.V2,
      leg2Kind: LegKind.V3,
      router1: routerV2Leg1,
      router2: routerV3,
      path1: [asset, bridge],
      path2: [],
      path1V3: "0x",
      path2V3: pathToAsset,
      amountOutMin1: applySlippage(out1, slippageBps),
      amountOutMin2: applySlippage(v3Out, slippageBps),
      minProfit,
      deadline,
    };
  }

  const v3Out = await quoteV3ExactInput(provider, pathToBridge, loanAmount);
  const out2 = await quoteV2Out(provider, routerV2Leg2, v3Out, [
    bridge,
    asset,
  ]);

  return {
    leg1Kind: LegKind.V3,
    leg2Kind: LegKind.V2,
    router1: routerV3,
    router2: routerV2Leg2,
    path1: [],
    path2: [bridge, asset],
    path1V3: pathToBridge,
    path2V3: "0x",
    amountOutMin1: applySlippage(v3Out, slippageBps),
    amountOutMin2: applySlippage(out2, slippageBps),
    minProfit,
    deadline,
  };
}

async function buildPlanForOpportunity(provider, opportunity, block) {
  const pair = config.pairs.find((p) => p.name === opportunity.pair);
  const { minProfit } = calcThresholds(opportunity.loanAmount, config);
  const deadline = block.timestamp + 120;

  const routerV2Leg1 = DEX_ROUTERS[opportunity.leg1Dex]();
  const routerV2Leg2 = DEX_ROUTERS[opportunity.leg2Dex]();

  const canUseV3 =
    config.useV3Legs &&
    pair.v3Fee &&
    (opportunity.leg1Dex === "uni" || opportunity.leg2Dex === "uni");

  if (canUseV3) {
    return buildMixedPlan({
      opportunity,
      routerV2Leg1,
      routerV2Leg2,
      routerV3: config.addresses.uniV3Router,
      asset: pair.asset,
      bridge: pair.bridge,
      v3Fee: pair.v3Fee,
      loanAmount: opportunity.loanAmount,
      minProfit,
      deadline,
      slippageBps: config.slippageBps,
      provider,
    });
  }

  return buildV2Plan({
    router1: routerV2Leg1,
    router2: routerV2Leg2,
    asset: pair.asset,
    bridge: pair.bridge,
    loanAmount: opportunity.loanAmount,
    minProfit,
    deadline,
    slippageBps: config.slippageBps,
    provider,
  });
}

module.exports = { buildPlanForOpportunity, buildV2Plan, buildMixedPlan };
