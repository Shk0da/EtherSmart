# Deploy HonestFlashArbV4

## Prerequisites

- `v4/.env` with `DEPLOYER_PK`, `MAINNET_RPC_URL`, optional `ETHERSCAN_API_KEY`
- Deployer wallet funded with ETH
- `npm run compile` in `v4/`

## Constructor

```solidity
constructor(
  address pool_,
  address balancerVault_,
  address[] routersV2,
  address[] routersV3,
  address[] curvePools,
  address[] tokens
)
```

## Mainnet defaults (`scripts/deploy.js`)

| Param | Address |
|-------|---------|
| Aave Pool | `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` |
| Balancer Vault | `0xBA12222222228d8Ba445958a75a0704d566BF2C8` |
| Uni V2 Router | `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D` |
| Sushi Router | `0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F` |
| Uni V3 Router | `0x68b3465833fb72A70eDF967F1a4677710b7893f0` |
| Curve 3pool | `0xbEbc44782C7Db0a1A60Cb6fe97d0b48303205716` |

## Deploy

```bash
cd v4
npm run compile
npm run deploy
```

## Post-deploy

1. Set `ARB_CONTRACT=<address>` in `v4/.env`
2. `BOT_PK` must be contract owner
3. `cd bot && npm start` (DRY_RUN=true by default)
4. Health: `http://127.0.0.1:8789/health`

## Flash sources

| `FLASH_SOURCE` | On-chain enum |
|----------------|---------------|
| `0` | Aave `flashLoanSimple` (default) |
| `1` | Balancer vault `flashLoan` |
