const { ethers } = require("ethers");

const ROUTER_ABI = [
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)",
];

const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) external payable returns (tuple(bool success, bytes returnData)[] returnData)",
];

async function batchGetAmountsOut(provider, config, requests) {
  if (requests.length === 0) return [];

  const multicall = new ethers.Contract(
    config.addresses.multicall3,
    MULTICALL3_ABI,
    provider
  );
  const iface = new ethers.utils.Interface(ROUTER_ABI);

  const calls = requests.map(({ target, amountIn, path }) => ({
    target,
    allowFailure: true,
    callData: iface.encodeFunctionData("getAmountsOut", [amountIn, path]),
  }));

  const results = await multicall.aggregate3(calls);
  const amounts = [];

  for (let i = 0; i < results.length; i++) {
    const { success, returnData } = results[i];
    if (!success || returnData === "0x") {
      amounts.push(0n);
      continue;
    }
    const decoded = iface.decodeFunctionResult("getAmountsOut", returnData);
    amounts.push(decoded.amounts[decoded.amounts.length - 1]);
  }

  return amounts;
}

module.exports = { batchGetAmountsOut };
