const TOKEN_META = {
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": {
    symbol: "USDC",
    decimals: 6,
  },
  "0x6b175474e89094c44da98b954eedeac495271d0f": {
    symbol: "DAI",
    decimals: 18,
  },
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": {
    symbol: "WETH",
    decimals: 18,
  },
};

function tokenMeta(address) {
  return (
    TOKEN_META[address?.toLowerCase()] || { symbol: "TOKEN", decimals: 18 }
  );
}

module.exports = { TOKEN_META, tokenMeta };
