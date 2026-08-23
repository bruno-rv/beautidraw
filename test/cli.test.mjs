import test from "node:test";
import assert from "node:assert/strict";

import { CliError, formatDiagnostic, parseCli, runCli } from "../scripts/cli.mjs";

test("help succeeds without positional arguments", () => {
  assert.deepEqual(parseCli(["--help"], { command: "build-deck", positional: ["spec", "out"] }), {
    help: true,
    debug: false,
    values: {},
  });
});

test("normal diagnostics omit stacks and name recovery", () => {
  const message = formatDiagnostic(new CliError({
    command: "build-deck",
    stage: "preflight",
    input: "/tmp/missing.json",
    reason: "file does not exist",
    recovery: "Pass an existing deck-spec.json path.",
    cause: new Error("ENOENT internal stack"),
  }));
  assert.match(message, /stage: preflight/);
  assert.match(message, /recovery: Pass an existing/);
  assert.doesNotMatch(message, /at .*\.mjs:/);
});

test("runCli returns status and writes help to stdout", async () => {
  let stdout = "";
  let stderr = "";
  const status = await runCli("example", () => {
    throw new Error("main should not run for help");
  }, {
    argv: ["--help"],
    usage: "usage: example [options]",
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } },
  });
  assert.equal(status, 0);
  assert.equal(stdout, "usage: example [options]\n");
  assert.equal(stderr, "");
});

test("debug diagnostics may include a stack", async () => {
  let stderr = "";
  const status = await runCli("example", () => {
    throw new Error("debug failure");
  }, {
    argv: ["--debug"],
    stderr: { write: (value) => { stderr += value; } },
    stdout: { write: () => {} },
  });
  assert.equal(status, 1);
  assert.match(stderr, /stack:/);
  assert.match(stderr, /at .*\.mjs:/);
});
