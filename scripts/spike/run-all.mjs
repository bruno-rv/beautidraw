// Runs the whole spike end to end. Every claim in
// .scratch/beautidraw/research/11-spike-findings.md is reproducible from here.
//
//   node scripts/spike/run-all.mjs           # local probes only
//   node scripts/spike/run-all.mjs --network # adds the excalidraw.com parity probe

import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const withNetwork = process.argv.includes("--network");

const probes = (await readdir(here))
  .filter((f) => /^probe-\d+-.*\.mjs$/.test(f))
  .sort()
  .filter((f) => withNetwork || !f.includes("viewer-parity"));

const run = (file) =>
  new Promise((done) => {
    const started = process.hrtime.bigint();
    const child = spawn(process.execPath, [resolve(here, file)], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    child.on("exit", (code) =>
      done({
        file,
        code,
        ms: Number((process.hrtime.bigint() - started) / 1_000_000n),
      }),
    );
  });

const results = [];
for (const p of probes) {
  process.stderr.write(`\n── ${p}\n`);
  results.push(await run(p));
}

console.log("\n=== spike summary ===");
for (const r of results) {
  console.log(`${r.code === 0 ? "PASS" : "FAIL"}  ${r.file}  ${r.ms}ms`);
}
if (!withNetwork) {
  console.log("\nviewer-parity skipped — rerun with --network to include it.");
}
process.exit(results.some((r) => r.code !== 0) ? 1 : 0);
