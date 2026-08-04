// Builds the offline Excalidraw bundle the harness loads.
//
// Output goes to scripts/vendor/. Nothing here is fetched at render time.
// The bundle hash is part of oracle_hash, so this script also
// writes a manifest recording exactly what went in.

import { build } from "esbuild";
import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EXPECTED_FONT_SUBSETS } from "./metric-fonts.mjs";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendorDir = resolve(root, "scripts/vendor");
const excalidrawPkg = resolve(root, "node_modules/@excalidraw/excalidraw");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

await rm(vendorDir, { recursive: true, force: true });
await mkdir(vendorDir, { recursive: true });

// Excalidraw's prod build reads process.env.NODE_ENV and import.meta.env.
// Define both so the bundle runs in a plain browser page with no shim.
await build({
  entryPoints: [resolve(root, "scripts/vendor-entry.js")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome120",
  outfile: resolve(vendorDir, "excalidraw.js"),
  conditions: ["production"],
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.VITE_APP_DISABLE_TRACKING": '"true"',
    "import.meta.env.MODE": '"production"',
    "import.meta.env.DEV": "false",
    "import.meta.env.PROD": "true",
  },
  loader: { ".woff2": "file", ".ttf": "file", ".png": "file", ".svg": "file" },
  assetNames: "assets/[name]-[hash]",
  logLevel: "warning",
});

// Fonts and stylesheet ship alongside — measurement is only valid once the
// real faces are loaded, so they must be served locally too.
await cp(resolve(excalidrawPkg, "dist/prod/fonts"), resolve(vendorDir, "fonts"), {
  recursive: true,
});
await cp(resolve(excalidrawPkg, "dist/prod/index.css"), resolve(vendorDir, "excalidraw.css"));

const bundle = await readFile(resolve(vendorDir, "excalidraw.js"));
const css = await readFile(resolve(vendorDir, "excalidraw.css"));
const pkg = JSON.parse(await readFile(resolve(excalidrawPkg, "package.json"), "utf8"));
const own = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));

// Record the font files the type ramp measures against, by name and hash, so
// setup.mjs can verify the copy exactly rather than counting files. The family
// list and the reasoning behind it live in metric-fonts.mjs, shared with setup.
const fonts = {};
for (const [family, expected] of Object.entries(EXPECTED_FONT_SUBSETS)) {
  const dir = resolve(vendorDir, "fonts", family);
  const names = (await readdir(dir)).filter((f) => f.endsWith(".woff2")).sort();
  // Assert here too, not only in setup.mjs. A direct `pnpm bundle` bypasses
  // setup entirely, and without this it would happily write a self-consistent
  // manifest describing a partial font copy — which setup would then accept as
  // matching, because the manifest and the tree agree with each other.
  if (names.length !== expected) {
    throw new Error(
      `fonts/${family}: found ${names.length} subsets, expected ${expected}. ` +
        `Refusing to write a manifest for an incomplete font copy.`,
    );
  }
  for (const name of names) {
    fonts[`${family}/${name}`] = sha256(await readFile(resolve(dir, name)));
  }
}

// Bind the artifact to the source that produced it. The version fields below
// pin WHAT went in; these pin HOW. Without them a plugin update that edits
// vendor-entry.js or this script leaves a stale bundle that still validates
// against its own recorded hash, and the old code is used silently.
const inputs = {};
for (const rel of ["scripts/vendor-entry.js", "scripts/build-bundle.mjs"]) {
  inputs[rel] = sha256(await readFile(resolve(root, rel)));
}

const manifest = {
  schema: "beautidraw.bundle-manifest/3",
  excalidrawVersion: pkg.version,
  react: require("react/package.json").version,
  reactDom: require("react-dom/package.json").version,
  esbuild: require("esbuild/package.json").version,
  playwrightPinned: own.devDependencies.playwright,
  bundleSha256: sha256(bundle),
  cssSha256: sha256(css),
  bundleBytes: bundle.length,
  fonts,
  inputs,
};

await writeFile(
  resolve(vendorDir, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);

console.log(JSON.stringify(manifest, null, 2));
