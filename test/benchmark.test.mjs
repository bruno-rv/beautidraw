import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { parseTimeOutput, median, normalizeArgv, runBenchmark } from "../scripts/benchmark.mjs";

const root = resolve(import.meta.dirname, "..");
const validSpec = resolve(root, "test/fixtures/benchmark-valid-deck.json");

test("parseTimeOutput parses macOS /usr/bin/time -l maximum resident set size", () => {
  const sampleStderr = `
        0.05 real         0.02 user         0.01 sys
            96038912  maximum resident set size
                   0  average shared memory size
                3352  page reclaims
  `;
  const parsed = parseTimeOutput(sampleStderr);
  assert.equal(parsed.maxRssBytes, 96038912);

  assert.equal(parseTimeOutput("").maxRssBytes, null);
  assert.equal(parseTimeOutput("no rss here").maxRssBytes, null);
  assert.equal(parseTimeOutput(null).maxRssBytes, null);
});

test("median calculates accurate midpoint for odd and even samples", () => {
  assert.equal(median([10, 20, 30]), 20);
  assert.equal(median([30, 10, 20]), 20);
  assert.equal(median([10, 20, 30, 40]), 25);
  assert.equal(median([5]), 5);
  assert.equal(median([]), 0);
});

test("normalizeArgv folds space-separated option values into equals form", () => {
  const raw = ["decks/spec.json", "--samples", "3", "--warmups", "1", "--output", "out.json", "--debug"];
  const normalized = normalizeArgv(raw);
  assert.deepEqual(normalized, [
    "decks/spec.json",
    "--samples=3",
    "--warmups=1",
    "--output=out.json",
    "--debug",
  ]);
});

test("runBenchmark with injected executeStage records all six stage arrays, per-stage RSS, commands, and artifacts", async () => {
  const createdDirs = [];
  const customFactory = async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "bench-test-empty-"));
    createdDirs.push(dir);
    return dir;
  };

  const stageTimes = {
    setup: 120,
    audit: 25,
    generation: 500,
    composition: 1200,
    fullBuild: 2100,
    offline: 7000,
  };

  const executedStages = [];

  const mockExecuteStage = async ({ name, command, args, cwd, workDir, outDir }) => {
    executedStages.push(name);
    // If this stage writes artifacts, create a dummy file to verify byte measurement
    if (outDir) {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(outDir, { recursive: true });
      await writeFile(resolve(outDir, "dummy.txt"), "hello artifact bytes");
    }
    const sampleStderr = `
        0.05 real         0.02 user         0.01 sys
            ${50_000_000 + (stageTimes[name] || 1000)}  maximum resident set size
    `;
    return {
      status: 0,
      stdout: "",
      stderr: sampleStderr,
      elapsedMs: stageTimes[name] || 100,
    };
  };

  const report = await runBenchmark({
    specPath: "test/fixtures/benchmark-valid-deck.json",
    samples: 3,
    warmups: 1,
    tempDirFactory: customFactory,
    executeStage: mockExecuteStage,
  });

  // Verify schema version and counts
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.warmups, 1);
  assert.equal(report.sampleCount, 3);
  assert.equal(report.machine.node, process.version);
  assert.ok(report.machine.memoryBytes > 0);

  // Verify all six stage arrays in samples
  const sampleKeys = ["setupMs", "auditMs", "generationMs", "compositionMs", "fullBuildMs", "offlineMs"];
  for (const key of sampleKeys) {
    assert.equal(report.samples[key].length, 3, `${key} must contain 3 samples`);
  }

  // Verify artifact byte samples
  assert.equal(report.samples.generationArtifactBytes.length, 3);
  assert.equal(report.samples.compositionArtifactBytes.length, 3);
  assert.equal(report.samples.fullBuildArtifactBytes.length, 3);
  assert.ok(report.summary.artifactBytes.fullBuild > 0);

  // Verify per-stage RSS
  const stageNames = ["setup", "audit", "generation", "composition", "fullBuild", "offline"];
  for (const name of stageNames) {
    assert.equal(report.samples.perStageMaxRssBytes[name].length, 3);
    assert.ok(report.stages[name].command, `stage ${name} must record its command`);
    assert.equal(report.stages[name].samplesMs.length, 3);
  }

  // Verify summary statistics
  assert.equal(report.summary.fullBuildMs.statistic, "median");
  assert.equal(report.summary.fullBuildMs.value, 2100);
  assert.equal(report.guardrails.allPassed, true);

  // Verify unique empty directories were created and cleaned up
  assert.equal(createdDirs.length, 4); // 1 warmup + 3 samples
  for (const dir of createdDirs) {
    let exists = true;
    try {
      await stat(dir);
    } catch {
      exists = false;
    }
    assert.equal(exists, false, `temporary directory ${dir} must be cleaned up`);
  }
});

test("runBenchmark guardrails flag budget breaches", async () => {
  const mockSlowExecute = async ({ name }) => {
    return {
      status: 0,
      stdout: "",
      stderr: "  990000000  maximum resident set size\n", // > 850 MB RSS
      elapsedMs: name === "fullBuild" ? 4500 : 100, // fullBuild > 3.5s
    };
  };

  const report = await runBenchmark({
    specPath: "test/fixtures/benchmark-valid-deck.json",
    samples: 1,
    warmups: 0,
    executeStage: mockSlowExecute,
  });

  assert.equal(report.guardrails.fullBuildPassed, false);
  assert.equal(report.guardrails.allPassed, false);
});
