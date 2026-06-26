# Деплой HonestFlashArbV3

Инструкция для каталога **`v3/`**. V2: [../v2/DEPLOY.md](../v2/DEPLOY.md).

> Контракт не приносит прибыль сам — нужен бот из `v3/bot/`.

---

## 1. Подготовка

```bash
cd v3
copy .env.example .env
npm install
npx hardhat compile
npx hardhat test
```

Заполни `v3/.env`: `DEPLOYER_PK`, RPC, `ETHERSCAN_API_KEY`.

---

## 2. Адреса (`scripts/deploy.js`)

Конструктор: `(pool, routersV2[], routersV3[], tokens[])`.

| Mainnet | Адрес |
|---------|--------|
| Aave V3 Pool | `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` |
| WETH (token whitelist) | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` |
| Uni V2 Router | `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D` |
| Sushi Router | `0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F` |
| Uni V3 SwapRouter02 | `0x68b3465833fb72A70eDF967F1a4677710b7893f0` |

**Sepolia**: `routersV2/V3` и `tokens` пустые — заполни перед деплоем.

---

## 3. Деплой

```bash
npm run deploy:sepolia
npm run deploy
```

Верификация:

```bash
npx hardhat verify --network mainnet <ADDR> \
  "<pool>" "[r2...]" "[r3...]" "[tokens...]"
```

---

## 4. После деплоя

```bash
npx hardhat console --network mainnet
```

```js
const arb = await ethers.getContractAt("HonestFlashArbV3", "<ADDR>");
await arb.setProfitReceiver("0x...");
await arb.setAutoWithdrawThreshold("0xA0b8...", 100_000000n);
// await arb.addRouterV3("0x...");
// await arb.transferOwnership("0x...");
```

---

## 5. Бот

```bash
# v3/.env
ARB_CONTRACT=0x...
WS_URL=wss://...
DRY_RUN=true

cd bot
npm install
npm start
```

Builder tip — **off-chain** (Flashbots bundle), не on-chain. См. [bot/README.md](bot/README.md).

---

## Шпаргалка

| Команда | Действие |
|---------|----------|
| `npm run compile` | Сборка |
| `npm test` | Mock-тесты V3 |
| `npm run deploy` | Mainnet |
