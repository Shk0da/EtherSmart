import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { UI_ROOT, walkSourceFiles, readText } from "./helpers.mjs";

describe("dashboard-ui module inventory", () => {
  it("includes all expected source modules", () => {
    const required = [
      "src/api.js",
      "src/App.jsx",
      "src/Layout.jsx",
      "src/main.jsx",
      "src/styles.css",
      "src/hooks/useLiveFeed.js",
      "src/components/LiveFeedPanel.jsx",
      "src/pages/LoginPage.jsx",
      "src/pages/OverviewPage.jsx",
      "src/pages/BotPage.jsx",
      "src/pages/DeployPage.jsx",
      "src/pages/PnlPage.jsx",
      "src/pages/TradesPage.jsx",
      "src/pages/BalancesPage.jsx",
      "src/pages/AuditPage.jsx",
    ];

    for (const rel of required) {
      assert.ok(fs.existsSync(path.join(UI_ROOT, rel)), `missing ${rel}`);
    }
  });

  it("pages use default export", () => {
    const pages = walkSourceFiles(path.join(UI_ROOT, "src", "pages"));
    const missing = pages.filter((file) => {
      const text = fs.readFileSync(file, "utf8");
      return !/export default function/.test(text);
    });

    assert.deepEqual(
      missing.map((f) => path.basename(f)),
      [],
      "every page should default-export a component"
    );
  });

  it("OverviewPage integrates live feed stack", () => {
    const src = readText("src/pages/OverviewPage.jsx");
    assert.match(src, /useLiveFeed/);
    assert.match(src, /LiveFeedPanel/);
    assert.match(src, /api\("\/bots"\)/);
  });

  it("LoginPage posts to /auth/login", () => {
    const src = readText("src/pages/LoginPage.jsx");
    assert.match(src, /api\("\/auth\/login"/);
    assert.match(src, /setToken\(token\)/);
  });

  it("useLiveFeed builds websocket URL with token", () => {
    const src = readText("src/hooks/useLiveFeed.js");
    assert.match(src, /\/api\/ws\?token=/);
    assert.match(src, /getToken\(\)/);
  });
});
