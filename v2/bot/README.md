# HonestFlashArbV2 — Off-chain Bot

Production-ready Flashbots bot for **HonestFlashArbV2**.

## Docs

- [OPERATIONS.md](OPERATIONS.md) — runbook, health, PM2, troubleshooting
- [../DEPLOY.md](../DEPLOY.md) — contract deploy

## Quick start

```bash
cd v2
copy .env.example .env
npm install && npx hardhat compile

cd bot
npm install
npm test
npm start
```

## Architecture

```
WebSocket (blocks) → Multicall3 quotes → Arb finder → Tx builder (V2 plan)
    → Flashbots simulate → send bundle (multi-block optional)
```

## Endpoints

| URL | Port |
|-----|------|
| `/health` | 8787 |
| `/stats` | 8787 |

## Key env vars

See [../.env.example](../.env.example). **Default: `DRY_RUN=true`**.
