const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert");
const { login, clearSessions, validateSession } = require("../src/auth");
const { getConfig } = require("../src/configService");
const { BOTS } = require("../src/config");
const { clampInt } = require("../src/validate");

describe("auth", () => {
  beforeEach(() => clearSessions());

  it("rejects wrong password", () => {
    assert.equal(login("bad", "good", "1.2.3.4"), null);
  });

  it("returns token on success", () => {
    const r = login("secret", "secret", "1.2.3.4");
    assert.ok(r.token);
    assert.ok(validateSession(r.token));
  });

  it("rate limits login", () => {
    for (let i = 0; i < 10; i++) login("x", "y", "9.9.9.9");
    const r = login("y", "y", "9.9.9.9");
    assert.equal(r.error, "too_many_attempts");
  });
});

describe("getConfig", () => {
  it("does not expose raw secrets field", () => {
    const cfg = getConfig(BOTS[0]);
    assert.ok("values" in cfg);
    assert.equal(cfg.raw, undefined);
  });
});

describe("clampInt", () => {
  it("clamps values", () => {
    assert.equal(clampInt("9999", 10, 1, 500), 500);
    assert.equal(clampInt("abc", 10, 1, 500), 10);
  });
});
