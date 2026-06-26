import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { UI_ROOT } from "./helpers.mjs";

function runBuild() {
  const npmCli = path.join(
    path.dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js"
  );
  const useNodeNpm = fs.existsSync(npmCli);
  return spawnSync(
    useNodeNpm ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm",
    useNodeNpm ? [npmCli, "run", "build"] : ["run", "build"],
    {
      cwd: UI_ROOT,
      env: process.env,
      encoding: "utf8",
      shell: !useNodeNpm && process.platform === "win32",
    }
  );
}

describe("dashboard-ui production build", () => {
  it("vite build succeeds and emits assets", () => {
    const result = runBuild();

    assert.equal(
      result.status,
      0,
      [result.stdout, result.stderr].filter(Boolean).join("\n")
    );

    const dist = path.join(UI_ROOT, "dist");
    assert.ok(fs.existsSync(path.join(dist, "index.html")));

    const assetsDir = path.join(dist, "assets");
    const assets = fs.readdirSync(assetsDir);
    assert.ok(assets.some((f) => f.endsWith(".js")), "missing bundled JS");
    assert.ok(assets.some((f) => f.endsWith(".css")), "missing bundled CSS");

    const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
    assert.match(html, /id="root"/);
    assert.match(html, /assets\/index-.*\.js/);
  });
});
