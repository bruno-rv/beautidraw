// The single transactional build entry point for Beautidraw.
//
// Every child writes into a sibling stage directory. Only after the audit,
// layout, composition, outline, final diagnostics, and receipt have all
// succeeded does staging.mjs replace the requested output directory.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat } from "node:fs/promises";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CliError, runCli } from "./cli.mjs";
import { preflightDeck, readJsonInput } from "./preflight.mjs";
import { withStagedOutput } from "./staging.mjs";
import { collectBuildReceipt, formatBuildReceipt } from "./build-receipt.mjs";
import { buildOutline } from "./outline.mjs";

const usage = "usage: node scripts/build-deck.mjs <deck-spec.json> <outdir>\n       audits, lays out, composes, documents, and atomically publishes a deck.";
const status = await runCli("build-deck", async ({ values, debug }) => {
  const { specArg, outArg } = values;
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const node = process.execPath;
  const specPath = resolve(specArg);
  const outDir = resolve(outArg);

  if (!existsSync(specPath)) {
    throw new CliError({
      command: "build-deck",
      stage: "preflight",
      input: specPath,
      reason: "deck spec file does not exist",
      recovery: "Pass an existing deck-spec.json path.",
    });
  }

  // Preflight deliberately happens before staging or setup: malformed input
  // must not launch Chromium or create residue beside a previous success.
  const spec = await readJsonInput(specPath, { label: "deck spec" });
  const preflight = await preflightDeck({ specPath, spec, mode: "automatic" });
  if (!preflight.ok) {
    throw new CliError({
      command: "build-deck",
      stage: "preflight",
      input: specPath,
      reason: preflight.failures.map((failure) => `${failure.field}: ${failure.reason}`).join("; "),
      recovery: "Fix the deck spec and rerun the build.",
    });
  }

  const runChild = (stage, args) => {
    const result = spawnSync(node, args, { cwd: root, encoding: "utf8" });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    if (result.error || result.status !== 0) {
      const reason = result.error ? "stage could not run" : `stage exited with status ${result.status ?? 1}`;
      const failure = new CliError({
        command: "build-deck",
        stage,
        input: specPath,
        reason: output ? `${reason}: ${output}` : reason,
        recovery: "Fix the stage failure reported above and rerun the build.",
        cause: result.error,
      });
      // Preserve the child diagnostic only for --debug. runCli strips stack
      // frames from the reason in normal mode; this stack gives debug users the
      // exact child location without making ordinary failures noisy.
      if (debug && output) failure.stack = output;
      throw failure;
    }
  };

  const assertCompleteArtifacts = async (stageDir, frameCount) => {
    const required = ["deck.excalidraw", "scene.png", "diagnostics.json", "composition-manifest.json", "outline.md"];
    for (const name of required) {
      const info = await lstat(resolve(stageDir, name)).catch(() => null);
      if (!info?.isFile()) throw new CliError({ command: "build-deck", stage: "finalize", input: stageDir, reason: `required artifact ${name} is missing`, recovery: "Rerun the build after restoring the missing stage output." });
    }
    const names = (await readdir(stageDir)).filter((name) => /^band-\d+\.png$/.test(name));
    const expected = new Set(Array.from({ length: frameCount }, (_, index) => `band-${String(index + 1).padStart(2, "0")}.png`));
    if (names.length !== frameCount || names.some((name) => !expected.has(name))) {
      throw new CliError({ command: "build-deck", stage: "finalize", input: stageDir, reason: `band PNG count ${names.length} does not match frame count ${frameCount}`, recovery: "Rerun the build and ensure every frame render is emitted." });
    }
  };

  const built = await withStagedOutput(outDir, async (stageDir) => {
    const started = Date.now();
    runChild("setup", [resolve(root, "scripts/setup.mjs"), ...(debug ? ["--debug"] : [])]);
    runChild("presentation audit", [resolve(root, "scripts/audit-deck-spec.mjs"), specPath, ...(debug ? ["--debug"] : [])]);
    runChild("base layout", [resolve(root, "scripts/generate.mjs"), specPath, stageDir, ...(debug ? ["--debug"] : [])]);
    runChild("semantic composition", [resolve(root, "scripts/auto-compose.mjs"), specPath, stageDir, ...(debug ? ["--debug"] : [])]);
    runChild("composed-deck audit", [
      resolve(root, "scripts/audit-deck-spec.mjs"),
      specPath,
      resolve(stageDir, "auto-composition-spec.json"),
      ...(debug ? ["--debug"] : []),
    ]);

    const compositionPath = resolve(stageDir, "composition-manifest.json");
    let compositionManifest;
    if (existsSync(compositionPath)) {
      compositionManifest = JSON.parse(await readFile(compositionPath, "utf8"));
    } else {
      compositionManifest = { version: 1, bands: [], images: [] };
      await writeFile(compositionPath, JSON.stringify(compositionManifest, null, 2) + "\n");
    }

    const deck = JSON.parse(await readFile(resolve(stageDir, "deck.excalidraw"), "utf8"));
    const frameNames = deck.elements.filter((element) => element.type === "frame").map((frame) => frame.name);
    await writeFile(
      resolve(stageDir, "outline.md"),
      buildOutline(spec, { frameNames, compositionManifest }),
    );

    const diagnosticsPath = resolve(stageDir, "diagnostics.json");
    const diagnostics = JSON.parse(await readFile(diagnosticsPath, "utf8"));
    const elapsedMs = Date.now() - started;
    diagnostics.stage = "done";
    diagnostics.passed = true;
    diagnostics.build = {
      elapsedMs,
      frameCount: frameNames.length,
      deliverables: {
        required: ["deck.excalidraw", "scene.png", "diagnostics.json", "composition-manifest.json", "outline.md"],
        bands: { category: "band-png", pattern: "band-NN.png", count: frameNames.length },
      },
    };
    await writeFile(diagnosticsPath, JSON.stringify(diagnostics, null, 2) + "\n");

    if (process.env.BEAUTIDRAW_TEST_OMIT_FINAL_ARTIFACT === "scene.png") {
      await rm(resolve(stageDir, "scene.png"), { force: true });
    }
    await assertCompleteArtifacts(stageDir, frameNames.length);

    return collectBuildReceipt(stageDir, { elapsedMs, publishedOutDir: outDir });
  });

  console.error(`BUILD DECK OK — ${outDir}`);
  console.error(formatBuildReceipt(built.result));
  if (built.cleanupWarning) {
    console.error(
      `cleanup warning: previous output backup remains at ${built.cleanupWarning.path} after ${built.cleanupWarning.attempts} attempts (${built.cleanupWarning.reason})`,
    );
  }
  return 0;
}, { argv: process.argv.slice(2), usage, positional: ["specArg", "outArg"] });

process.exitCode = status;
