const { ethers } = require("ethers");
const config = require("./config");
const {
  calcThresholds,
  quoteLegOut,
  venueTarget,
  premiumBpsForSource,
} = require("@ethersmart/bot-core");
const { LegType } = require("./legTypes");
const { encodeV3Path, FEE_3000 } = require("./v3Path");

function applySlippage(amount, bps) {
  const v = typeof amount === "bigint" ? amount : BigInt(amount.toString());
  return (v * BigInt(10000 - bps)) / 10000n;
}

function encodeLegData(leg) {
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
    const assetInIndex = assets.indexOf(leg.tokenIn);
    const assetOutIndex = assets.indexOf(leg.tokenOut);
    return ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "uint256", "uint256", "address[]"],
      [poolId, assetInIndex, assetOutIndex, assets]
    );
  }
  if (leg.venue === "uniV3") {
    const fee = leg.v3Fee || FEE_3000;
    return encodeV3Path([leg.tokenIn, leg.tokenOut], [fee]);
  }
  throw new Error(`Unsupported venue: ${leg.venue}`);
}

function legTypeForVenue(venue) {
  if (venue === "uni" || venue === "sushi") return LegType.V2;
  if (venue === "uniV3") return LegType.V3;
  if (venue === "curve") return LegType.CURVE;
  if (venue === "balancer") return LegType.BALANCER;
  throw new Error(`Unknown venue: ${venue}`);
}

function legTarget(leg) {
  if (leg.venue === "uniV3") return config.addresses.uniV3Router;
  if (leg.venue === "balancer") return config.addresses.balancerVault;
  return venueTarget(config, leg);
}

async function buildPlanForOpportunity(provider, opportunity, block) {
  const premiumBps = premiumBpsForSource(config.flashSource ?? 0);
  const { minProfit } = calcThresholds(
    opportunity.loanAmount,
    config,
    premiumBps
  );
  const deadline = block.timestamp + 120;
  const legs = [];
  let amountIn = opportunity.loanAmount;

  for (const legDef of opportunity.legs) {
    const quoted = await quoteLegOut(provider, config, legDef, amountIn);
    legs.push({
      legType: legTypeForVenue(legDef.venue),
      target: legTarget(legDef),
      data: encodeLegData(legDef),
      amountIn: 0,
      minAmountOut: applySlippage(quoted, config.slippageBps).toString(),
    });
    amountIn = quoted;
  }

  return {
    legs,
    loanToken: opportunity.loanToken,
    loanAmount: opportunity.loanAmount.toString(),
    minProfit: minProfit.toString(),
    deadline,
  };
}

module.exports = {
  buildPlanForOpportunity,
  encodeLegData,
  legTypeForVenue,
  applySlippage,
};
