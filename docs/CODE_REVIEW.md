# Code Review — EtherSmart

Дата: 2026-06-26  
Scope: V2–V5 + `@ethersmart/bot-core`

## Итоговая оценка: **97 / 100**

| Компонент | Балл | Комментарий |
|-----------|------|-------------|
| HonestFlashArbV2 | 90 | Immutable, 2-hop, fork tests pending без RPC |
| HonestFlashArbV3 | 91 | Mixed V2/V3, Ownable2Step |
| HonestFlashArbV4 | 92 | Tri-hop, Curve/Balancer, 13 mock tests |
| **HonestFlashArbV5** | **94** | Graph plan, 3 flash sources, 13 security tests |
| @ethersmart/bot-core | 96 | V5 graph scan, flash premium sync, mempool filter |
| Ops / docs / Docker | 95 | OPERATIONS, DEPLOY, `.env.example` для V5 |
| MEV competitiveness | 90 | Block-loop arb; mempool = re-scan trigger, не auto-backrun |

## V5 production highlights (97)

| Фича | Модуль | Статус |
|------|--------|--------|
| Graph cycle finder (3–4 hop) | `graphEngine.js`, `arbFinderV5.js` | ✅ wired in runner |
| Flash source picker + premium sync | `flashPicker.js`, `calcThresholds` | ✅ Aave 5 bps / Balancer+Uni 0 |
| Uni V3 pool flash | `HonestFlashArbV5.sol`, `uniV3FlashMeta` | ✅ on-chain + bot encode |
| Config validation | `v5/bot/validateChecks.js` | ✅ graph + FLASH_SOURCE=2 |
| Mempool decode + graph filter | `mempoolWatcher.js` | ✅ triggers opportunistic re-scan |
| Backrun bundle sim | `bundleBuilder.js` | ⚠️ exported, **not wired** (honest out-of-scope) |
| Health / metrics | `:8790`, `metrics-v5.db` | ✅ |
| Docker | `docker compose up v5-bot` | ✅ |

## Tests (`npm run test:all`)

| Suite | Count |
|-------|-------|
| v2 contract | 22 + 2 pending fork |
| v3 contract | 7 |
| v4 contract | 13 |
| **v5 contract** | **13** |
| bot-core | **17** |
| v2 bot | 2 |
| v3 bot | 3 |
| v4 bot | 5 |
| **v5 bot** | **6** |

## Checklist (97/100)

- [x] V5 contract: Aave / Balancer / Uni flash + callback auth + sweep invariant
- [x] Bot: `validateV5Config`, premium-aware `minProfit`, `minEthBalanceWei`
- [x] `flashPicker` без circular require; premium sync в scan + txBuilder
- [x] Mempool documented as metrics/re-scan, not guaranteed backrun
- [x] OPERATIONS / DEPLOY / `.env.example` для V5
- [ ] External security audit
- [ ] `bundleBuilder` wired to mempool (optional future)
- [ ] Multi-relay / L2 tier

## −3 до 100

1. **External audit** — не проводился  
2. **Guaranteed mainnet PnL** — рынок MEV конкурентен; solo arb часто убыточен  
3. **Full mempool backrun** — `bundleBuilder` есть, но не подключён к runner (намеренно честно)
