import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  walkSourceFiles,
  collectRelativeImports,
  resolveRelativeImport,
  SRC_DIR,
} from "./helpers.mjs";

describe("dashboard-ui relative imports", () => {
  const files = walkSourceFiles();

  it("resolves every relative import in src/", () => {
    const broken = [];

    for (const file of files) {
      for (const spec of collectRelativeImports(file)) {
        const result = resolveRelativeImport(file, spec);
        if (!result.ok) {
          broken.push({
            file: path.relative(SRC_DIR, file),
            spec,
            expected: path.relative(SRC_DIR, result.resolved),
          });
        }
      }
    }

    assert.deepEqual(
      broken,
      [],
      broken.map((b) => `${b.file}: "${b.spec}" → missing (${b.expected})`).join("\n")
    );
  });

  it("pages import api from ../api", () => {
    const pagesDir = path.join(SRC_DIR, "pages");
    const offenders = walkSourceFiles(pagesDir).filter((file) => {
      return collectRelativeImports(file).includes("./api");
    });

    assert.deepEqual(
      offenders.map((f) => path.relative(SRC_DIR, f)),
      [],
      "pages must use ../api, not ./api"
    );
  });

  it("Layout imports api from ./api", () => {
    const specs = collectRelativeImports(path.join(SRC_DIR, "Layout.jsx"));
    assert.ok(specs.includes("./api"), "Layout.jsx should import ./api");
    assert.ok(!specs.includes("../api"), "Layout.jsx must not import ../api");
  });

  it("App imports api from ./api", () => {
    const specs = collectRelativeImports(path.join(SRC_DIR, "App.jsx"));
    assert.ok(specs.includes("./api"));
  });
});
