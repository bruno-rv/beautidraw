import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { parseTimeOutput, median, runBenchmark } from "../scripts/benchmark.mjs";

const root = resolve(import.meta.dirname, "..");
const minimalSpec = resolve(root, "test/fixtures/benchmark-valid-deck.json");

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

test("runBenchmark lifecycle cleans up temporary work directories even on failure", async () => {
  const createdDirs = [];
  const customFactory = async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "bench-test-dir-"));
    createdDirs.push(dir);
    return dir;
  };

  await assert.rejects(
    async () => {
      await runBenchmark({
        specPath: "test/fixtures/non-existent-spec.json",
        samples: 1,
        warmups: 0,
        tempDirFactory: customFactory,
      });
    },
    /cannot read deck spec/,
  );

  // For successful minimal run
  const report = await runBenchmark({
    specPath: "test/fixtures/benchmark-valid-deck.json",
    samples: 1,
    warmups: 0,
    tempDirFactory: customFactory,
  });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.machine.node, process.version);
  assert.ok(report.machine.memoryBytes > 0);
  assert.equal(report.samples.fullBuildMs.length, 1);
  assert.equal(report.summary.fullBuildMs.statistic, "median");
  assert.ok(report.summary.maxRssBytes.maximum > 0);

  // Verify all created directories were removed in finally
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
