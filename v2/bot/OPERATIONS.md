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

## Auto-restart и события жизненного цикла

При запуске через CLI (`npm run es -- start v2`) или дашборд бот стартует под
**супервизором** (`packages/bot-core/src/supervisor.js`). Он автоматически
перезапускает процесс при **падении** (uncaughtException, OOM, краш RPC) и
**не** перезапускает, если бот остановил пользователь (`stop` убивает всё дерево
процессов).

Чтобы понять, **почему бот остановился**, смотри события в
`/metrics/recent` и в Live feed дашборда:

| Событие | Значение |
|---------|----------|
| `bot_started` | старт; `restartCount > 0` = это авто-рестарт после падения |
| `bot_shutdown` | штатная остановка пользователем (`signal: SIGINT/SIGTERM`) |
| `bot_crashed` | падение (`scope`, `error`, `stack`) перед exit(1) |
| `ws_disconnected` / `ws_reconnected` / `ws_reconnect_failed` | состояние WebSocket |

Настройки супервизора (env процесса, запускающего бота):

| Переменная | Default | Описание |
|------------|---------|----------|
| `BOT_AUTORESTART` | `true` | `false` → запуск напрямую без перезапуска |
| `BOT_MAX_RESTARTS` | 10 | предел рестартов до отказа |
| `BOT_RESTART_BACKOFF_MS` | 2000 | базовая задержка (экспоненциальная) |
| `BOT_RESTART_MAX_BACKOFF_MS` | 30000 | потолок задержки |
| `BOT_RESTART_RESET_MS` | 60000 | после стольких ms аптайма счётчик сбрасывается |

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

### Диагностика сканера (почему нет сделок)

Каждые `SCAN_LOG_EVERY` блоков (по умолчанию **10**, ~2 мин; плюс сразу на 1-м
блоке после старта) бот пишет события в `/metrics/recent` и Live feed дашборда.
`stats_snapshot` остаётся на каждые 50 блоков.

`scan_spread` — **что сейчас сравнивается и какой спред** (пишется всегда):

| Поле | Значение |
|------|----------|
| `comparisons[]` | по каждой паре лучший `direction` (напр. `uni->sushi`) и `spreadBps` |
| `spreadBps` | round-trip результат vs заём после DEX-комиссий; отрицательное = круг в минусе |
| `quotesSeen` | сколько живых котировок получено |

`scan_diag` — ближайший к прибыли кандидат (только когда сделок нет):

| Поле | Значение |
|------|----------|
| `bestPair` / `bestDirection` | лучший круг блока (напр. `USDC-WETH` `uni->sushi`) |
| `shortfallBps` | на сколько bps круг **не дотянул** до порога; отрицательное = был бы профит |
| `quotesSeen` | сколько живых котировок получено (доказывает, что данные реальны) |
| `evaluated` | сколько кругов оценено |

Если `shortfallBps` стабильно положительный (десятки–сотни bps) — спред реально
мал, прибыльных возможностей нет (норма для solo V2 Uni↔Sushi). Если видишь
событие `scan_no_quotes` (`quotesSeen === 0`) — это **реальная ошибка**: проверь
RPC, адреса роутеров и Multicall3.

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
