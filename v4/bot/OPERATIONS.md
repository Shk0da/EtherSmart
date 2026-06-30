# V4 Bot Operations

## Start (dry-run)

```bash
cd v4/bot
npm start
```

Default: `DRY_RUN=true`, `USE_MEMPOOL=false`, health on `127.0.0.1:8789`.

## Preflight

- `BOT_PK` address == contract `owner()`
- `artifactPath` → `v4/artifacts/.../HonestFlashArbV4.json` (run `npm run compile` in `v4/`)
- WS + HTTP RPC reachable

## Tri-hop scan

Bot uses `scanOpportunitiesV4` with triangles from `config.js`:

- `stable-curve-uni-sushi` — USDC → DAI (Curve) → WETH (Uni) → USDC (Sushi)
- `usdc-weth-dai-curve` — USDC → WETH → DAI → USDC

Ranking: **netProfit** after gas (`ESTIMATED_ARB_GAS=1100000`).

## Mempool watcher

Set `USE_MEMPOOL=true` to log pending large swaps (`MEMPOOL_MIN_ETH`). Metrics event `mempool_trigger` only in MVP.

## Production checklist

1. Deploy V4 → set `ARB_CONTRACT`
2. Dry-run 24h+, check `/metrics/recent` for `simulation_ok`
3. Set `HEALTH_TOKEN`, bind `127.0.0.1`
4. `DRY_RUN=false` only when simulations consistently pass
5. Monitor SQLite `metrics-v4.db`

## Docker

```bash
docker compose up v4-bot
```

Port **8789**.

## Auto-restart и события жизненного цикла

При запуске через CLI/дашборд бот стартует под **супервизором**
(`packages/bot-core/src/supervisor.js`): авто-рестарт при **падении** и **никогда**
при остановке пользователем. Причину остановки смотри в `/metrics/recent` и Live feed:
`bot_started` (`restartCount > 0` = авто-рестарт), `bot_shutdown` (`signal`),
`bot_crashed` (`scope`/`error`/`stack`), `ws_disconnected` / `ws_reconnected`.

Env супервизора: `BOT_AUTORESTART` (def. `true`), `BOT_MAX_RESTARTS` (10),
`BOT_RESTART_BACKOFF_MS` (2000), `BOT_RESTART_MAX_BACKOFF_MS` (30000),
`BOT_RESTART_RESET_MS` (60000).
