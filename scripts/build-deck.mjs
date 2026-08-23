// Single automatic build entry point for Beautidraw.
//
// The model writes one semantic deck-spec.json. This command audits it,
// computes the deterministic base layout, then turns each semantic `visual`
// declaration into a composed frame. No hand-authored composition coordinates
// are required.
//
// Each stage already explains its own failures on stderr; this wrapper only
// stops the sequence and names the stage — a raw child-process stack trace on
// top of that report is noise, not information.
//
// Usage:
//   node scripts/build-deck.mjs <deck-spec.json> <outdir>

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatDiagnostic } from "./cli.mjs";
import { preflightDeck } from "./preflight.mjs";

const [, , specArg, outArg] = process.argv;
if (!specArg || !outArg || specArg === "--help" || specArg === "-h") {
  console.error("usage: node scripts/build-deck.mjs <deck-spec.json> <outdir>");
  console.error("       audits the spec, lays out every band, composes canvas visuals,");
  console.error("       and writes deck.excalidraw plus band/scene PNGs into <outdir>.");
  process.exit(specArg === "--help" || specArg === "-h" ? 0 : 1);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const spec = resolve(specArg);
const out = resolve(outArg);

if (!existsSync(spec)) {
  console.error(formatDiagnostic({
    command: "build-deck",
    stage: "preflight",
    input: spec,
    reason: "deck spec file does not exist",
    recovery: "Pass an existing deck-spec.json path.",
  }));
  process.exit(1);
}
const preflight = await preflightDeck({ specPath: spec });
if (!preflight.ok) {
  console.error(formatDiagnostic({
    command: "build-deck",
    stage: "preflight",
    input: spec,
    reason: preflight.failures.map((failure) => `${failure.field}: ${failure.reason}`).join("; "),
    recovery: "Fix the deck spec and rerun the build.",
  }));
  process.exit(1);
}
if (!existsSync(resolve(ROOT, "node_modules", "playwright", "package.json"))) {
  console.error(`build-deck: dependencies are missing — run: node ${resolve(ROOT, "scripts/setup.mjs")}`);
  process.exit(1);
}

// Idempotent; provisions deps/Chromium/bundle before any stage needs them.
execFileSync(node, [resolve(ROOT, "scripts/setup.mjs")], { stdio: "inherit" });

const stages = [
  ["presentation audit", [resolve(ROOT, "scripts/audit-deck-spec.mjs"), spec]],
  ["base layout", [resolve(ROOT, "scripts/generate.mjs"), spec, out]],
  ["semantic composition", [resolve(ROOT, "scripts/auto-compose.mjs"), spec, out]],
  ["composed-deck audit", [resolve(ROOT, "scripts/audit-deck-spec.mjs"), spec, resolve(out, "auto-composition-spec.json")]],
];

for (const [name, args] of stages) {
  const result = spawnSync(node, args, { stdio: "inherit" });
  if (result.error) {
    console.error(`build-deck: ${name} could not run: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`build-deck: stopped at ${name}; the report above explains why. Nothing further was built.`);
    process.exit(result.status ?? 1);
  }
}

console.error(`BUILD DECK OK — ${out}`);
