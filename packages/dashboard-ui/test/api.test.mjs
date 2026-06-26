import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { getToken, setToken, clearToken, api } from "../src/api.js";

function mockStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

function mockLocation(pathname = "/") {
  return { pathname, href: "" };
}

describe("dashboard-ui api client", () => {
  beforeEach(() => {
    globalThis.localStorage = mockStorage();
    globalThis.window = { location: mockLocation("/pnl") };
    globalThis.fetch = mock.fn();
  });

  it("getToken / setToken / clearToken round-trip", () => {
    assert.equal(getToken(), null);
    setToken("abc");
    assert.equal(getToken(), "abc");
    clearToken();
    assert.equal(getToken(), null);
  });

  it("api() attaches Bearer token and returns JSON body", async () => {
    setToken("secret");
    fetch.mock.mockImplementation(async (url, options) => ({
      ok: true,
      status: 200,
      json: async () => ({ bots: [] }),
      statusText: "OK",
    }));

    const data = await api("/bots");
    assert.deepEqual(data, { bots: [] });
    assert.equal(fetch.mock.calls.length, 1);
    assert.equal(fetch.mock.calls[0].arguments[0], "/api/bots");
    assert.equal(
      fetch.mock.calls[0].arguments[1].headers.Authorization,
      "Bearer secret"
    );
  });

  it("api() sends JSON content-type by default", async () => {
    fetch.mock.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      statusText: "OK",
    }));

    await api("/auth/login", { method: "POST", body: "{}" });
    assert.equal(
      fetch.mock.calls[0].arguments[1].headers["Content-Type"],
      "application/json"
    );
  });

  it("api() clears token and redirects on 401 outside login", async () => {
    setToken("stale");
    fetch.mock.mockImplementation(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: "unauthorized" }),
      statusText: "Unauthorized",
    }));

    await assert.rejects(() => api("/bots"), /unauthorized/);
    assert.equal(getToken(), null);
    assert.equal(window.location.href, "/login");
  });

  it("api() does not redirect on 401 when already on /login", async () => {
    window.location = mockLocation("/login");
    setToken("stale");
    fetch.mock.mockImplementation(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
      statusText: "Unauthorized",
    }));

    await assert.rejects(() => api("/auth/login"), /unauthorized/);
    assert.equal(window.location.href, "");
  });

  it("api() surfaces 429 rate limit message", async () => {
    fetch.mock.mockImplementation(async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: "slow down" }),
      statusText: "Too Many Requests",
    }));

    await assert.rejects(() => api("/bots"), /slow down/);
  });

  it("api() throws API error text on non-OK responses", async () => {
    fetch.mock.mockImplementation(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "server blew up" }),
      statusText: "Internal Server Error",
    }));

    await assert.rejects(() => api("/stats"), /server blew up/);
  });
});
