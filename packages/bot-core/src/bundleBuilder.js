const { signArbitrageTx } = require("./flashbotsSender");

/**
 * Simulate and optionally send a 2-tx backrun bundle [trigger, arb].
 */
async function simulateAndSendBundle({
  config,
  flashbotsProvider,
  arbContract,
  plan,
  flashParams,
  triggerSignedTx,
  signer,
  httpProvider,
  baseBlock,
  log,
  stats,
  metricsStore,
}) {
  const { signedTx: arbSignedTx } = await signArbitrageTx({
    config,
    arbContract,
    plan,
    flashParams,
    signer,
    httpProvider,
  });

  const primaryBlock = baseBlock + 1;
  const bundle = triggerSignedTx
    ? [triggerSignedTx, arbSignedTx]
    : [arbSignedTx];

  const simulation = await flashbotsProvider.simulate(bundle, primaryBlock);

  if ("error" in simulation) {
    stats.simulationFailures += 1;
    metricsStore?.record("simulation_failed", {
      block: primaryBlock,
      error: simulation.error.message,
      bundleSize: bundle.length,
    });
    log.warn(
      { block: primaryBlock, error: simulation.error.message },
      "backrun bundle simulation failed"
    );
    return { ok: false, simulation };
  }

  metricsStore?.record("simulation_ok", {
    block: primaryBlock,
    bundleSize: bundle.length,
    coinbaseDiff: String(simulation.coinbaseDiff || 0),
  });

  log.info(
    {
      targetBlock: primaryBlock,
      bundleSize: bundle.length,
      coinbaseDiff: simulation.coinbaseDiff,
    },
    "backrun bundle simulation ok"
  );

  if (config.dryRun) {
    return { ok: true, simulation, dryRun: true };
  }

  const response = await flashbotsProvider.sendBundle(bundle, primaryBlock);
  stats.bundlesSubmitted += 1;
  metricsStore?.record("bundle_submitted", {
    block: primaryBlock,
    bundleSize: bundle.length,
  });

  try {
    const resolution = await response.wait();
    if (resolution === 0) {
      stats.bundlesIncluded += 1;
      metricsStore?.record("bundle_included", { block: primaryBlock });
    }
    return { ok: true, simulation, resolution };
  } catch (err) {
    log.warn({ err: err.message }, "backrun bundle wait failed");
    return { ok: false, error: err.message };
  }
}

module.exports = { simulateAndSendBundle };
