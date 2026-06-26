# HonestFlashArbV3

Flash-loan арбитраж: **Aave V3**, mixed **Uniswap V2 + V3** legs, dynamic whitelists, Ownable2Step.

## Структура

```
v3/
  contracts/HonestFlashArbV3.sol   # контракт
  test/                            # mock тесты (V2+V3 legs)
  scripts/deploy.js                # деплoy
  bot/                             # off-chain бот (V3 ABI)
  DEPLOY.md                        # инструкция деплоя
  hardhat.config.js
  package.json
  .env.example
```

## Быстрый старт

```bash
cd v3
copy .env.example .env
npm install
npx hardhat compile
npx hardhat test

npm run deploy:sepolia

cd bot && npm install && npm start
```

## Возможности V3

- Mixed V2 + V3 legs в одном `ArbPlan`
- `addRouterV2/V3`, `addToken`, … после деплоя
- `transferOwnership` + `acceptOwnership`
- События `SwapExecuted`, `GasUsage`

Для простого V2-only сценария см. [v2/README.md](../v2/README.md).

Общий roadmap: [0. TODO.md](../0.%20TODO.md).
