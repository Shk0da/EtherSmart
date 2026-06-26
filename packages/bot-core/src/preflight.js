const { ethers } = require("ethers");

async function runPreflight({ httpProvider, signer, arbContract, config, log }) {
  const network = await httpProvider.getNetwork();
  if (network.chainId !== config.chainId) {
    throw new Error(
      `Chain ID mismatch: provider=${network.chainId}, config=${config.chainId}`
    );
  }

  const [owner, paused, ethBalance] = await Promise.all([
    arbContract.owner(),
    arbContract.paused(),
    httpProvider.getBalance(signer.address),
  ]);

  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(
      `Signer ${signer.address} is not contract owner (${owner})`
    );
  }

  if (paused) {
    log.warn("Contract is PAUSED — startArbitrage will revert until unpause");
  }

  const minEth = config.minEthBalanceWei;
  if (ethBalance.lt(minEth)) {
    log.warn(
      {
        balance: ethBalance.toString(),
        minRequired: minEth.toString(),
      },
      "low ETH balance for gas"
    );
  }

  log.info(
    {
      chainId: network.chainId,
      owner,
      paused,
      ethBalance: ethers.utils.formatEther(ethBalance),
      contract: config.contractAddress,
      loanSizes: config.loanSizesUsdc,
    },
    "preflight ok"
  );

  return { owner, paused, ethBalance };
}

module.exports = { runPreflight };
