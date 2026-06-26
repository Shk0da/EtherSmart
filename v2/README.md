# HonestFlashArbV2

Flash-loan арбитраж через **Aave V3** и **Uniswap V2 / SushiSwap** only.

## Структура

```
v2/
  contracts/HonestFlashArbV2.sol   # контракт
  test/                            # mock + fork тесты
  scripts/deploy.js                # деплой
  bot/                             # off-chain бот (V2 ABI)
  DEPLOY.md                        # инструкция деплоя
  hardhat.config.js
  package.json
  .env.example
```

## Быстрый старт

```bash
cd v2
copy .env.example .env
npm install
npx hardhat compile
npx hardhat test

# деплой
npm run deploy:sepolia

# бот (после деплоя: ARB_CONTRACT в v2/.env)
cd bot && npm install && npm start
```

## Отличия от V3

| | V2 | [V3](../v3/README.md) |
|---|----|----|
| DEX | V2 only | V2 + Uniswap V3 |
| Owner | Immutable | Ownable2Step |
| Whitelist | Только в конструкторе | Dynamic add/remove |
| `ArbPlan` | Простая struct | `LegKind` + V3 bytes path |

Общий roadmap: [0. TODO.md](../0.%20TODO.md) в корне репозитория.
