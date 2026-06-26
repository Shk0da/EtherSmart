# V5 Bot Operations

## Start (dry-run)

```bash
cd v5/bot
npm start
```

Defaults: `DRY_RUN=true`, `USE_MEMPOOL=false`, health on `127.0.0.1:8790`.

## Preflight

- `BOT_PK` address == contract `owner()`
- `artifactPath` → `v5/artifacts/.../HonestFlashArbV5.json` (run `npm run compile` in `v5/`)
- `graphEdges` non-empty in `config.js` (or override via env)
- WS + HTTP RPC reachable
- `validateV5Config` passes at startup (wired via `extraValidateChecks`)

## Graph scan

Bot uses `scanOpportunitiesV5` over `graphEdges` in `config.js`:

- DFS cycles 3–4 hops back to `graphLoanToken`
- Multicall quotes per leg; rank by **netProfit** after gas (`ESTIMATED_ARB_GAS=1200000`)
- Flash premium synced via `pickFlashSource` (Aave 5 bps, Balancer/Uni pool 0)

## Flash sources (`FLASH_SOURCE`)

| Value | Source | Premium (bot) |
|-------|--------|---------------|
| `0` | Aave V3 `flashLoanSimple` | 5 bps |
| `1` | Balancer Vault | 0 |
| `2` | Uni V3 pool flash | 0 |

For `FLASH_SOURCE=2` set `UNI_V3_FLASH_POOL` and `uniV3FlashMeta.token0/token1` in config; on-chain `addUniV3Pool(pool)` required.

## Mempool watcher

`USE_MEMPOOL=true` decodes pending V2 `swapExact*` touching graph tokens and triggers an **opportunistic re-scan** on the next block loop.

**Not included:** automatic 2-tx backrun bundles (`bundleBuilder.js` is exported but not wired). Treat mempool as latency hint + metrics (`mempool_trigger`), not guaranteed inclusion.

Filter: `MEMPOOL_MIN_ETH` (default 1 ETH notional on WETH legs).

## Production checklist

1. Deploy V5 → set `ARB_CONTRACT` in `v5/.env`
2. Whitelist routers/tokens/pools on-chain (`addUniV3Pool` if using pool flash)
3. Dry-run 24h+, check `/metrics/recent` for `simulation_ok`
4. Set `HEALTH_TOKEN`, `HEALTH_BIND=127.0.0.1`
5. `MIN_ETH_BALANCE` — bot warns if signer ETH low
6. `DRY_RUN=false` only when simulations consistently pass
7. Monitor SQLite `metrics-v5.db`

## Health endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /health` | Bearer if `HEALTH_TOKEN` | ws + paused + ok |
| `GET /stats` | Bearer if set | in-memory stats |
| `GET /metrics/recent` | Bearer if set | last 100 SQLite events |

## Docker

```bash
docker compose up v5-bot
```

Port **8790**.
