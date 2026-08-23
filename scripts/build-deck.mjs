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
import { CliError, runCli } from "./cli.mjs";
import { preflightDeck } from "./preflight.mjs";

const usage = "usage: node scripts/build-deck.mjs <deck-spec.json> <outdir>\n       audits the spec, lays out every band, composes canvas visuals,\n       and writes deck.excalidraw plus band/scene PNGs into <outdir>.";
const status = await runCli("build-deck", async ({ values }) => {
const { specArg, outArg } = values;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const spec = resolve(specArg);
const out = resolve(outArg);

if (!existsSync(spec)) {
  throw new CliError({
    command: "build-deck",
    stage: "preflight",
    input: spec,
    reason: "deck spec file does not exist",
    recovery: "Pass an existing deck-spec.json path.",
  });
}
const preflight = await preflightDeck({ specPath: spec });
if (!preflight.ok) {
  throw new CliError({
    command: "build-deck",
    stage: "preflight",
    input: spec,
    reason: preflight.failures.map((failure) => `${failure.field}: ${failure.reason}`).join("; "),
    recovery: "Fix the deck spec and rerun the build.",
  });
}
if (!existsSync(resolve(ROOT, "node_modules", "playwright", "package.json"))) {
  throw new CliError({
    command: "build-deck",
    stage: "setup",
    reason: "dependencies are missing",
    recovery: `Run node ${resolve(ROOT, "scripts/setup.mjs")} and retry the build.`,
  });
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
    throw new CliError({
      command: "build-deck",
      stage: name,
      reason: "stage could not run",
      recovery: "Check the stage dependencies and rerun the build with --debug for details.",
      cause: result.error,
    });
  }
  if (result.status !== 0) {
    throw new CliError({
      command: "build-deck",
      stage: name,
      reason: `stage exited with status ${result.status ?? 1}`,
      recovery: "Fix the stage failure reported above and rerun the build.",
    });
  }
}

console.error(`BUILD DECK OK — ${out}`);
return 0;
}, { argv: process.argv.slice(2), usage, positional: ["specArg", "outArg"] });

process.exitCode = status;
