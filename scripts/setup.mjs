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
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_SCHEMA = "beautidraw.bundle-manifest/2";
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function run(cmd, args) {
  // cwd is pinned to ROOT so this works when invoked from any directory —
  // pnpm and playwright both resolve config relative to cwd, not to argv[1].
  try {
    execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  } catch (e) {
    if (e.code === "ENOENT") {
      console.error(`[setup] '${cmd}' is not on PATH. This repo pins its dependency tree with`);
      console.error("[setup] pnpm (pnpm-lock.yaml + pnpm-workspace.yaml); install it first:");
      console.error("[setup]   corepack enable && corepack prepare pnpm@11.0.3 --activate");
      console.error("[setup] or: npm install -g pnpm@11.0.3   (package.json pins this version)");
      process.exit(1);
    }
    throw e;
  }
}

let didWork = false;

// Every direct dependency, not a single marker: react and react-dom are loaded
// by vendor-entry.js and recorded by build-bundle.mjs, so a partial install that
// happens to contain playwright would otherwise report ready and fail later
// during bundling. A marker directory can also survive an interrupted install,
// which is why the repair has to be re-checkable rather than one-shot.
const REQUIRED_DEPS = ["playwright", "@excalidraw/excalidraw", "esbuild", "react", "react-dom"];
if (REQUIRED_DEPS.some((d) => !existsSync(resolve(ROOT, "node_modules", d)))) {
  console.log("[setup] installing dependencies");
  run("pnpm", ["install", "--frozen-lockfile"]);
  didWork = true;
}

function installedVersion(pkg) {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, "node_modules", pkg, "package.json"), "utf8"))
      .version;
  } catch {
    return null;
  }
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

// Presence is not readiness. build-bundle.mjs writes manifest.json last, but a
// manifest from an earlier successful build can sit beside a half-copied tree,
// and a bundle built against an older @excalidraw/excalidraw is worse than a
// missing one — it produces plausible geometry from the wrong measurements.
// So: parse the manifest, check it describes the versions currently installed,
// and verify the bundle's bytes and hash against what the manifest recorded.
const VENDOR = resolve(ROOT, "scripts/vendor");

function vendorProblem() {
  for (const p of ["manifest.json", "excalidraw.js", "excalidraw.css"]) {
    if (!existsSync(resolve(VENDOR, p))) return `${p} is missing`;
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(VENDOR, "manifest.json"), "utf8"));
  } catch (e) {
    return `manifest.json is unreadable (${e.message})`;
  }

  if (manifest.schema !== MANIFEST_SCHEMA) {
    return `manifest schema is ${manifest.schema ?? "absent"}, expected ${MANIFEST_SCHEMA}`;
  }

  // Stale bundle: built from versions other than the ones now installed. Every
  // field is REQUIRED — an absent one used to skip its own check, which made
  // the whole gate fail-open against exactly the manifest it was meant to
  // police (a truncated or hand-edited manifest validated fine).
  for (const [key, pkg] of [
    ["excalidrawVersion", "@excalidraw/excalidraw"],
    ["react", "react"],
    ["reactDom", "react-dom"],
    ["esbuild", "esbuild"],
    ["playwrightPinned", "playwright"],
  ]) {
    const recorded = manifest[key];
    if (!recorded) return `manifest is missing ${key}`;
    const installed = installedVersion(pkg);
    if (!installed) return `${pkg} is not installed`;
    if (recorded !== installed) {
      return `built against ${pkg}@${recorded}, but ${installed} is installed`;
    }
  }

  // Truncated or corrupted bundle. bundleBytes catches a short write; the
  // sha256 catches a damaged one. Hashing 13 MB costs tens of milliseconds,
  // which is worth paying on a command that otherwise boots a whole browser.
  const bundle = readFileSync(resolve(VENDOR, "excalidraw.js"));
  if (!manifest.bundleBytes || !manifest.bundleSha256 || !manifest.cssSha256) {
    return "manifest is missing a bundle or css digest";
  }
  if (bundle.length !== manifest.bundleBytes) {
    return `excalidraw.js is ${bundle.length} bytes, manifest says ${manifest.bundleBytes}`;
  }
  if (sha256(bundle) !== manifest.bundleSha256) {
    return "excalidraw.js does not match its recorded hash";
  }
  if (sha256(readFileSync(resolve(VENDOR, "excalidraw.css"))) !== manifest.cssSha256) {
    return "excalidraw.css does not match its recorded hash";
  }

  // Fonts by name AND hash, not by count. Counting let a missing subset be
  // replaced by any arbitrary or empty .woff2 and still pass — and measuring
  // against a subset that is present but wrong silently changes wrap points
  // (spike F2/F8) rather than failing.
  const fonts = manifest.fonts;
  if (!fonts || Object.keys(fonts).length === 0) return "manifest records no fonts";
  for (const [rel, digest] of Object.entries(fonts)) {
    const file = resolve(VENDOR, "fonts", rel);
    if (!existsSync(file)) return `font ${rel} is missing`;
    if (sha256(readFileSync(file)) !== digest) return `font ${rel} does not match its hash`;
  }

  return null;
}

const problem = vendorProblem();
if (problem) {
  console.log(`[setup] rebuilding the vendored Excalidraw bundle — ${problem}`);
  run("node", [resolve(ROOT, "scripts/build-bundle.mjs")]);
  didWork = true;
}

console.log(didWork ? "[setup] ready" : "[setup] already provisioned, nothing to do");
