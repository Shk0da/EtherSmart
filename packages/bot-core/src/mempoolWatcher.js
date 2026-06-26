const { ethers } = require("ethers");

const SWAP_SELECTORS = new Set([
  "0x38ed1739", // swapExactTokensForTokens
  "0x414bf389", // exactInputSingle
  "0xc04b8d59", // exactInput
  "0x3df02124", // Curve exchange
  "0x128acb08", // Uni V3 pool swap
]);

const V2_ROUTER_IFACE = new ethers.utils.Interface([
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)",
]);

/**
 * Optional mempool watcher — decodes swap txs, emits triggers for backrun scan.
 */
function createMempoolWatcher({ config, log, onTrigger }) {
  let provider = null;
  let running = false;

  async function handlePending(txHash) {
    if (!running || !provider) return;
    try {
      const tx = await provider.getTransaction(txHash);
      if (!tx || !tx.data || tx.data.length < 10) return;

      const selector = tx.data.slice(0, 10).toLowerCase();
      if (!SWAP_SELECTORS.has(selector)) return;

      const graphTokens = config._graphTokens;
      if (graphTokens && graphTokens.size > 0 && selector === "0x38ed1739") {
        try {
          const decoded = V2_ROUTER_IFACE.decodeFunctionData(
            "swapExactTokensForTokens",
            tx.data
          );
          const path = decoded.path.map((a) => a.toLowerCase());
          const touchesGraph = path.some((t) => graphTokens.has(t));
          if (!touchesGraph) return;
        } catch {
          return;
        }
      }

      const trigger = {
        txHash,
        selector,
        from: tx.from,
        to: tx.to,
      };

      if (selector === "0x38ed1739") {
        try {
          const decoded = V2_ROUTER_IFACE.decodeFunctionData(
            "swapExactTokensForTokens",
            tx.data
          );
          trigger.amountIn = decoded.amountIn.toString();
          trigger.path = decoded.path;
        } catch {
          /* ignore decode errors */
        }
      }

      const minWei = ethers.utils.parseEther(
        String(config.mempoolMinEth || "1")
      );
      if (tx.value && tx.value.gte(minWei)) {
        trigger.valueWei = tx.value.toString();
      }

      onTrigger(trigger);
    } catch (err) {
      log.debug({ txHash, err: err.message }, "mempool tx parse skip");
    }
  }

  return {
    async start(wsProvider) {
      if (!config.useMempool) {
        log.info("mempool watcher disabled (USE_MEMPOOL=false)");
        return;
      }
      if (config.graphEdges?.length) {
        const tokens = new Set();
        for (const e of config.graphEdges) {
          tokens.add(e.tokenIn.toLowerCase());
          tokens.add(e.tokenOut.toLowerCase());
        }
        config._graphTokens = tokens;
      }
      provider = wsProvider;
      running = true;
      provider.on("pending", handlePending);
      log.info(
        { mempoolMinEth: config.mempoolMinEth || "1" },
        "mempool watcher active (V5 decode)"
      );
    },
    stop() {
      running = false;
      if (provider) {
        provider.removeListener("pending", handlePending);
      }
    },
  };
}

module.exports = { createMempoolWatcher };
