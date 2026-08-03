// One-time (idempotent) setup for a fresh checkout or a fresh plugin install.
//
// Three things must exist before generate.mjs can run, and none of them are
// committed: node_modules (Playwright), a Chromium browser binary, and the
// vendored Excalidraw bundle in scripts/vendor/. The bundle is a 27 MB build
// artifact and Chromium is ~150 MB, so shipping them in git is not an option —
// which means the plugin needs an explicit setup step rather than assuming a
// developer already ran one.
//
//   node <plugin-root>/scripts/setup.mjs
//
// Safe to re-run: every step checks before doing anything, and a fully
// provisioned tree exits 0 having run no installs.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, args) {
  // cwd is pinned to ROOT so this works when invoked from any directory —
  // pnpm and playwright both resolve config relative to cwd, not to argv[1].
  execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
}

let didWork = false;

if (!existsSync(resolve(ROOT, "node_modules/playwright"))) {
  console.log("[setup] installing dependencies");
  run("pnpm", ["install", "--frozen-lockfile"]);
  didWork = true;
}

// Playwright exits non-zero when the browser is missing, which is the check.
try {
  execFileSync("node", ["-e", "require('playwright').chromium.executablePath()"], {
    cwd: ROOT,
    stdio: "pipe",
  });
} catch {
  console.log("[setup] installing Chromium");
  run("pnpm", ["exec", "playwright", "install", "chromium"]);
  didWork = true;
}

if (!existsSync(resolve(ROOT, "scripts/vendor/excalidraw.js"))) {
  console.log("[setup] building the vendored Excalidraw bundle");
  run("node", [resolve(ROOT, "scripts/build-bundle.mjs")]);
  didWork = true;
}

console.log(didWork ? "[setup] ready" : "[setup] already provisioned, nothing to do");
