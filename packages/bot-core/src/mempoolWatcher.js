const { ethers } = require("ethers");

const SWAP_SELECTORS = new Set([
  "0x38ed1739", // swapExactTokensForTokens
  "0x414bf389", // exactInputSingle (Uni V3 router)
  "0xc04b8d59", // exactInput
  "0x3df02124", // Curve exchange(int128,int128,uint256,uint256)
]);

/**
 * Optional mempool watcher for large pending swaps (default off via config.useMempool).
 * Emits triggers for bundle backrun planning; does not submit txs itself.
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

      const minWei = ethers.utils.parseEther(
        String(config.mempoolMinEth || "1")
      );
      if (tx.value && tx.value.gte(minWei)) {
        onTrigger({ txHash, selector, value: tx.value.toString() });
        return;
      }

      if (config.mempoolMinUsd && config.mempoolMinUsd > 0) {
        onTrigger({ txHash, selector, note: "swap_selector_match" });
      }
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
      provider = wsProvider;
      running = true;
      provider.on("pending", handlePending);
      log.info(
        { mempoolMinEth: config.mempoolMinEth || "1" },
        "mempool watcher active"
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
