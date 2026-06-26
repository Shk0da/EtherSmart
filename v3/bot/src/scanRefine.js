const config = require("./config");
const { quoteV2Out, DEX_ROUTERS } = require("./txBuilder");
const { quoteV3ExactInput, encodeV3Path } = require("./quoterV2");

/**
 * Re-quote final round-trip output when USE_V3_LEGS matches txBuilder mixed paths.
 * @returns {bigint | null} refined finalOut, or null to keep scanner quote
 */
async function refineOpportunityFinalOut(provider, opportunity, pair) {
  if (!config.useV3Legs || !pair?.v3Fee) return null;

  const uniInvolved =
    opportunity.leg1Dex === "uni" || opportunity.leg2Dex === "uni";
  if (!uniInvolved) return null;

  const { asset, bridge, v3Fee } = pair;
  const loanAmount = opportunity.loanAmount;
  const routerV2Leg1 = DEX_ROUTERS[opportunity.leg1Dex]();
  const routerV2Leg2 = DEX_ROUTERS[opportunity.leg2Dex]();

  if (opportunity.leg2Dex === "uni") {
    const out1 = await quoteV2Out(provider, routerV2Leg1, loanAmount, [
      asset,
      bridge,
    ]);
    if (!out1) return 0n;
    const pathToAsset = encodeV3Path([bridge, asset], [v3Fee]);
    const v3Out = await quoteV3ExactInput(provider, pathToAsset, out1);
    return v3Out ?? 0n;
  }

  if (opportunity.leg1Dex === "uni") {
    const pathToBridge = encodeV3Path([asset, bridge], [v3Fee]);
    const v3Out = await quoteV3ExactInput(provider, pathToBridge, loanAmount);
    if (v3Out == null) return 0n;
    return quoteV2Out(provider, routerV2Leg2, v3Out, [bridge, asset]);
  }

  return null;
}

module.exports = { refineOpportunityFinalOut };
