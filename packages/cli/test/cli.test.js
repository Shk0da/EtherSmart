const { describe, it } = require("node:test");
const assert = require("node:assert");
const { parseArgs } = require("../src/commands");
const { normalizeTarget, expandTarget } = require("../src/targets");

describe("normalizeTarget", () => {
  it("resolves aliases", () => {
    assert.equal(normalizeTarget("dashboard"), "ui");
    assert.equal(normalizeTarget("control-plane"), "api");
  });

  it("accepts groups", () => {
    assert.equal(normalizeTarget("stack"), "stack");
    assert.equal(normalizeTarget("bots"), "bots");
  });
});

describe("expandTarget", () => {
  it("expands stack", () => {
    assert.deepEqual(expandTarget("stack"), ["api", "ui"]);
  });

  it("expands single bot", () => {
    assert.deepEqual(expandTarget("v5"), ["v5"]);
  });
});

describe("parseArgs", () => {
  it("parses start stack --docker", () => {
    const p = parseArgs(["start", "stack", "--docker"]);
    assert.equal(p.command, "start");
    assert.deepEqual(p.targets, ["stack"]);
    assert.equal(p.opts.docker, true);
  });
});
