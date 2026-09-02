import { spawnSync } from "node:child_process";
import { cpus, totalmem } from "node:os";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CliError, parseCli, runCli } from "./cli.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseTimeOutput(stderrText) {
  if (typeof stderrText !== "string") return { maxRssBytes: null };
  const match = stderrText.match(/\s*(\d+)\s+maximum resident set size/);
  if (!match) return { maxRssBytes: null };
  const bytes = Number(match[1]);
  return { maxRssBytes: Number.isFinite(bytes) ? bytes : null };
}

export function median(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function measureDirectoryBytes(dir) {
  let total = 0;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        total += await measureDirectoryBytes(full);
      } else if (entry.isFile()) {
        const s = await stat(full);
        total += s.size;
      }
    }
  } catch {
    // missing or unreadable directory
  }
  return total;
}

export async function defaultExecuteStage({ name, command, args, cwd }) {
  const t0 = performance.now();
  const res = spawnSync("/usr/bin/time", ["-l", command, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
  });
  const elapsedMs = performance.now() - t0;
  return {
    status: res.status,
    stdout: res.stdout,
    stderr: res.stderr,
    elapsedMs,
  };
}

export async function runBenchmark({
  specPath,
  samples = 3,
  warmups = 1,
  outputPath = null,
  tempDirFactory = () => mkdtemp(join(tmpdir(), "beautidraw-bench-")),
  executeStage = defaultExecuteStage,
} = {}) {
  if (process.platform !== "darwin") {
    throw new CliError({
      command: "benchmark",
      stage: "platform",
      reason: `benchmark measurement requires macOS /usr/bin/time -l; unsupported platform: ${process.platform}`,
      recovery: "Run benchmarks on macOS Darwin reference host.",
    });
  }

  const resolvedSpec = resolve(root, specPath);
  let spec;
  try {
    spec = JSON.parse(await readFile(resolvedSpec, "utf8"));
  } catch (err) {
    throw new CliError({
      command: "benchmark",
      stage: "input",
      input: specPath,
      reason: `cannot read deck spec: ${err.message}`,
      recovery: "Provide a valid readable JSON deck spec.",
    });
  }

  const bands = Array.isArray(spec.bands) ? spec.bands : [];
  const canvasBandCount = bands.filter((b) => b.pattern === "canvas").length;
  const totalBandCount = bands.length;

  let pnpmVersion = "unknown";
  try {
    const pnpmRes = spawnSync("pnpm", ["--version"], { encoding: "utf8" });
    if (pnpmRes.status === 0) pnpmVersion = pnpmRes.stdout.trim();
  } catch {}

  const machine = {
    os: process.platform,
    cpu: cpus()[0]?.model ?? "unknown",
    memoryBytes: totalmem(),
    node: process.version,
    pnpm: pnpmVersion,
    excalidraw: "0.18.1",
  };

  const stageDefs = [
    {
      name: "setup",
      command: "node scripts/setup.mjs",
      resolveArgs: () => [resolve(root, "scripts/setup.mjs")],
      getOutDir: null,
    },
    {
      name: "audit",
      command: `node scripts/audit-deck-spec.mjs ${specPath}`,
      resolveArgs: () => [resolve(root, "scripts/audit-deck-spec.mjs"), resolvedSpec],
      getOutDir: null,
    },
    {
      name: "generation",
      command: `node scripts/generate.mjs ${specPath} <sample>/generate`,
      resolveArgs: (genOut) => [resolve(root, "scripts/generate.mjs"), resolvedSpec, genOut],
      getOutDir: (workDir) => join(workDir, "generate"),
    },
    {
      name: "composition",
      command: `node scripts/auto-compose.mjs ${specPath} <sample>/generate`,
      resolveArgs: (genOut) => [resolve(root, "scripts/auto-compose.mjs"), resolvedSpec, genOut],
      getOutDir: (workDir) => join(workDir, "generate"),
    },
    {
      name: "fullBuild",
      command: `node scripts/build-deck.mjs ${specPath} <sample>/build`,
      resolveArgs: (buildOut) => [resolve(root, "scripts/build-deck.mjs"), resolvedSpec, buildOut],
      getOutDir: (workDir) => join(workDir, "build"),
    },
    {
      name: "offline",
      command: "node scripts/spike/run-all.mjs",
      resolveArgs: () => [resolve(root, "scripts/spike/run-all.mjs")],
      getOutDir: null,
    },
  ];

  const stageResults = {};
  for (const st of stageDefs) {
    stageResults[st.name] = {
      command: st.command,
      samplesMs: [],
      maxRssBytes: [],
      artifactBytes: st.getOutDir ? [] : undefined,
    };
  }

  const totalRuns = warmups + samples;

  for (let runIndex = 0; runIndex < totalRuns; runIndex += 1) {
    const isWarmup = runIndex < warmups;
    const workDir = await tempDirFactory();
    
    // Assert workDir is initially empty
    const initialEntries = await readdir(workDir);
    if (initialEntries.length > 0) {
      throw new Error(`workDir ${workDir} is not initially empty (found ${initialEntries.length} items)`);
    }

    try {
      const genOut = join(workDir, "generate");
      const buildOut = join(workDir, "build");

      for (const st of stageDefs) {
        const outDir = st.getOutDir ? st.getOutDir(workDir) : null;
        const args = st.name === "generation" || st.name === "composition" ? st.resolveArgs(genOut) :
                     st.name === "fullBuild" ? st.resolveArgs(buildOut) :
                     st.resolveArgs();

        const res = await executeStage({
          name: st.name,
          command: process.execPath,
          args,
          cwd: root,
          workDir,
          outDir,
        });

        if (res.status !== 0) {
          throw new CliError({
            command: "benchmark",
            stage: st.name,
            reason: `stage ${st.name} failed with status ${res.status}: ${res.stderr || res.stdout}`,
            recovery: "Fix the failing stage and rerun benchmark.",
          });
        }

        const { maxRssBytes } = parseTimeOutput(res.stderr);
        const elapsed = typeof res.elapsedMs === "number" ? res.elapsedMs : 0;

        if (!isWarmup) {
          stageResults[st.name].samplesMs.push(Math.round(elapsed * 100) / 100);
          stageResults[st.name].maxRssBytes.push(maxRssBytes ?? 0);
          if (outDir) {
            const bytes = await measureDirectoryBytes(outDir);
            stageResults[st.name].artifactBytes.push(bytes);
          }
        }
      }
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  const allMaxRss = Object.values(stageResults).flatMap((s) => s.maxRssBytes);
  const maxRssBytesTotal = allMaxRss.length ? Math.max(...allMaxRss) : 0;

  const summary = {
    setupMs: { statistic: "median", value: median(stageResults.setup.samplesMs) },
    auditMs: { statistic: "median", value: median(stageResults.audit.samplesMs) },
    generationMs: { statistic: "median", value: median(stageResults.generation.samplesMs) },
    compositionMs: { statistic: "median", value: median(stageResults.composition.samplesMs) },
    fullBuildMs: { statistic: "median", value: median(stageResults.fullBuild.samplesMs) },
    offlineMs: { statistic: "median", value: median(stageResults.offline.samplesMs) },
    maxRssBytes: { maximum: maxRssBytesTotal },
    artifactBytes: {
      generation: median(stageResults.generation.artifactBytes),
      composition: median(stageResults.composition.artifactBytes),
      fullBuild: median(stageResults.fullBuild.artifactBytes),
    },
  };

  const guardrails = {
    setupPassed: summary.setupMs.value <= 250,
    auditPassed: summary.auditMs.value <= 50,
    generationPassed: summary.generationMs.value <= 1000 && Math.max(...stageResults.generation.maxRssBytes) <= 600 * 1024 * 1024,
    compositionPassed: canvasBandCount > 13 || (summary.compositionMs.value <= 2200 && Math.max(...stageResults.composition.maxRssBytes) <= 850 * 1024 * 1024),
    fullBuildPassed: summary.fullBuildMs.value <= 3500 && Math.max(...stageResults.fullBuild.maxRssBytes) <= 850 * 1024 * 1024,
    offlinePassed: summary.offlineMs.value <= 9000,
    artifactsPassed: summary.artifactBytes.fullBuild < 40_000_000,
  };
  guardrails.allPassed = Object.values(guardrails).every(Boolean);

  const stages = {};
  for (const [stName, stData] of Object.entries(stageResults)) {
    stages[stName] = {
      command: stData.command,
      samplesMs: stData.samplesMs,
      medianMs: median(stData.samplesMs),
      maxRssBytes: stData.maxRssBytes,
      maxRssBytesMaximum: stData.maxRssBytes.length ? Math.max(...stData.maxRssBytes) : 0,
      ...(stData.artifactBytes ? {
        artifactBytes: stData.artifactBytes,
        medianArtifactBytes: median(stData.artifactBytes),
      } : {}),
    };
  }

  const report = {
    schemaVersion: 1,
    machine,
    spec: {
      path: resolvedSpec,
      canvasBandCount,
      totalBandCount,
    },
    warmups,
    sampleCount: samples,
    stages,
    samples: {
      setupMs: stageResults.setup.samplesMs,
      auditMs: stageResults.audit.samplesMs,
      generationMs: stageResults.generation.samplesMs,
      compositionMs: stageResults.composition.samplesMs,
      fullBuildMs: stageResults.fullBuild.samplesMs,
      offlineMs: stageResults.offline.samplesMs,
      generationArtifactBytes: stageResults.generation.artifactBytes,
      compositionArtifactBytes: stageResults.composition.artifactBytes,
      fullBuildArtifactBytes: stageResults.fullBuild.artifactBytes,
      perStageMaxRssBytes: {
        setup: stageResults.setup.maxRssBytes,
        audit: stageResults.audit.maxRssBytes,
        generation: stageResults.generation.maxRssBytes,
        composition: stageResults.composition.maxRssBytes,
        fullBuild: stageResults.fullBuild.maxRssBytes,
        offline: stageResults.offline.maxRssBytes,
      },
      maxRssBytes: stageResults.fullBuild.maxRssBytes,
    },
    summary,
    guardrails,
  };

  if (outputPath) {
    const resolvedOut = resolve(root, outputPath);
    await mkdir(dirname(resolvedOut), { recursive: true });
    await writeFile(resolvedOut, JSON.stringify(report, null, 2) + "\n");
  }

  return report;
}

export function normalizeArgv(rawArgs) {
  const normalized = [];
  const optionsWithValues = new Set(["--samples", "--warmups", "--output"]);
  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = rawArgs[i];
    if (optionsWithValues.has(arg) && i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith("-")) {
      normalized.push(`${arg}=${rawArgs[i + 1]}`);
      i += 1;
    } else {
      normalized.push(arg);
    }
  }
  return normalized;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const usage = "usage: node scripts/benchmark.mjs <spec.json> [--samples=3] [--warmups=1] [--output=<path>]";
  const normalizedArgv = normalizeArgv(process.argv.slice(2));
  await runCli("benchmark", async ({ values }) => {
    const specArg = values.specArg;
    if (!specArg) {
      throw new CliError({
        command: "benchmark",
        stage: "arguments",
        reason: "missing required <spec.json> positional argument",
        recovery: usage,
      });
    }
    const samples = values.samples !== undefined ? Number(values.samples) : 3;
    const warmups = values.warmups !== undefined ? Number(values.warmups) : 1;
    const output = values.output;
    const report = await runBenchmark({
      specPath: specArg,
      samples,
      warmups,
      outputPath: output,
    });
    console.log(JSON.stringify(report, null, 2));
    if (!report.guardrails.allPassed) {
      process.exitCode = 1;
    }
  }, {
    argv: normalizedArgv,
    usage,
    positional: ["specArg"],
    options: ["--samples", "--warmups", "--output", "--debug"],
  });
}
