# Production Runbook — V2 Bot

Операционное руководство для `v2/bot/` (HonestFlashArbV2).

## Перед запуском

1. Задеплой контракт — [DEPLOY.md](../DEPLOY.md)
2. Скомпилируй артефакт:
   ```bash
   cd v2 && npm install && npx hardhat compile
   ```
3. Скопируй `.env`:
   ```bash
   copy .env.example .env
   ```
4. Заполни обязательные переменные:

| Переменная | Описание |
|------------|----------|
| `ARB_CONTRACT` | Адрес HonestFlashArbV2 |
| `WS_URL` | WebSocket RPC (Alchemy/Infura) |
| `MAINNET_RPC_URL` | HTTP RPC для симуляции/Flashbots |
| `BOT_PK` | Приватный ключ **owner** контракта |
| `DRY_RUN` | `true` до проверки на mainnet |

## Запуск

```bash
cd v2/bot
npm install
npm test          # unit-тесты конфигурации
npm start         # DRY_RUN по умолчанию true
```

Production (реальные bundle):

```bash
# v2/.env
DRY_RUN=false
```

## Health check

```bash
curl http://127.0.0.1:8787/health
curl -H "Authorization: Bearer $HEALTH_TOKEN" http://127.0.0.1:8787/stats
curl -H "Authorization: Bearer $HEALTH_TOKEN" http://127.0.0.1:8787/metrics/recent
```

`HEALTH_BIND=127.0.0.1` по умолчанию. Задайте `HEALTH_TOKEN` на VPS.

## Loan sizing

```env
LOAN_SIZES_USDC=5000,10000,25000
```

Бот сканирует все размеры и выбирает лучший **net profit** (после gas).

## Metrics

SQLite: `v2/logs/metrics-v2.db` — события `opportunity`, `simulation_ok`, `bundle_included`.

Ответ `/health`:
- `ok: true` — WS подключён и контракт не на паузе
- `ok: false` — проверь WS или `unpause()` контракта

## Graceful shutdown

`Ctrl+C` / `SIGTERM` → закрытие health-сервера и WebSocket.

## Безопасность

- `BOT_PK` = owner контракта (проверяется в preflight)
- `FLASHBOTS_AUTH_PK` — опционально отдельный ключ для Flashbots reputation
- Никогда не коммить `.env`
- По умолчанию `DRY_RUN=true` (отключить явно: `DRY_RUN=false`)

## Лимиты

| Параметр | Default | Назначение |
|----------|---------|------------|
| `MAX_GAS_PRICE_GWEI` | 120 | Потолок maxFeePerGas |
| `SLIPPAGE_BPS` | 50 | 0.5% slippage на каждую ногу |
| `MIN_PROFIT_BPS` | 10 | Мин. прибыль + Aave premium |
| `MULTI_BLOCK_TARGETS` | 1 | Bundle на N будущих блоков |
| `BUILDER_TIP_WEI` | 0 | Bump priority fee (off-chain tip) |

## Логи

- JSON в stdout (pino)
- Ротация в `v2/logs/` (pino-roll)

## Мониторинг

Следи за:
- `simulationFailures` — частые revert плана
- `blockErrors` — RPC/логические ошибки
- `ws.connected` в `/health`
- Баланс ETH owner ≥ `MIN_ETH_BALANCE`

## PM2 (24/7)

```bash
cd v2/bot
pm2 start src/index.js --name ethersmart-v2 --cwd ..
pm2 save
```

## Troubleshooting

| Симптом | Решение |
|---------|---------|
| `artifact not found` | `cd v2 && npx hardhat compile` |
| `Signer is not contract owner` | `BOT_PK` = deployer/owner |
| `bundle simulation failed` | Убыточный round-trip — норма на mainnet |
| `ws closed` | Auto-reconnect через 3s |

## V3

Для mixed V2+V3 — используй [v3/bot/OPERATIONS.md](../../v3/bot/OPERATIONS.md).
