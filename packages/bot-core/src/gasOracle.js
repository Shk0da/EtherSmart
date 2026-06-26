const { ethers } = require("ethers");

async function resolveTxFees(provider, config, gasLimit = null) {
  const feeData = await provider.getFeeData();
  const maxCap = ethers.utils.parseUnits(String(config.maxGasPriceGwei), "gwei");

  let maxFeePerGas = feeData.maxFeePerGas || feeData.gasPrice;
  let maxPriorityFeePerGas =
    feeData.maxPriorityFeePerGas || ethers.utils.parseUnits("2", "gwei");

  if (!maxFeePerGas) {
    maxFeePerGas = ethers.utils.parseUnits("30", "gwei");
  }

  const tipWei = ethers.BigNumber.from(config.builderTipWei || "0");
  if (tipWei.gt(0)) {
    const gas = ethers.BigNumber.from(gasLimit || config.estimatedArbGas || 900000);
    const safeGas = gas.gt(0) ? gas : ethers.BigNumber.from(900000);
    maxPriorityFeePerGas = maxPriorityFeePerGas.add(tipWei.div(safeGas));
  }

  if (maxFeePerGas.gt(maxCap)) {
    maxFeePerGas = maxCap;
  }
  if (maxPriorityFeePerGas.gt(maxFeePerGas)) {
    maxPriorityFeePerGas = maxFeePerGas;
  }

  return { maxFeePerGas, maxPriorityFeePerGas, type: 2 };
}

async function estimateGasLimit(provider, txRequest, fallback = 900000) {
  try {
    const estimate = await provider.estimateGas(txRequest);
    return estimate.mul(120).div(100);
  } catch {
    return ethers.BigNumber.from(fallback);
  }
}

async function estimateGasCostWei(provider, config) {
  const gasLimit = ethers.BigNumber.from(config.estimatedArbGas || 900000);
  const fees = await resolveTxFees(provider, config, gasLimit);
  return BigInt(gasLimit.mul(fees.maxFeePerGas).toString());
}

module.exports = { resolveTxFees, estimateGasLimit, estimateGasCostWei };
