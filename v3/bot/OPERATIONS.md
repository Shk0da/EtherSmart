# Production Runbook — V3 Bot

Операционное руководство для `v3/bot/` (HonestFlashArbV3).

## Перед запуском

1. Задеплой контракт — [DEPLOY.md](../DEPLOY.md)
2. Скомпилируй:
   ```bash
   cd v3 && npm install && npx hardhat compile
   ```
3. Настрой `v3/.env` (см. `.env.example`)

## Запуск

```bash
cd v3/bot
npm install
npm test
npm start
```

### V3 legs

По умолчанию бот строит **V2+V2** планы (совместимо с любым деплоем).

Для mixed **V2 leg1 + V3 leg2**:

```env
USE_V3_LEGS=true
```

Требует whitelisted `uniV3Router` в контракте. MinOut для V3 ног — через **QuoterV2** (`0x61fFE...`).

## Health check

```bash
curl http://127.0.0.1:8788/health
curl -H "Authorization: Bearer $HEALTH_TOKEN" http://127.0.0.1:8788/metrics/recent
```

## Loan sizing & metrics

См. [v2/bot/OPERATIONS.md](../../v2/bot/OPERATIONS.md) — `LOAN_SIZES_USDC`, SQLite, `HEALTH_TOKEN`.

## Production checklist

- [ ] `DRY_RUN=false` только после успешных симуляций
- [ ] `BOT_PK` = contract owner
- [ ] `ARB_CONTRACT` = verified V3 address
- [ ] `npx hardhat compile` выполнен
- [ ] `/health` → `ok: true`
- [ ] ETH balance ≥ 0.05 (настраивается `MIN_ETH_BALANCE`)
- [ ] Flashbots auth key (опционально `FLASHBOTS_AUTH_PK`)

## Multi-block bundles

```env
MULTI_BLOCK_TARGETS=3
```

Один signed tx отправляется на block+1, block+2, block+3 параллельно.

## Builder tip (off-chain)

```env
BUILDER_TIP_WEI=1000000000000000
```

Увеличивает `maxPriorityFeePerGas` (tip / estimated gas). Не on-chain tip в контракте.

## Логи и метрики

| Endpoint | Данные |
|----------|--------|
| `/health` | ws, paused, ok |
| `/stats` | blocks, opportunities, bundles, profit |

## PM2

```bash
pm2 start src/index.js --name ethersmart-v3 --cwd ..
```

## Troubleshooting

| Симптом | Решение |
|---------|---------|
| `GainTooSmall` в simulation | Нет реального арбитража — ожидаемо |
| `RouterNotAllowed` | Добавь router через `addRouterV3` |
| `USE_V3_LEGS` revert | Проверь V3 path fee tier (500/3000/10000) |

## V2

Простой V2-only стек: [v2/bot/OPERATIONS.md](../../v2/bot/OPERATIONS.md).
