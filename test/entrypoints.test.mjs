import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const commands = [
  ["scripts/build-deck.mjs", ["--help"]],
  ["scripts/audit-deck-spec.mjs", ["--help"]],
  ["scripts/generate.mjs", ["--help"]],
  ["scripts/auto-compose.mjs", ["--help"]],
  ["scripts/compose.mjs", ["--help"]],
  ["scripts/setup.mjs", ["--help"]],
  ["scripts/build-bundle.mjs", ["--help"]],
  ["scripts/spike/run-all.mjs", ["--help"]],
];

test("public entry points provide concrete help without a stack", () => {
  for (const [script, args] of commands) {
    const result = spawnSync(process.execPath, [resolve(root, script), ...args], {
      cwd: root,
      encoding: "utf8",
    });
    const output = `${result.stdout}${result.stderr}`;
    assert.equal(result.status, 0, `${script} exited ${result.status}: ${output}`);
    assert.match(output, /usage:/i, `${script} did not print usage`);
    assert.doesNotMatch(output, /at .*\.mjs:/, `${script} printed a stack`);
  }
});

test("invalid deck input fails before browser work without a raw stack", async () => {
  const tempRoot = await mkdtemp(resolve(tmpdir(), "beautidraw-entrypoint-"));
  const missing = resolve(tempRoot, "missing.json");
  const outputDir = resolve(tempRoot, "out");
  for (const script of ["scripts/audit-deck-spec.mjs", "scripts/generate.mjs", "scripts/auto-compose.mjs", "scripts/build-deck.mjs"]) {
    const args = script.endsWith("generate.mjs") || script.endsWith("auto-compose.mjs") || script.endsWith("build-deck.mjs")
      ? [missing, outputDir]
      : [missing];
    const result = spawnSync(process.execPath, [resolve(root, script), ...args], {
      cwd: root,
      encoding: "utf8",
    });
    const output = `${result.stdout}${result.stderr}`;
    assert.notEqual(result.status, 0, `${script} unexpectedly passed`);
    assert.match(output, /preflight|not found|does not exist/i);
    assert.doesNotMatch(output, /at .*\.mjs:/, `${script} printed a raw stack: ${output}`);
  }
});

test("help stays available when heavy dependencies are blocked", async () => {
  const tempRoot = await mkdtemp(resolve(tmpdir(), "beautidraw-loader-"));
  const loader = resolve(tempRoot, "block-heavy.mjs");
  await writeFile(loader, `export async function resolve(specifier, context, nextResolve) {
  if (specifier === "esbuild" || specifier === "playwright") throw new Error("blocked heavy dependency");
  return nextResolve(specifier, context);
}\n`);
  const env = {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --experimental-loader=${loader}`.trim(),
  };
  for (const script of ["scripts/generate.mjs", "scripts/compose.mjs", "scripts/build-bundle.mjs"]) {
    const result = spawnSync(process.execPath, [resolve(root, script), "--help"], {
      cwd: root,
      env,
      encoding: "utf8",
    });
    const output = `${result.stdout}${result.stderr}`;
    assert.equal(result.status, 0, `${script}: ${output}`);
    assert.match(output, /usage:/i);
    assert.doesNotMatch(output, /blocked heavy dependency|at .*\.mjs:/);
  }
});

test("audit and compose route invalid input through shared diagnostics", async () => {
  const rootDir = await mkdtemp(resolve(tmpdir(), "beautidraw-entrypoint-"));
  const invalidSpecPath = resolve(rootDir, "invalid.json");
  await writeFile(invalidSpecPath, JSON.stringify({ bands: "not-an-array" }));
  const audit = spawnSync(process.execPath, [resolve(root, "scripts/audit-deck-spec.mjs"), invalidSpecPath], {
    cwd: root,
    encoding: "utf8",
  });
  const auditOutput = `${audit.stdout}${audit.stderr}`;
  assert.notEqual(audit.status, 0);
  assert.match(auditOutput, /audit-deck-spec failed/);
  assert.doesNotMatch(auditOutput, /PRESENTATION AUDIT FAILED/);
  assert.doesNotMatch(auditOutput, /at .*\.mjs:/);

  const compositionPath = resolve(rootDir, "composition.json");
  await writeFile(compositionPath, JSON.stringify({ bands: "not-an-array" }));
  const deckPath = resolve(rootDir, "deck.json");
  await writeFile(deckPath, JSON.stringify({ elements: [], files: {} }));
  const diagnosticsPath = resolve(rootDir, "diagnostics.json");
  await writeFile(diagnosticsPath, JSON.stringify({ diagnostics: { bands: [] } }));
  const compose = spawnSync(process.execPath, [resolve(root, "scripts/compose.mjs"), deckPath, compositionPath, rootDir], {
    cwd: root,
    encoding: "utf8",
  });
  const composeOutput = `${compose.stdout}${compose.stderr}`;
  assert.notEqual(compose.status, 0);
  assert.match(composeOutput, /compose failed/);
  assert.doesNotMatch(composeOutput, /at .*\.mjs:/);
});
