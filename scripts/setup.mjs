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
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EXPECTED_FONT_SUBSETS } from "./metric-fonts.mjs";
import { formatDiagnostic } from "./cli.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_SCHEMA = "beautidraw.bundle-manifest/3";
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const [, , arg] = process.argv;
if (arg === "--help" || arg === "-h") {
  console.log("usage: node scripts/setup.mjs");
  console.log("       idempotently provisions node_modules (pinned deps), Chromium,");
  console.log("       and the vendored Excalidraw bundle; prints 'already provisioned,'");
  console.log("       and does nothing when everything verifies.");
  process.exit(0);
}

function run(cmd, args) {
  // cwd is pinned to ROOT so this works when invoked from any directory —
  // pnpm and playwright both resolve config relative to cwd, not to argv[1].
  try {
    execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  } catch (e) {
    if (e.code === "ENOENT") {
      console.error(`[setup] '${cmd}' is not on PATH. This repo installs with pnpm`);
      console.error("[setup] (see pnpm-workspace.yaml); install it first:");
      console.error("[setup]   corepack enable && corepack prepare pnpm@11.0.3 --activate");
      console.error("[setup] or: npm install -g pnpm@11.0.3   (package.json pins this version)");
      process.exit(1);
    }
    console.error(formatDiagnostic({
      command: "setup",
      stage: "provision",
      reason: `${cmd} failed while provisioning dependencies`,
      recovery: "Check the command output and rerun setup after correcting the environment.",
      stack: e.stack,
    }, { debug: process.argv.includes("--debug") }));
    process.exit(1);
  }
}

let didWork = false;

function installedVersion(pkg) {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, "node_modules", pkg, "package.json"), "utf8"))
      .version;
  } catch {
    return null;
  }
}

// Every direct dependency, at the pinned version — not just a directory that
// exists. react and react-dom are loaded by vendor-entry.js and recorded by
// build-bundle.mjs, so a partial install containing only playwright would
// otherwise report ready and fail later during bundling; and a tree left behind
// by an older pin would be bundled as if current, which is the same
// wrong-measurements failure the vendor gate below exists to prevent.
const PINS = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")).devDependencies;
const REQUIRED_DEPS = ["playwright", "@excalidraw/excalidraw", "esbuild", "react", "react-dom"];

function depProblem() {
  for (const dep of REQUIRED_DEPS) {
    const pin = PINS?.[dep];
    // This repo's whole thesis is that geometry is only reproducible against
    // pinned versions, so a range here is a setup error, not something to
    // shrug past — an unverifiable pin would make this gate fail-open.
    if (!pin) return `package.json does not declare ${dep}`;
    if (!/^\d+\.\d+\.\d+$/.test(pin)) return `${dep} is pinned as "${pin}"; an exact version is required`;
    const installed = installedVersion(dep);
    if (!installed) return `${dep} is not installed`;
    if (installed !== pin) return `${dep}@${installed} is installed, package.json pins ${pin}`;
  }
  // The direct pins are the whole guarantee: no lockfile is committed, so the
  // transitive tree is whatever pnpm resolves at install time and drift below
  // the direct deps is NOT detected here. The versions that decide geometry —
  // excalidraw, react, esbuild — are all direct and exact; if a transitive bump
  // ever moves a measurement, the fix is to commit a lockfile again and restore
  // a hash gate against it.
  return null;
}

