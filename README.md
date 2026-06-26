# EtherSmart

Flash-loan арбитраж на Ethereum. Два **независимых** стека:

| | [v2/](v2/) | [v3/](v3/) |
|---|------------|------------|
| Контракт | `HonestFlashArbV2` | `HonestFlashArbV3` |
| DEX | Uniswap V2 / Sushi | V2 + Uniswap V3 |
| Owner | Immutable | Ownable2Step |
| Whitelist | Конструктор only | Dynamic |
| Бот | [v2/bot/](v2/bot/) | [v3/bot/](v3/bot/) |
| Деплой | [v2/DEPLOY.md](v2/DEPLOY.md) | [v3/DEPLOY.md](v3/DEPLOY.md) |


## Быстрый старт

```bash
# из корня — установит зависимости всех workspaces
npm install

# V2
cd v2 && copy .env.example .env && npm run compile && npm test

# V3
cd v3 && copy .env.example .env && npm run compile && npm test
```

Или из корня:

```bash
npm run v2:test
npm run v3:test
```

## Структура репозитория

```
EtherSmart/
  v2/          # контракт V2, тесты, деплой, бот, DEPLOY.md
  v3/          # контракт V3, тесты, деплой, бот, DEPLOY.md
  0. TODO.md   # общий roadmap
  README.md    # этот файл
```

Каждая версия — **самодостаточный каталог**: свой `hardhat.config.js`, `.env`, `package.json`, документация и бот.

## Production bots

Shared runtime: [`packages/bot-core/`](packages/bot-core/)

| | V2 | V3 |
|---|----|----|
| Runbook | [v2/bot/OPERATIONS.md](v2/bot/OPERATIONS.md) | [v3/bot/OPERATIONS.md](v3/bot/OPERATIONS.md) |
| Health | `:8787/health` | `:8788/health` |
| Metrics | SQLite + `/metrics/recent` | same |
| Docker | `docker compose up v2-bot` | `docker compose up v3-bot` |

Code review (**95/100**): [docs/CODE_REVIEW.md](docs/CODE_REVIEW.md)

```bash
npm run test:all
```
