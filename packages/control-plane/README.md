# EtherSmart Control Plane — production-ready

REST API + optional static UI for bot orchestration, metrics, deploy.

## Quick start

```bash
cd packages/control-plane
copy .env.example .env
# Set DASHBOARD_PASSWORD (min 8 chars recommended; default dev password is 12345)
npm install
npm start
```

UI dev (separate terminal):

```bash
npm run dashboard:dev   # from repo root
```

## Production

```env
NODE_ENV=production
DASHBOARD_PASSWORD=<long-random>
DASHBOARD_BIND=127.0.0.1
CONTROL_MODE=docker
MAINNET_RPC_URL=https://...
CORS_ORIGIN=https://your-dashboard.example
```

```bash
# Build UI into control-plane
cd packages/dashboard-ui && npm run build
SERVE_UI=true npm start -w @ethersmart/control-plane
```

Or Docker:

```bash
docker compose up control-plane dashboard
```

## Security

- Timing-safe password check
- Session TTL (default 24h)
- Login rate limit (10/min per IP)
- Secrets never returned in GET `/config`
- Audit log for mutating actions
- Public endpoints: `/api/health`, `/api/auth/login` only

## WebSocket + indexer

```env
INDEXER_ENABLED=true
INDEXER_FROM_BLOCK=19000000
MAINNET_RPC_URL=https://...
LIVE_FEED_METRICS_MS=5000
```

- WS: `ws://host:3001/api/ws?token=...`
- Indexer DB: `data/trades.db`

See [docs/DASHBOARD.md](../../docs/DASHBOARD.md).
