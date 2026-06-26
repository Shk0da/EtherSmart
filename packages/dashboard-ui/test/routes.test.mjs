import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  UI_ROOT,
  readText,
  EXPECTED_ROUTES,
  LAYOUT_NAV_PATHS,
  BOT_IDS,
} from "./helpers.mjs";

describe("dashboard-ui routes and navigation", () => {
  const appSource = readText("src/App.jsx");
  const layoutSource = readText("src/Layout.jsx");

  it("App.jsx wires all page components", () => {
    for (const route of EXPECTED_ROUTES) {
      const pageName = path.basename(route.file, path.extname(route.file));
      assert.match(
        appSource,
        new RegExp(`import\\s+${pageName}\\s+from`),
        `missing import for ${pageName}`
      );
    }
  });

  it("route paths are declared in App.jsx", () => {
    assert.match(appSource, /path="\/login"/);
    assert.match(appSource, /path="bots\/:id"/);
    assert.match(appSource, /path="deploy"/);
    assert.match(appSource, /path="pnl"/);
    assert.match(appSource, /path="trades"/);
    assert.match(appSource, /path="balances"/);
    assert.match(appSource, /path="audit"/);
    assert.match(appSource, /<Route index element=\{<OverviewPage/);
  });

  it("redirects unauthenticated users to /login", () => {
    assert.match(appSource, /getToken\(\)\s*\?\s*<Layout\s*\/>\s*:\s*<Navigate to="\/login"/);
  });

  it("all route page files exist", () => {
    for (const route of EXPECTED_ROUTES) {
      assert.ok(
        fs.existsSync(path.join(UI_ROOT, route.file)),
        `missing page file: ${route.file}`
      );
    }
  });

  it("Layout sidebar links cover main sections", () => {
    for (const href of LAYOUT_NAV_PATHS) {
      assert.match(
        layoutSource,
        new RegExp(`to="${href.replace(/\//g, "\\/")}"`),
        `missing NavLink to ${href}`
      );
    }
  });

  it("Layout links all bot versions", () => {
    for (const id of BOT_IDS) {
      assert.match(layoutSource, new RegExp(`to="/bots/${id}"`));
    }
  });

  it("index.html boots React app", () => {
    const html = readText("index.html");
    assert.match(html, /id="root"/);
    assert.match(html, /src\/main\.jsx/);
    assert.match(html, /EtherSmart Control Panel/);
  });

  it("main.jsx mounts BrowserRouter and App", () => {
    const main = readText("src/main.jsx");
    assert.match(main, /BrowserRouter/);
    assert.match(main, /import App from "\.\/App"/);
    assert.match(main, /import "\.\/styles\.css"/);
  });
});
