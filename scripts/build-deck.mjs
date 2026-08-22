// Single automatic build entry point for Beautidraw.
//
// The model writes one semantic deck-spec.json. This command audits it,
// computes the deterministic base layout, then turns each semantic `visual`
// declaration into a composed frame. No hand-authored composition coordinates
// are required.
//
// Usage:
//   node scripts/build-deck.mjs <deck-spec.json> <outdir>

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [, , specArg, outArg] = process.argv;
if (!specArg || !outArg) {
  console.error("usage: node scripts/build-deck.mjs <deck-spec.json> <outdir>");
  process.exit(1);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const spec = resolve(specArg);
const out = resolve(outArg);

execFileSync(node, [resolve(ROOT, "scripts/audit-deck-spec.mjs"), spec], { stdio: "inherit" });
execFileSync(node, [resolve(ROOT, "scripts/generate.mjs"), spec, out], { stdio: "inherit" });
execFileSync(node, [resolve(ROOT, "scripts/auto-compose.mjs"), spec, out], { stdio: "inherit" });
execFileSync(node, [resolve(ROOT, "scripts/audit-deck-spec.mjs"), spec, resolve(out, "auto-composition-spec.json")], { stdio: "inherit" });
console.error(`BUILD DECK OK — ${out}`);
