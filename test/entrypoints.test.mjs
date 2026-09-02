import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

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

test("generate diagnostics preserve raw detail only in debug mode", async () => {
  const tempRoot = await mkdtemp(resolve(tmpdir(), "beautidraw-generate-debug-"));
  const fakeHarness = resolve(tempRoot, "fake-harness.mjs");
  const loader = resolve(tempRoot, "inject-harness.mjs");
  await writeFile(fakeHarness, `export async function withHarness() {
  return { error: "Error: browser failed\\n    at page.evaluate (file:///tmp/engine.mjs:10:2)" };
}\n`);
  await writeFile(loader, `const target = ${JSON.stringify(pathToFileURL(fakeHarness).href)};
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "./harness-runner.mjs") return { url: target, shortCircuit: true };
  return nextResolve(specifier, context);
}\n`);
  const env = {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --experimental-loader=${loader}`.trim(),
  };
  const normalOut = resolve(tempRoot, "normal");
  const debugOut = resolve(tempRoot, "debug");
  const normal = spawnSync(process.execPath, [resolve(root, "scripts/generate.mjs"), resolve(root, "test/fixtures/minimal-deck.json"), normalOut], {
    cwd: root,
    env,
    encoding: "utf8",
  });
  const debug = spawnSync(process.execPath, [resolve(root, "scripts/generate.mjs"), "--debug", resolve(root, "test/fixtures/minimal-deck.json"), debugOut], {
    cwd: root,
    env,
    encoding: "utf8",
  });
  assert.notEqual(normal.status, 0);
  assert.notEqual(debug.status, 0);
  const normalDiagnostics = JSON.parse(await readFile(resolve(normalOut, "diagnostics.json"), "utf8"));
  const debugDiagnostics = JSON.parse(await readFile(resolve(debugOut, "diagnostics.json"), "utf8"));
  assert.doesNotMatch(normalDiagnostics.error, /\bat .*\.mjs:/);
  assert.match(debugDiagnostics.error, /\bat .*\.mjs:/);
});

test("build-deck propagates debug to child diagnostics only when requested", async () => {
  const tempRoot = await mkdtemp(resolve(tmpdir(), "beautidraw-build-deck-debug-"));
  const specPath = resolve(tempRoot, "audit-failure.json");
  const spec = {
    title: "Audit failure fixture",
    subtitle: "A valid deck that should fail the substantial-deck gate",
    footer: "Source fixture",
    bands: Array.from({ length: 8 }, (_, index) => ({
      heading: `Structured band ${index + 1}`,
      deck: "A valid structured band with enough content to reach the audit stage",
      pattern: "flow",
      accent: "blue",
      nodes: [{ label: "Input", note: "A source value" }],
    })),
  };
  await writeFile(specPath, JSON.stringify(spec));
  const normal = spawnSync(process.execPath, [resolve(root, "scripts/build-deck.mjs"), specPath, resolve(tempRoot, "normal")], {
    cwd: root,
    encoding: "utf8",
  });
  const debug = spawnSync(process.execPath, [resolve(root, "scripts/build-deck.mjs"), "--debug", specPath, resolve(tempRoot, "debug")], {
    cwd: root,
    encoding: "utf8",
  });
  const normalOutput = `${normal.stdout}${normal.stderr}`;
  const debugOutput = `${debug.stdout}${debug.stderr}`;
  assert.notEqual(normal.status, 0, normalOutput);
  assert.notEqual(debug.status, 0, debugOutput);
  assert.doesNotMatch(normalOutput, /\bstack:\n|\bat .*audit-deck-spec\.mjs:/);
  assert.match(debugOutput, /\bstack:\n/);
  assert.match(debugOutput, /\bat .*audit-deck-spec\.mjs:/);
});

test("spike bounds probe failures and preserves child detail only in debug mode", async () => {
  const tempRoot = await mkdtemp(resolve(tmpdir(), "beautidraw-spike-debug-"));
  const loader = resolve(tempRoot, "probe-failure-loader.mjs");
  const probeDir = pathToFileURL(resolve(root, "scripts/spike")).href;
  await writeFile(loader, `const probeDir = ${JSON.stringify(`${probeDir}/probe-`)};
const success = encodeURIComponent('console.error("synthetic probe success");');
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(probeDir)) {
    if (specifier === ${JSON.stringify(`${probeDir}/probe-01-api.mjs`)}) {
      throw new Error("synthetic probe import failure");
    }
    return { url: \`data:text/javascript,\${success}\`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
`);
  const env = {
    ...process.env,
    NODE_NO_WARNINGS: "1",
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --experimental-loader=${loader}`.trim(),
  };
  const run = (args) => spawnSync(process.execPath, [resolve(root, "scripts/spike/run-all.mjs"), ...args], {
    cwd: root,
    env,
    encoding: "utf8",
  });

  const normal = run([]);
  const normalOutput = `${normal.stdout}${normal.stderr}`;
  assert.notEqual(normal.status, 0, normalOutput);
  assert.match(normalOutput, /stage: probe/);
  assert.match(normalOutput, /probe-01-api\.mjs/);
  assert.match(normalOutput, /synthetic probe import failure/);
  assert.match(normalOutput, /synthetic probe success/);
  assert.match(normalOutput, /=== spike summary ===/);
  assert.doesNotMatch(normalOutput, /\bat .*\.mjs:/);
  assert.ok(normalOutput.length < 10000, `normal diagnostics were unbounded: ${normalOutput.length}`);

  const debug = run(["--debug"]);
  const debugOutput = `${debug.stdout}${debug.stderr}`;
  assert.notEqual(debug.status, 0, debugOutput);
  assert.match(debugOutput, /synthetic probe import failure/);
  assert.match(debugOutput, /\bat .*probe-failure-loader\.mjs:/);
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

test("no tracked source references legacy embed path or blackboard manifest", async () => {
  const gitLs = spawnSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });
  assert.equal(gitLs.status, 0);
  const files = gitLs.stdout.trim().split("\n").filter((file) => {
    const isDoc = file.startsWith("docs/superpowers/");
    const isSelf = file === "test/entrypoints.test.mjs";
    const isTokenFlowTest = file === "test/llm-token-flow.test.mjs";
    const isRagTest = file === "test/rag-vector-graph.test.mjs";
    const isBlackboard = file.startsWith("decks/command-blackboard-library/");
    const isQa = file.startsWith("scripts/qa/");
    return (!isDoc && !isSelf && !isTokenFlowTest && !isRagTest && !isBlackboard && !isQa);
  });
  const legacyPattern = /embed-frame-backgrounds|scene-with-backgrounds|blackboard-asset-manifest/;
  const offending = [];
  for (const file of files) {
    if (file.endsWith(".png") || file.endsWith(".lock") || file.endsWith(".excalidraw")) continue;
    const content = await readFile(resolve(root, file), "utf8");
    if (legacyPattern.test(content)) {
      offending.push(file);
    }
  }
  assert.deepEqual(offending, []);
});

test("no source manifest contains an absolute /Users/ path", async () => {
  const gitLs = spawnSync("git", ["ls-files", "decks/*-manifest.json", "decks/**/*-manifest.json"], { cwd: root, encoding: "utf8" });
  assert.equal(gitLs.status, 0);
  const files = gitLs.stdout.trim().split("\n").filter(Boolean);
  assert.ok(files.length >= 2, `expected at least 2 manifests, found ${files.length}`);
  for (const file of files) {
    const content = await readFile(resolve(root, file), "utf8");
    assert.doesNotMatch(content, /\/Users\//);
  }
});

test("README offline probe count matches the spike runner", async () => {
  const { readdir } = await import("node:fs/promises");
  const readme = await readFile(resolve(root, "README.md"), "utf8");
  const spikeDir = resolve(root, "scripts/spike");
  const probeFiles = (await readdir(spikeDir)).filter((f) => /^probe-\d+-.*\.mjs$/.test(f) && !f.includes("viewer-parity"));
  const match = readme.match(/#\s*(\d+)\s+offline probes/);
  assert.ok(match, "README must mention offline probe count");
  assert.equal(Number(match[1]), probeFiles.length, `README states ${match[1]} probes but spike runner has ${probeFiles.length}`);
});
