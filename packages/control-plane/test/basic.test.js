const { describe, it } = require("node:test");
const assert = require("node:assert");
const { maskSecrets } = require("../src/configService");
const { getPnlSummary } = require("../src/metricsService");
const { BOTS } = require("../src/config");

describe("maskSecrets", () => {
  it("masks BOT_PK", () => {
    const m = maskSecrets({ BOT_PK: "0x1234567890abcdef", DRY_RUN: "true" });
    assert.ok(m.BOT_PK.includes("…"));
    assert.equal(m.DRY_RUN, "true");
  });
});

describe("BOTS registry", () => {
  it("has v2-v5", () => {
    assert.equal(BOTS.length, 4);
  });
});

describe("getPnlSummary", () => {
  it("returns array for missing db", () => {
    const bot = { metricsDb: "nonexistent/metrics.db" };
    assert.deepEqual(getPnlSummary(bot), []);
  });
});
