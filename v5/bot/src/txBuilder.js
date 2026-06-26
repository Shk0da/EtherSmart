const { ethers } = require("ethers");
const config = require("./config");
const {
  calcThresholds,
  quoteLegOut,
  venueTarget,
  pickFlashSource,
} = require("@ethersmart/bot-core");
const {
  ADAPTER_V2,
  ADAPTER_V3,
  ADAPTER_CURVE,
  ADAPTER_BALANCER,
} = require("./adapters");

function applySlippage(amount, bps) {
  const v = typeof amount === "bigint" ? amount : BigInt(amount.toString());
  return (v * BigInt(10000 - bps)) / 10000n;
}

function encodeStepData(leg) {
  if (leg.venue === "uni" || leg.venue === "sushi") {
    return ethers.utils.defaultAbiCoder.encode(
      ["address[]"],
      [[leg.tokenIn, leg.tokenOut]]
    );
  }
  if (leg.venue === "curve") {
    return ethers.utils.defaultAbiCoder.encode(
      ["int128", "int128", "address", "address"],
      [leg.curveI, leg.curveJ, leg.tokenIn, leg.tokenOut]
    );
  }
  if (leg.venue === "balancer") {
    const assets = leg.balancerAssets || [leg.tokenIn, leg.tokenOut];
    const poolId = leg.poolId || config.addresses.balancerPoolId;
    return ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "uint256", "uint256", "address[]"],
      [
        poolId,
        assets.indexOf(leg.tokenIn),
        assets.indexOf(leg.tokenOut),
        assets,
      ]
    );
  }
  throw new Error(`Unsupported venue: ${leg.venue}`);
}

function adapterForVenue(venue) {
  if (venue === "uni" || venue === "sushi") return ADAPTER_V2;
  if (venue === "uniV3") return ADAPTER_V3;
  if (venue === "curve") return ADAPTER_CURVE;
  if (venue === "balancer") return ADAPTER_BALANCER;
  throw new Error(`Unknown venue: ${venue}`);
}

function stepTarget(leg) {
  if (leg.venue === "uniV3") return config.addresses.uniV3Router;
  if (leg.venue === "balancer") return config.addresses.balancerVault;
  return venueTarget(config, leg);
}

async function buildPlanForOpportunity(provider, opportunity, block) {
  const pick = pickFlashSource(config, opportunity);
  const { minProfit } = calcThresholds(
    opportunity.loanAmount,
    config,
    pick.premiumBps
  );
  const deadline = block.timestamp + 120;
  const steps = [];
  let amountIn = opportunity.loanAmount;

  for (const legDef of opportunity.legs) {
    const quoted = await quoteLegOut(provider, config, legDef, amountIn);
    steps.push({
      adapterId: adapterForVenue(legDef.venue),
      target: stepTarget(legDef),
      data: encodeStepData(legDef),
      minAmountOut: applySlippage(quoted, config.slippageBps).toString(),
    });
    amountIn = quoted;
  }

  return {
    steps,
    loanToken: opportunity.loanToken,
    loanAmount: opportunity.loanAmount.toString(),
    minProfit: minProfit.toString(),
    deadline,
  };
}

module.exports = {
  buildPlanForOpportunity,
  encodeStepData,
  adapterForVenue,
  applySlippage,
};
