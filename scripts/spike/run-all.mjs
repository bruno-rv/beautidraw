// Runs the whole spike end to end. Every spike finding is reproducible from here.
//
//   node scripts/spike/run-all.mjs           # local probes only
//   node scripts/spike/run-all.mjs --network # adds the excalidraw.com parity probe

import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CliError, formatDiagnostic, runCli } from "../cli.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const usage = "usage: node scripts/spike/run-all.mjs [--network]\n       runs the local probes, optionally including the network parity probe.";
const status = await runCli("spike", async ({ values, debug }) => {
const withNetwork = values.network === true;

const probes = (await readdir(here))
  .filter((f) => /^probe-\d+-.*\.mjs$/.test(f))
  .sort()
  .filter((f) => withNetwork || !f.includes("viewer-parity"));
if (!withNetwork && !probes.includes("probe-10-editor-fidelity.mjs")) {
  throw new CliError({
    command: "spike",
    stage: "probe",
    input: "probe-10-editor-fidelity.mjs",
    reason: "offline probe list is missing the editor-fidelity probe",
    recovery: "Restore scripts/spike/probe-10-editor-fidelity.mjs and rerun the offline spike.",
  });
}

const run = (file) =>
  new Promise((done) => {
    const started = process.hrtime.bigint();
    const child = spawn(process.execPath, [resolve(here, file), ...(debug ? ["--debug"] : [])], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const finish = (result) => {
      done({
        file,
        stdout,
        stderr,
        ms: Number((process.hrtime.bigint() - started) / 1_000_000n),
        ...result,
      });
    };
    child.once("error", (error) => finish({ code: null, error }));
    child.once("close", (code, signal) => finish({ code, signal }));
  });

const summarizeChildOutput = (output) =>
  String(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) =>
      line &&
      !line.startsWith("at ") &&
      !line.startsWith("node:") &&
      !line.startsWith("Node.js") &&
      !line.startsWith("(node:") &&
      !line.startsWith("triggerUncaughtException") &&
      line !== "^" &&
      !/^\(Use .*node/.test(line) &&
      !line.startsWith("--import ") &&
      !line.startsWith("file:///"),
    );

const reportProbeFailure = (result) => {
  const output = [result.stderr, result.stdout].filter(Boolean).join("\n");
  const statusText = result.error
    ? `could not start: ${result.error.message}`
    : result.signal
      ? `terminated by ${result.signal}`
      : `exited with status ${result.code ?? 1}`;
  const diagnostic = new CliError({
    command: "spike",
    stage: "probe",
    input: result.file,
    reason: summarizeChildOutput(output) ?? `probe ${statusText}`,
    recovery: "Fix the probe failure and rerun with --debug for raw child detail.",
  });
  if (debug && output) diagnostic.stack = output;
  process.stderr.write(`${formatDiagnostic(diagnostic, { debug })}\n`);
};

const results = [];
for (const p of probes) {
  process.stderr.write(`\n── ${p}\n`);
  const result = await run(p);
  if (result.code === 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  } else {
    reportProbeFailure(result);
  }
  results.push(result);
}

console.log("\n=== spike summary ===");
for (const r of results) {
  console.log(`${r.code === 0 ? "PASS" : "FAIL"}  ${r.file}  ${r.ms}ms`);
}
if (!withNetwork) {
  console.log("\nviewer-parity skipped — rerun with --network to include it.");
}
return results.some((r) => r.code !== 0) ? 1 : 0;
}, { argv: process.argv.slice(2), usage, options: ["--network"] });

process.exitCode = status;
