import test from "node:test";
import assert from "node:assert/strict";
import {
  checkHookDelta,
  verifyParityNegativeControls,
  EXPECTED_NEGATIVE_CONTROLS,
} from "../scripts/verify-parity-negatives.mjs";

test("checkHookDelta detects mismatchField deltas and rejects duplicates or absences", () => {
  const baseline = { writtenSceneParity: [], failures: [] };
  const hookSuccess = {
    writtenSceneParity: [{ id: "cont1", field: "width" }],
    failures: ["viewer altered the scene we wrote"],
  };

  const delta = checkHookDelta("BD_NEG_SCENE", { mismatchField: "width" }, hookSuccess, baseline);
  assert.equal(delta.type, "mismatchField");
  assert.equal(delta.field, "width");

  // Fails when missing in hook
  assert.throws(
    () => checkHookDelta("BD_NEG_SCENE", { mismatchField: "width" }, { writtenSceneParity: [] }, baseline),
    /failed to produce expected mismatch on field "width"/,
  );

  // Fails when already present in baseline
  assert.throws(
    () => checkHookDelta("BD_NEG_SCENE", { mismatchField: "width" }, hookSuccess, hookSuccess),
    /already present in baseline report/,
  );
});

test("checkHookDelta detects failure deltas and rejects duplicates or absences", () => {
  const baseline = { writtenSceneParity: [], failures: [] };
  const hookSuccess = {
    writtenSceneParity: [],
    failures: ["font metric drift: max |delta| 0.00001px > 0px"],
  };

  const delta = checkHookDelta("BD_NEG_FP", { failure: /font metric drift/ }, hookSuccess, baseline);
  assert.equal(delta.type, "failure");
  assert.match(delta.failure, /font metric drift/);

  // Fails when missing in hook
  assert.throws(
    () => checkHookDelta("BD_NEG_FP", { failure: /font metric drift/ }, { failures: [] }, baseline),
    /failed to produce expected failure/,
  );

  // Fails when already present in baseline
  assert.throws(
    () => checkHookDelta("BD_NEG_FP", { failure: /font metric drift/ }, hookSuccess, hookSuccess),
    /already present in baseline report/,
  );
});

test("verifyParityNegativeControls accepts drift-only baseline and verifies all 7 hooks", async () => {
  let currentHook = null;
  const driftBaseline = {
    passed: false,
    failures: ["viewer build drifted: pinned 2026-08-04T14:31:37Z-ab0255f, live 2026-08-30T10:00:00Z-1234567"],
    writtenSceneParity: [],
    orderingParity: { mismatches: [] },
  };

  const mockReports = {
    BD_NEG_SCENE: {
      ...driftBaseline,
      writtenSceneParity: [{ id: "cont1", field: "width" }],
    },
    BD_NEG_FP: {
      ...driftBaseline,
      failures: [...driftBaseline.failures, "font metric drift: max |delta| 0.00001px > 0px"],
    },
    BD_NEG_FIELD: {
      ...driftBaseline,
      writtenSceneParity: [{ id: "txt1", field: "textAlign" }],
    },
    BD_NEG_NULLFIELD: {
      ...driftBaseline,
      writtenSceneParity: [{ id: "txt1", field: "fontFamily" }],
    },
    BD_NEG_FPKEY: {
      ...driftBaseline,
      failures: [...driftBaseline.failures, "fingerprint key set wrong: Excalifont@18"],
    },
    BD_NEG_DUP: {
      ...driftBaseline,
      failures: [...driftBaseline.failures, "duplicate id cont1 in scene"],
    },
    BD_NEG_BOUND: {
      ...driftBaseline,
      writtenSceneParity: [{ id: "cont1", field: "boundElements" }],
    },
  };

  const result = await verifyParityNegativeControls({
    runProbe: async (env) => {
      const keys = Object.keys(env);
      currentHook = keys.length ? keys[0] : null;
      return { status: currentHook ? 1 : 0 };
    },
    readReport: async () => {
      if (!currentHook) return driftBaseline;
      return mockReports[currentHook];
    },
  });

  assert.equal(result.verified, true);
  assert.equal(Object.keys(result.hooks).length, 7);
  for (const hookName of Object.keys(EXPECTED_NEGATIVE_CONTROLS)) {
    assert.equal(result.hooks[hookName].passed, true);
  }
});

test("verifyParityNegativeControls rejects behavioral failure in baseline", async () => {
  const brokenBaseline = {
    passed: false,
    failures: ["font metric drift: max |delta| 2px > 0px"],
    writtenSceneParity: [],
  };

  await assert.rejects(
    async () => {
      await verifyParityNegativeControls({
        runProbe: async () => ({ status: 1 }),
        readReport: async () => brokenBaseline,
      });
    },
    /baseline parity has behavioral failures/,
  );
});
