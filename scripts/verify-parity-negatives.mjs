import { spawnSync } from "node:child_process";
import { readFile, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CliError, runCli } from "./cli.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REPORT_PATH = resolve(root, ".scratch/spike-artifacts/probe-06-parity.json");

export const EXPECTED_NEGATIVE_CONTROLS = {
  BD_NEG_SCENE: { mismatchField: "width" },
  BD_NEG_FP: { failure: /font metric drift/ },
  BD_NEG_FIELD: { mismatchField: "textAlign" },
  BD_NEG_NULLFIELD: { mismatchField: "fontFamily" },
  BD_NEG_FPKEY: { failure: /fingerprint key set wrong|fingerprint entry was missing/ },
  BD_NEG_DUP: { failure: /duplicate/i },
  BD_NEG_BOUND: { mismatchField: "boundElements" },
};

export function checkHookDelta(hookName, criteria, hookReport, baselineReport) {
  if (criteria.mismatchField) {
    const field = criteria.mismatchField;
    const hookMismatches = [
      ...(hookReport.writtenSceneParity ?? []),
      ...(hookReport.orderingParity?.mismatches ?? []),
    ];
    const baselineMismatches = [
      ...(baselineReport.writtenSceneParity ?? []),
      ...(baselineReport.orderingParity?.mismatches ?? []),
    ];

    const hasInHook = hookMismatches.some((m) => m.field === field);
    const hasInBaseline = baselineMismatches.some((m) => m.field === field);

    if (!hasInHook) {
      throw new Error(`hook ${hookName} failed to produce expected mismatch on field "${field}"`);
    }
    if (hasInBaseline) {
      throw new Error(`hook ${hookName} field mismatch "${field}" was already present in baseline report`);
    }
    return { type: "mismatchField", field };
  }

  if (criteria.failure) {
    const pattern = criteria.failure;
    const hookFailures = hookReport.failures ?? [];
    const baselineFailures = baselineReport.failures ?? [];

    const matchingHookFailure = hookFailures.find((f) => pattern.test(f));
    if (!matchingHookFailure) {
      throw new Error(`hook ${hookName} failed to produce expected failure matching ${pattern}`);
    }
    const matchingBaselineFailure = baselineFailures.find((f) => pattern.test(f));
    if (matchingBaselineFailure) {
      throw new Error(`hook ${hookName} failure "${matchingHookFailure}" was already present in baseline report`);
    }
    return { type: "failure", failure: matchingHookFailure };
  }

  throw new Error(`unknown criteria for hook ${hookName}`);
}

export async function verifyParityNegativeControls({
  runProbe = async (env) => {
    const res = spawnSync(process.execPath, [resolve(root, "scripts/spike/probe-06-viewer-parity.mjs")], {
      cwd: root,
      env: { ...process.env, ...env },
      encoding: "utf8",
      timeout: 180_000,
    });
    return { status: res.status, stdout: res.stdout, stderr: res.stderr };
  },
  readReport = async () => {
    const text = await readFile(DEFAULT_REPORT_PATH, "utf8");
    return JSON.parse(text);
  },
} = {}) {
  // 1. Run baseline probe
  await runProbe({});
  const baselineReport = await readReport();

  // Validate baseline: it may be green or contain ONLY viewer build drift
  const baselineFailures = baselineReport.failures ?? [];
  const nonDriftFailures = baselineFailures.filter((f) => !f.includes("viewer build drifted"));
  if (nonDriftFailures.length > 0) {
    throw new CliError({
      command: "verify-parity-negatives",
      stage: "baseline",
      reason: `baseline parity has behavioral failures: ${nonDriftFailures.join("; ")}`,
      recovery: "Fix local viewer parity before running negative controls.",
    });
  }

  const results = {};
  for (const [hookName, criteria] of Object.entries(EXPECTED_NEGATIVE_CONTROLS)) {
    await runProbe({ [hookName]: "1" });
    const hookReport = await readReport();
    const delta = checkHookDelta(hookName, criteria, hookReport, baselineReport);
    results[hookName] = { passed: true, delta };
  }

  return {
    verified: true,
    baseline: baselineReport,
    hooks: results,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const usage = "usage: node scripts/verify-parity-negatives.mjs";
  await runCli("verify-parity-negatives", async () => {
    console.log("Verifying live parity negative controls (7 hooks)...");
    const result = await verifyParityNegativeControls();
    console.log("All 7 negative controls verified successfully:");
    for (const [hook, res] of Object.entries(result.hooks)) {
      console.log(`  PASS ${hook}: ${JSON.stringify(res.delta)}`);
    }
  }, { argv: process.argv.slice(2), usage });
}
