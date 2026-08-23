import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

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

test("invalid deck input fails before browser work without a raw stack", () => {
  for (const script of ["scripts/audit-deck-spec.mjs", "scripts/generate.mjs", "scripts/auto-compose.mjs", "scripts/build-deck.mjs"]) {
    const args = script.endsWith("generate.mjs") || script.endsWith("auto-compose.mjs") || script.endsWith("build-deck.mjs")
      ? ["/tmp/beautidraw-missing.json", "/tmp/beautidraw-out"]
      : ["/tmp/beautidraw-missing.json"];
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
