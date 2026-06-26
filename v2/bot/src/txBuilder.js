const { ethers } = require("ethers");
const config = require("./config");
const { calcThresholds } = require("@ethersmart/bot-core");

const ROUTER_ABI = [
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)",
];

function applySlippage(amount, bps) {
  return (amount * BigInt(10000 - bps)) / 10000n;
}

async function buildPlanForOpportunity(provider, opportunity, block) {
  const pair = config.pairs.find((p) => p.name === opportunity.pair);
  const { minProfit } = calcThresholds(opportunity.loanAmount, config);

  const deadline = block.timestamp + 120;
  const router1 =
    opportunity.leg1Dex === "uni"
      ? config.addresses.uniV2Router
      : config.addresses.sushiRouter;
  const router2 =
    opportunity.leg2Dex === "uni"
      ? config.addresses.uniV2Router
      : config.addresses.sushiRouter;

  const r1 = new ethers.Contract(router1, ROUTER_ABI, provider);
  const r2 = new ethers.Contract(router2, ROUTER_ABI, provider);
  const path1 = [pair.asset, pair.bridge];
  const path2 = [pair.bridge, pair.asset];
  const out1 = (await r1.getAmountsOut(opportunity.loanAmount, path1)).amounts[1];
  const out2 = (await r2.getAmountsOut(out1, path2)).amounts[1];

  return {
    router1,
    router2,
    path1,
    path2,
    amountOutMin1: applySlippage(out1, config.slippageBps),
    amountOutMin2: applySlippage(out2, config.slippageBps),
    minProfit,
    deadline,
  };
}

module.exports = { buildPlanForOpportunity };
