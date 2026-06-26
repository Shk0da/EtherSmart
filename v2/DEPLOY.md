# Деплой HonestFlashArbV2

> **Полное руководство (все версии, пополнение, алгоритм):** [docs/DEPLOYMENT_GUIDE.md](../docs/DEPLOYMENT_GUIDE.md)

Инструкция для каталога **`v2/`**. V3: [../v3/DEPLOY.md](../v3/DEPLOY.md).

> Контракт не приносит прибыль сам — нужен бот из `v2/bot/`.

---

## 1. Подготовка

```bash
cd v2
copy .env.example .env
npm install
npx hardhat compile
npx hardhat test
```

Заполни `v2/.env`: `DEPLOYER_PK`, `MAINNET_RPC_URL`, `SEPOLIA_RPC_URL`, `ETHERSCAN_API_KEY`.

---

## 2. Адреса (`scripts/deploy.js`)

Конструктор: `(pool, routers[], tokens[])`.

Mainnet заполнен. **Sepolia**: добавь `routers` и `tokens` перед деплоем.

---

## 3. Деплой

```bash
npm run deploy:sepolia
npm run deploy          # mainnet
```

Верификация вручную:

```bash
npx hardhat verify --network mainnet <ADDR> "<pool>" "[r1,r2]" "[t1,t2,t3]"
```

---

## 4. После деплоя

```bash
npx hardhat console --network mainnet
```

```js
const arb = await ethers.getContractAt("HonestFlashArbV2", "<ADDR>");
await arb.setProfitReceiver("0x...");
await arb.setAutoWithdrawThreshold("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 100_000000n);
```

---

## 5. Бот

```bash
# v2/.env
ARB_CONTRACT=0x...
WS_URL=wss://...
DRY_RUN=true

cd bot
npm install
npm start
```

---

## Ограничения V2

- `owner` **immutable**
- Whitelist **только в конструкторе**
- `receive()` ревертит ETH — tip только off-chain (Flashbots)
- Fee-on-transfer токены не поддерживаются

---

## Шпаргалка

| Команда | Действие |
|---------|----------|
| `npm run compile` | Сборка |
| `npm test` | Все тесты |
| `npm run test:fork` | Fork (нужен `MAINNET_RPC_URL`) |
| `npm run deploy` | Mainnet |
