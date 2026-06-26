# Deploy HonestFlashArbV5

> **Полное руководство (все версии, пополнение, алгоритм):** [docs/DEPLOYMENT_GUIDE.md](../docs/DEPLOYMENT_GUIDE.md)

## Compile & deploy

```bash
cd v5
npm install
npm run compile
npm run deploy
```

Requires `DEPLOYER_PK` and `MAINNET_RPC_URL` in `v5/.env`.

## Constructor

```solidity
constructor(
    address pool_,              // Aave V3 Pool
    address balancerVault_,
    address[] memory routersV2_,
    address[] memory routersV3_,
    address[] memory curvePools_,
    address[] memory tokens_
)
```

## Verify (Etherscan)

Arguments: same order as constructor. No `weth` parameter.

## Post-deploy checklist

1. Copy deployed address → `ARB_CONTRACT` in `v5/.env`
2. `BOT_PK` must be contract **owner** (or transfer via Ownable2Step)
3. If using Uni V3 pool flash: `addUniV3Pool(pool)` for each whitelisted pool
4. Compile artifacts for bot: `npm run compile` (bot reads `v5/artifacts/...`)
5. `cd v5/bot && npm start` with `DRY_RUN=true`
6. Confirm `GET http://127.0.0.1:8790/health` (set `HEALTH_TOKEN` in production)

## Flash sources (on-chain)

`startArbitrage(uint8 source, ExecutionPlan plan, bytes flashParams)`:

| `source` | Flash | `flashParams` |
|----------|-------|---------------|
| `0` | Aave | `0x` |
| `1` | Balancer Vault | `0x` |
| `2` | Uni V3 pool | `abi.encode(pool, amount0, amount1)` |

Pool must be whitelisted via `addUniV3Pool` before use.

## Mainnet reference addresses

| Contract | Address |
|----------|---------|
| Aave V3 Pool | `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` |
| Balancer Vault | `0xBA12222222228d8Ba445958a75a0704d566BF2C8` |
| Uni V2 Router | `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D` |
| Sushi Router | `0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F` |
| Uni V3 SwapRouter02 | `0x68b3465833fb72A70eDF967F1a4677710b7893f0` |
