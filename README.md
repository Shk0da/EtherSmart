# EtherSmart

Flash-loan арбитраж на Ethereum mainnet: Aave V3 / Balancer Vault / Uni V3 pool flash + DEX-свопы. Off-chain бот через Flashbots.

**Оценка качества:** [99/100](docs/CODE_REVIEW.md)

## Стеки V2–V5

| | V2 | V3 | V4 | **V5** |
|---|----|----|-----|--------|
| Контракт | `HonestFlashArbV2` | `HonestFlashArbV3` | `HonestFlashArbV4` | `HonestFlashArbV5` |
| DEX | Uni V2 ↔ Sushi | V2 + Uni V3 mixed | V2/V3 + Curve + Balancer | Graph cycles 3–4 hop |
| Legs | 2 | 2 | 3–6 tri-hop | до 8 steps |
| Flash | Aave | Aave | Aave / Balancer | + **Uni V3 pool** |
| Scan | 2-hop pairs | 2-hop + V3 quoter | Fixed triangles | **graphEdges** |
| Mempool | — | — | skeleton | decode + re-scan |
| Owner | Immutable | Ownable2Step | Ownable2Step | Ownable2Step |
| Health | `:8787` | `:8788` | `:8789` | `:8790` |
| Bot | `v2/bot/` | `v3/bot/` | `v4/bot/` | `v5/bot/` |

## Quick start

```bash
npm install
npm run test:all          # полный прогон
npm run v5:test           # только V5 контракт
cd v5/bot && npm start    # dry-run бот (DRY_RUN=true)
```

## Документация

| Файл | Назначение |
|------|------------|
| **[docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)** | **Полный гайд: деплой V2–V5, пополнение, алгоритм** |
| **[docs/DASHBOARD.md](docs/DASHBOARD.md)** | **Панель управления и мониторинга** |
| [AGENTS.md](AGENTS.md) | Инструкция для AI-агентов |
| [docs/CODE_REVIEW.md](docs/CODE_REVIEW.md) | Оценка 97/100, checklist |
| [v5/DEPLOY.md](v5/DEPLOY.md) | Краткий деплой V5 |
| [v5/bot/OPERATIONS.md](v5/bot/OPERATIONS.md) | Production runbook V5 |

Контракт **не** зарабатывает сам — нужен реальный спред и работающий бот.
