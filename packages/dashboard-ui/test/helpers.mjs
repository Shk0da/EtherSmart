import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UI_ROOT = path.resolve(__dirname, "..");
export const SRC_DIR = path.join(UI_ROOT, "src");

const SOURCE_EXT = [".js", ".jsx", ".mjs", ".ts", ".tsx"];
const IMPORT_RE =
  /import\s+(?:[\w*{}\s,]+\s+from\s+)?["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /import\s*\(\s*["']([^"']+)["']\s*\)/g;

export function walkSourceFiles(dir = SRC_DIR) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkSourceFiles(full));
      continue;
    }
    if (/\.(jsx?|mjs|tsx?)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

export function resolveRelativeImport(fromFile, spec) {
  if (!spec.startsWith(".")) return { ok: true, external: true };

  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    ...SOURCE_EXT.map((ext) => `${base}${ext}`),
    ...SOURCE_EXT.map((ext) => path.join(base, `index${ext}`)),
  ];

  const hit = candidates.find((p) => fs.existsSync(p));
  return { ok: Boolean(hit), resolved: hit || candidates[0] };
}

export function collectRelativeImports(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const specs = new Set();

  for (const re of [IMPORT_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      specs.add(match[1]);
    }
  }

  return [...specs];
}

export function readText(relPath) {
  return fs.readFileSync(path.join(UI_ROOT, relPath), "utf8");
}

export const EXPECTED_ROUTES = [
  { path: "/login", file: "src/pages/LoginPage.jsx" },
  { path: "/", file: "src/pages/OverviewPage.jsx", index: true },
  { path: "/bots/:id", file: "src/pages/BotPage.jsx" },
  { path: "deploy", file: "src/pages/DeployPage.jsx" },
  { path: "pnl", file: "src/pages/PnlPage.jsx" },
  { path: "trades", file: "src/pages/TradesPage.jsx" },
  { path: "balances", file: "src/pages/BalancesPage.jsx" },
  { path: "audit", file: "src/pages/AuditPage.jsx" },
];

export const LAYOUT_NAV_PATHS = [
  "/",
  "/bots/v2",
  "/bots/v3",
  "/bots/v4",
  "/bots/v5",
  "/deploy",
  "/pnl",
  "/trades",
  "/balances",
  "/audit",
];

export const BOT_IDS = ["v2", "v3", "v4", "v5"];