const depIssue = depProblem();
if (depIssue) {
  console.log(`[setup] installing dependencies — ${depIssue}`);
  run("pnpm", ["install"]);
  didWork = true;

  // Re-check, and stop if the install did not resolve it. An install can exit 0
  // having left a node_modules tree that still disagrees with the pins. Left
  // unchecked, setup would go on to build the vendor bundle against versions
  // that do not match package.json — a bundle that measures wrongly but reports
  // ready, which is the exact failure this whole gate exists to prevent.
  const stillBroken = depProblem();
  if (stillBroken) {
    console.error(`[setup] dependencies are still wrong after install: ${stillBroken}`);
    console.error("[setup] refusing to build the bundle against an unpinned tree.");
    console.error("[setup] remove node_modules and re-run, or reconcile the pins in package.json.");
    process.exit(1);
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
  // An install that exits 0 is not a browser that exists.
  if (!existsSync(chromiumPath)) {
    console.error(`[setup] Chromium is still absent after install: ${chromiumPath}`);
    process.exit(1);
  }
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
  // `null` and `[1,2]` are both valid JSON, and reading .schema off null throws
  // a TypeError that escapes this function instead of triggering a rebuild.
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    return "manifest.json is not an object";
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

  // The bundle must match the source that built it, not merely its own recorded
  // hash. A self-consistent bundle built from a since-edited vendor-entry.js is
  // exactly the silent-stale-code case, and nothing else here would notice it.
  const inputs = manifest.inputs;
  if (!inputs || typeof inputs !== "object") return "manifest records no build inputs";
  for (const rel of ["scripts/vendor-entry.js", "scripts/build-bundle.mjs"]) {
    if (!inputs[rel]) return `manifest does not record ${rel}`;
    if (sha256(readFileSync(resolve(ROOT, rel))) !== inputs[rel]) {
      return `${rel} changed since the bundle was built`;
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
  if (!fonts || typeof fonts !== "object") return "manifest records no fonts";

  // The expected set comes from the PINNED PACKAGE, not from the manifest.
  // build-bundle.mjs generates the manifest by listing whatever is on disk, so
  // a manifest can only ever attest to itself — family prefixes and counts let
  // five renamed files pass, each one dutifully matching the hash the manifest
  // recorded for it. Naming the source of truth outside the artifact is the
  // only version of this check that means anything.
  const SRC_FONTS = resolve(ROOT, "node_modules/@excalidraw/excalidraw/dist/prod/fonts");
  const expected = new Map();
  for (const family of Object.keys(EXPECTED_FONT_SUBSETS)) {
    const dir = resolve(SRC_FONTS, family);
    if (!existsSync(dir)) return `the pinned package has no ${family} font directory`;
    const names = readdirSync(dir).filter((f) => f.endsWith(".woff2")).sort();
    if (names.length !== EXPECTED_FONT_SUBSETS[family]) {
      return `the pinned package ships ${names.length} ${family} subsets, expected ${EXPECTED_FONT_SUBSETS[family]}`;
    }
    for (const name of names) expected.set(`${family}/${name}`, resolve(dir, name));
  }

  const recorded = new Set(Object.keys(fonts));
  for (const rel of expected.keys()) {
    if (!recorded.has(rel)) return `manifest does not record ${rel}`;
  }
  for (const rel of recorded) {
    if (!expected.has(rel)) return `manifest records unexpected font ${rel}`;
  }

  // Vendor copy must match the package byte for byte, and the manifest must
  // have recorded that same digest.
  for (const [rel, src] of expected) {
    const file = resolve(VENDOR, "fonts", rel);
    if (!existsSync(file)) return `font ${rel} is missing`;
    const digest = sha256(readFileSync(file));
    if (digest !== sha256(readFileSync(src))) return `font ${rel} differs from the pinned package`;
    if (digest !== fonts[rel]) return `font ${rel} does not match its recorded hash`;
  }

  return null;
}

const problem = vendorProblem();
if (problem) {
  console.log(`[setup] rebuilding the vendored Excalidraw bundle — ${problem}`);
  run("node", [resolve(ROOT, "scripts/build-bundle.mjs")]);
  didWork = true;

  // Same reasoning as the dependency re-check: a build that ran is not a build
  // that worked. build-bundle.mjs copies from node_modules, so a damaged source
  // tree yields a self-consistent manifest describing a broken vendor dir —
  // which this run would then report as ready.
  const stillBroken = vendorProblem();
  if (stillBroken) {
    console.error(`[setup] the rebuilt bundle is still invalid: ${stillBroken}`);
    console.error("[setup] remove node_modules and scripts/vendor, then re-run.");
    process.exit(1);
  }
}

console.log(didWork ? "[setup] ready" : "[setup] already provisioned, nothing to do");
