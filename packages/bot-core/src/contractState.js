function createContractState(initial = {}) {
  return {
    paused: Boolean(initial.paused),
    lastRefreshBlock: 0,
  };
}

async function refreshContractState(
  arbContract,
  state,
  blockNumber,
  intervalBlocks = 1
) {
  if (
    state.lastRefreshBlock > 0 &&
    blockNumber - state.lastRefreshBlock < intervalBlocks
  ) {
    return state;
  }

  state.paused = await arbContract.paused();
  state.lastRefreshBlock = blockNumber;
  return state;
}

module.exports = { createContractState, refreshContractState };
