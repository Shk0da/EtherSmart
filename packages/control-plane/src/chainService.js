const fs = require("fs");
const { ethers } = require("ethers");
const { abs, rpcUrl } = require("./config");
const { readEnvValue } = require("./botManager");

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

const ARB_ABI = [
  "function accumulatedProfit(address) view returns (uint256)",
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
  "function profitReceiver() view returns (address)",
];

const { tokenMeta } = require("./tokenMeta");

function getProvider() {
  const url = rpcUrl || process.env.MAINNET_RPC_URL;
  if (!url) return null;
  return new ethers.providers.JsonRpcProvider(url);
}

async function getBalances(bot) {
  const contractAddress = readEnvValue(bot, "ARB_CONTRACT");
  if (!contractAddress) {
    return { error: "ARB_CONTRACT not set" };
  }

  const provider = getProvider();
  if (!provider) {
    return { error: "MAINNET_RPC_URL not configured on control-plane" };
  }

  const arb = new ethers.Contract(contractAddress, ARB_ABI, provider);
  const [onChainOwner, paused, profitReceiver] = await Promise.all([
    arb.owner(),
    arb.paused(),
    arb.profitReceiver().catch(() => null),
  ]);

  const ethBalance = await provider.getBalance(onChainOwner);

  const profits = [];
  for (const token of bot.profitTokens) {
    const meta = tokenMeta(token);
    const accumulated = await arb.accumulatedProfit(token);
    const erc20 = new ethers.Contract(token, ERC20_ABI, provider);
    const contractBal = await erc20.balanceOf(contractAddress);
    profits.push({
      token,
      symbol: meta.symbol,
      decimals: meta.decimals,
      accumulated: accumulated.toString(),
      accumulatedFormatted: ethers.utils.formatUnits(
        accumulated,
        meta.decimals
      ),
      contractBalance: contractBal.toString(),
      contractBalanceFormatted: ethers.utils.formatUnits(
        contractBal,
        meta.decimals
      ),
    });
  }

  return {
    contract: contractAddress,
    owner: onChainOwner,
    profitReceiver,
    paused,
    ethBalance: ethBalance.toString(),
    ethBalanceFormatted: ethers.utils.formatEther(ethBalance),
    profits,
  };
}

function loadArtifact(bot) {
  const p = abs(bot.contractArtifact);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

module.exports = { getBalances, loadArtifact, getProvider };
