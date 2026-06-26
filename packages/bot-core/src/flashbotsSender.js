const { ethers } = require("ethers");
const {
  FlashbotsBundleProvider,
} = require("@flashbots/ethers-provider-bundle");
const { resolveTxFees, estimateGasLimit } = require("./gasOracle");

async function createFlashbotsProvider(config, executionSigner, httpProvider) {
  const authKey = config.flashbotsAuthKey || config.privateKey;
  const authSigner = new ethers.Wallet(authKey, httpProvider);
  return FlashbotsBundleProvider.create(
    httpProvider,
    authSigner,
    config.flashbotsRelay
  );
}

async function signArbitrageTx({
  config,
  arbContract,
  asset,
  loanAmount,
  plan,
  flashParams,
  signer,
  httpProvider,
}) {
  let populated;
  if (config.version === "v5") {
    populated = await arbContract.populateTransaction.startArbitrage(
      config.flashSource ?? 0,
      plan,
      flashParams || "0x"
    );
  } else if (config.version === "v4") {
    populated = await arbContract.populateTransaction.startArbitrage(
      config.flashSource ?? 0,
      plan
    );
  } else {
    populated = await arbContract.populateTransaction.startArbitrage(
      asset,
      loanAmount,
      plan
    );
  }

  const gasLimit = await estimateGasLimit(httpProvider, {
    ...populated,
    from: signer.address,
  });
  const fees = await resolveTxFees(httpProvider, config, gasLimit);
  const nonce = await signer.getTransactionCount("pending");

  return {
    signedTx: await signer.signTransaction({
      ...populated,
      chainId: config.chainId,
      nonce,
      gasLimit,
      ...fees,
    }),
    gasLimit,
  };
}

function targetBlocks(config, baseBlock) {
  const blocks = [];
  for (let i = 0; i < config.multiBlockTargets; i++) {
    blocks.push(baseBlock + 1 + i);
  }
  return blocks;
}

async function simulateAndSend({
  config,
  flashbotsProvider,
  arbContract,
  asset,
  loanAmount,
  plan,
  flashParams,
  signer,
  httpProvider,
  baseBlock,
  log,
  stats,
  metricsStore,
}) {
  const { signedTx, gasLimit } = await signArbitrageTx({
    config,
    arbContract,
    asset,
    loanAmount,
    plan,
    flashParams,
    signer,
    httpProvider,
  });

  const blocks = targetBlocks(config, baseBlock);
  const primaryBlock = blocks[0];

  const simulation = await flashbotsProvider.simulate(
    [signedTx],
    primaryBlock
  );

  if ("error" in simulation) {
    stats.simulationFailures += 1;
    metricsStore?.record("simulation_failed", {
      block: primaryBlock,
      error: simulation.error.message,
    });
    log.warn(
      {
        block: primaryBlock,
        error: simulation.error.message,
      },
      "bundle simulation failed"
    );
    return { ok: false, simulation };
  }

  log.info(
    {
      targetBlock: primaryBlock,
      coinbaseDiff: simulation.coinbaseDiff,
      totalGasUsed: simulation.totalGasUsed,
      gasLimit: gasLimit.toString(),
      builderTipWei: config.builderTipWei,
    },
    "simulation ok"
  );

  metricsStore?.record("simulation_ok", {
    block: primaryBlock,
    coinbaseDiff: String(simulation.coinbaseDiff || 0),
    totalGasUsed: String(simulation.totalGasUsed || 0),
  });

  if (config.dryRun) {
    return { ok: true, simulation, dryRun: true, targetBlocks: blocks };
  }

  const submissions = await Promise.all(
    blocks.map(async (blockNum) => {
      const response = await flashbotsProvider.sendBundle([signedTx], blockNum);
      return { blockNum, response };
    })
  );

  stats.bundlesSubmitted += submissions.length;
  metricsStore?.record("bundle_submitted", {
    blocks,
    count: submissions.length,
  });

  const resolutions = await Promise.all(
    submissions.map(async ({ blockNum, response }) => {
      try {
        const resolution = await response.wait();
        if (resolution === 0) {
          stats.bundlesIncluded += 1;
          metricsStore?.record("bundle_included", { blockNum });
          log.info({ blockNum, resolution }, "bundle included");
        } else {
          log.debug({ blockNum, resolution }, "bundle not included");
        }
        return { blockNum, resolution };
      } catch (err) {
        log.warn({ blockNum, err: err.message }, "bundle wait failed");
        return { blockNum, error: err.message };
      }
    })
  );

  return { ok: true, simulation, resolutions, targetBlocks: blocks };
}

module.exports = {
  createFlashbotsProvider,
  simulateAndSend,
  signArbitrageTx,
};
