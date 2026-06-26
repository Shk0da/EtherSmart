# EtherSmart

Flash-loan арбитраж на Ethereum. Три **независимых** стека:

| | [v2/](v2/) | [v3/](v3/) | [v4/](v4/) |
|---|------------|------------|------------|
| Контракт | `HonestFlashArbV2` | `HonestFlashArbV3` | `HonestFlashArbV4` |
| DEX | Uni V2 / Sushi | V2 + Uni V3 | V2/V3 + Curve + Balancer |
| Legs | 2 | 2 | 3–6 |
| Flash | Aave | Aave | Aave / Balancer vault |
| Owner | Immutable | Ownable2Step | Ownable2Step |
| Бот | [v2/bot/](v2/bot/) | [v3/bot/](v3/bot/) | [v4/bot/](v4/bot/) |
| Деплой | [v2/DEPLOY.md](v2/DEPLOY.md) | [v3/DEPLOY.md](v3/DEPLOY.md) | [v4/DEPLOY.md](v4/DEPLOY.md) |

## Быстрый старт

```bash
npm install

cd v4 && copy .env.example .env && npm run compile && npm test
```

Или из корня:

```bash
npm run v4:test
npm run test:all
```

## Production bots

Shared runtime: [`packages/bot-core/`](packages/bot-core/)

| | V2 | V3 | V4 |
|---|----|----|-----|
| Runbook | [v2/bot/OPERATIONS.md](v2/bot/OPERATIONS.md) | [v3/bot/OPERATIONS.md](v3/bot/OPERATIONS.md) | [v4/bot/OPERATIONS.md](v4/bot/OPERATIONS.md) |
| Health | `:8787` | `:8788` | `:8789` |
| Scan | 2-hop pairs | 2-hop + V3 legs | tri-hop stable |
| Docker | `v2-bot` | `v3-bot` | `v4-bot` |

Code review (**95/100**): [docs/CODE_REVIEW.md](docs/CODE_REVIEW.md)
