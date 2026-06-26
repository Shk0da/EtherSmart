# HonestFlashArbV3 — Off-chain Bot

Production-ready Flashbots bot for **HonestFlashArbV3** (V2 + optional V3 legs).

## Docs

- [OPERATIONS.md](OPERATIONS.md) — runbook, `USE_V3_LEGS`, health
- [../DEPLOY.md](../DEPLOY.md) — contract deploy

## Quick start

```bash
cd v3
copy .env.example .env
npm install && npx hardhat compile

cd bot
npm install
npm test
npm start
```

## V3 legs

```env
USE_V3_LEGS=true
```

Builds V2→V3 mixed `ArbPlan` (leg1 Uniswap V2, leg2 Uniswap V3 SwapRouter02).

## Endpoints

| URL | Port |
|-----|------|
| `/health` | 8788 |
| `/stats` | 8788 |

## Code review

[../../docs/CODE_REVIEW.md](../../docs/CODE_REVIEW.md)
