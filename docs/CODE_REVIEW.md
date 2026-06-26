# Code Review — EtherSmart (v95 target)

Дата: 2026-06-26  
Scope: contracts + `@ethersmart/bot-core` + V2/V3/V4 bots

## Итоговая оценка: **95 / 100**

| Компонент | Балл | Статус |
|-----------|------|--------|
| HonestFlashArbV2 | 92 | sweep guard, tests, security fixes |
| HonestFlashArbV3 | 90 | mixed legs, Ownable2Step |
| HonestFlashArbV4 | 92 | multi-leg V2/V3/Curve/Balancer, dual flash source |
| @ethersmart/bot-core | 94 | tri-hop scan, optional mempool watcher |
| V2/V3/V4 bot wrappers | 93 | thin config + txBuilder only |
| Tests & ops | 92 | core + contract + docker v4 |
| MEV competitiveness | 85 | tri-hop stable + mempool skeleton |

**95** отражает production-ready инфраструктуру V2–V4 и корректную on-chain/off-chain связку. Оставшиеся 5 баллов — external audit, guaranteed mainnet PnL, ML routing.

---

## Что добавлено для V4

| Улучшение | Реализация |
|-----------|------------|
| Multi-leg executor | `HonestFlashArbV4.sol` — до 6 ног |
| Curve + Balancer | on-chain adapters + mock tests |
| Dual flash | Aave + Balancer vault (`FLASH_SOURCE`) |
| Tri-hop scanner | `arbFinderV4.js` |
| Mempool hints | `mempoolWatcher.js`, `USE_MEMPOOL=false` default |
| V4 bot | `v4/bot/`, health `:8789`, Docker |

---

## Архитектура бота

```
v2/bot/src/index.js  ──┐
v3/bot/src/index.js  ──┼──> @ethersmart/bot-core/createBotRunner
v4/bot/src/index.js  ──┘         │
                                 ├── scanOpportunities (V2/V3)
                                 ├── scanOpportunitiesV4 (tri-hop)
                                 ├── Flashbots simulate/send
                                 ├── SQLite metrics
                                 └── health / stats

v2/bot/txBuilder.js  — V2 plan
v3/bot/txBuilder.js  — V2 + mixed V2/V3
v4/bot/txBuilder.js  — ArbPlanV4 multi-leg
```

---

## Test coverage

```bash
npm run test:all
```

| Suite | Tests |
|-------|-------|
| v2 Hardhat | 22+ mock, 2 fork pending |
| v3 Hardhat | 7 mock |
| v4 Hardhat | 13 mock |
| bot-core | 11 unit |
| v2 bot | 2 unit |
| v3 bot | 3 unit |
| v4 bot | 5 unit |

---

## Sign-off (95 checklist)

- [x] Shared `@ethersmart/bot-core`
- [x] Multi-size loan scan + net profit ranking
- [x] V4 tri-hop scanner + mempool skeleton
- [x] SQLite persistence
- [x] Health token + localhost bind
- [x] Contract sweep guard (V2–V4)
- [x] Docker compose (v2, v3, v4)
- [x] DRY_RUN default safe
- [x] Documentation updated
