# @ethersmart/bot-core

Shared production runtime for V2/V3 flash arb bots.

## Features

- Two-round multicall opportunity scan
- Multi loan sizes (`LOAN_SIZES_USDC`)
- Gas-adjusted net profit ranking
- Flashbots simulate/send with dynamic EIP-1559 fees
- SQLite metrics (`/metrics/recent`)
- Health server with optional Bearer token
- Contract `paused()` refresh every 5 blocks

## Usage

```javascript
const { createBotRunner } = require("@ethersmart/bot-core");
const config = require("./config");
const { buildPlanForOpportunity } = require("./txBuilder");

createBotRunner({ config, buildPlanForOpportunity });
```

## Tests

```bash
npm run test -w @ethersmart/bot-core
```
