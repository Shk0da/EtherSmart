import { describe, it } from "node:test";
import assert from "node:assert/strict";
import viteConfig from "../vite.config.js";

describe("dashboard-ui vite config", () => {
  it("binds dev server to 127.0.0.1:3000 with strictPort", () => {
    assert.equal(viteConfig.server.host, "127.0.0.1");
    assert.equal(viteConfig.server.port, 3000);
    assert.equal(viteConfig.server.strictPort, true);
  });

  it("proxies /api and websocket to control-plane", () => {
    const proxy = viteConfig.server.proxy["/api"];
    assert.equal(proxy.target, "http://127.0.0.1:3001");
    assert.equal(proxy.changeOrigin, true);
    assert.equal(proxy.ws, true);
  });

  it("uses React plugin", () => {
    assert.ok(Array.isArray(viteConfig.plugins));
    assert.ok(viteConfig.plugins.length >= 1);
  });
});
