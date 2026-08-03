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
  try {
    execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  } catch (e) {
    if (e.code === "ENOENT") {
      console.error(`[setup] '${cmd}' is not on PATH. This repo pins its dependency tree with`);
      console.error("[setup] pnpm (pnpm-lock.yaml + pnpm-workspace.yaml); install it first:");
      console.error("[setup]   npm install -g pnpm");
      process.exit(1);
    }
    throw e;
  }
}

let didWork = false;

if (!existsSync(resolve(ROOT, "node_modules/playwright"))) {
  console.log("[setup] installing dependencies");
  run("pnpm", ["install", "--frozen-lockfile"]);
  didWork = true;
}

// `chromium.executablePath()` reports where the binary WOULD live; it does not
// throw when the browser was never downloaded. Verified against this Playwright
// build: firefox and webkit both return a path with existsSync === false. So the
// check has to stat the path — catching a throw here would silently skip the
// download and fail later at browser launch instead.
const chromiumPath = execFileSync(
  "node",
  ["-e", "process.stdout.write(require('playwright').chromium.executablePath())"],
  { cwd: ROOT, encoding: "utf8" },
);
if (!existsSync(chromiumPath)) {
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
