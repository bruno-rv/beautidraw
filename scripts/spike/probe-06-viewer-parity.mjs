// Probe 6 — viewer parity against the real excalidraw.com (PLAN.md §11).
//
// Everything so far proves the pipeline agrees with itself. PLAN.md §2 is
// explicit that this is not enough: "if layout and rendering both run against an
// injected provider on the same Playwright page, they agree with each other and
// disagree with excalidraw.com". This measures the same strings in the real
// viewer and diffs them, then loads a generated scene there and reads the
// geometry back.
//
// Requires network. If excalidraw.com is unreachable the oracle stays
// `unproven`, which per §8 blocks delivery — that is the correct outcome, not a
// reason to soften the check.

import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import {
  DEVICE_SCALE_FACTOR,
  LAUNCH_ARGS,
  ROOT,
  VIEWPORT,
  withHarness,
} from "./harness-runner.mjs";

const OUT = resolve(ROOT, ".scratch/beautidraw/spike-artifacts");
await mkdir(OUT, { recursive: true });

// The viewer build parity was last verified against. A mismatch fails this probe
// rather than being noted — see the fail-closed block at the bottom.
const PINNED_VIEWER_BUILD = "2026-07-28T16:12:33Z-1acf66e";

const FAMILIES = ["Excalifont", "Nunito", "Cascadia", "Comic Shanns", "Lilita One"];
const SIZES = [18, 23, 30, 38, 48];

// Four repertoires, because the font gate exists to protect the subsets beyond
// LATIN. Measuring parity on Latin alone would claim more than the evidence.
const SAMPLES = {
  latin: "The quick brown fox jumps over the lazy dog 0123456789 —–’“”",
  latinExt: "Łódź ā ē ī ō ū ș ț ǎ ǧ ℓ † ẞ ḃ ẏ ₴ Ɇ",   // LATIN_EXT subset
  cyrillic: "Быстрая коричневая лиса 0123456789",       // CYRILLIC subset
  vietnamese: "Tiếng Việt nhanh chóng vượt qua",        // VIETNAMESE subset
};
const LONG =
  "The quick brown fox jumps over the lazy dog and keeps running well past the edge";

// The measurement both runtimes execute verbatim. Loads and checks are both
// driven by the exact characters being measured — a bare check(font) probes the
// spec default and passes vacuously.
const MEASURE_FN = `async (args) => {
  const { families, sizes, samples } = args;
  const out = { fingerprint: {}, check: {}, coversRepertoire: {} };
  for (const [label, sample] of Object.entries(samples)) {
    await Promise.all(
      families.flatMap((f) => sizes.map((s) => document.fonts.load(\`\${s}px "\${f}"\`, sample))),
    );
  }
  await document.fonts.ready;
  const ctx = document.createElement("canvas").getContext("2d");
  for (const f of families) {
    for (const [label, sample] of Object.entries(samples)) {
      out.check[\`\${f}/\${label}\`] = document.fonts.check(\`20px "\${f}"\`, sample);
      for (const s of sizes) {
        ctx.font = \`\${s}px "\${f}"\`;
        out.fingerprint[\`\${f}@\${s}/\${label}\`] = ctx.measureText(sample).width;
      }
    }
    // The bare form, recorded to demonstrate it is not a valid gate.
    out.coversRepertoire[f] = document.fonts.check(\`20px "\${f}"\`);
  }
  return out;
}`;

// ---------- side A: our vendored bundle ----------

const ours = await withHarness(async ({ page }) => {
  const metrics = await page.evaluate(
    `(${MEASURE_FN})({families: ${JSON.stringify(FAMILIES)}, sizes: ${JSON.stringify(SIZES)}, samples: ${JSON.stringify(SAMPLES)}})`,
  );
  const layout = await page.evaluate(
    ({ long }) =>
      window.__bdApi
        .convertToExcalidrawElements([
          {
            type: "rectangle",
            x: 0,
            y: 0,
            width: 300,
            height: 100,
            label: { text: long, fontSize: 20, fontFamily: 6 },
          },
        ])
        // Return the converter's elements WHOLE. Hand-assembling a fixture from
        // a few of these fields is how the probe ended up asserting a
        // lineHeight the library never produced.
        .map((el) => ({ ...el })),
    { long: LONG },
  );
  return { metrics, layout };
});

// ---------- side B: the real excalidraw.com ----------

// A scene carrying our computed geometry, in both array orderings, so the
// editor's own restore pass can be diffed against what we wrote.
// `boundElements: []`, never null — the viewer canonicalises null to [], so
// emitting [] keeps the round-trip byte-clean rather than merely semantic.
const base = (over) => ({
  angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent",
  fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 0,
  opacity: 100, groupIds: [], frameId: null, roundness: null,
  version: 1, versionNonce: 1, isDeleted: false, boundElements: [],
  updated: 1, link: null, locked: false, ...over,
});

// The fixture is the CONVERTER'S OWN OUTPUT, re-identified — not a hand-written
// approximation of it. Anything else risks asserting a metric tuple the library
// never produces (it previously wrote lineHeight 1.25 onto a Nunito element
// whose real lineHeight is 1.35, and the viewer had no reason to disagree).
const convertedText = ours.layout.find((e) => e.type === "text");
const convertedRect = ours.layout.find((e) => e.type === "rectangle");
if (!convertedText || !convertedRect) {
  throw new Error("converter did not produce the expected container + text pair");
}

const container = base({
  ...convertedRect,
  id: "cont1", seed: 11, frameId: "frm1",
  x: 100, y: 100,
  boundElements: [{ type: "text", id: "txt1" }],
});
const boundText = base({
  ...convertedText,
  id: "txt1", seed: 12, frameId: "frm1", containerId: "cont1",
  // Translate with the container so the pair stays coherent.
  x: convertedText.x + 100, y: convertedText.y + 100,
  boundElements: [],
});
const frame = base({
  id: "frm1", type: "frame", x: 60, y: 60, width: 400, height: 200,
  seed: 13, name: "01 Parity Band", strokeColor: "#bbb",
});

const orderings = {
  childBeforeFrame: [container, boundText, frame],
  frameFirst: [frame, container, boundText],
};

const browser = await chromium.launch({ args: LAUNCH_ARGS });
const viewerResults = {};
let viewerVersion = null;

try {
  for (const [name, elements] of Object.entries(orderings)) {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
    });
    await context.addInitScript(
      ([els]) => {
        localStorage.setItem("excalidraw", JSON.stringify(els));
        localStorage.setItem(
          "excalidraw-state",
          JSON.stringify({ viewBackgroundColor: "#ffffff", zoom: { value: 1 } }),
        );
      },
      [elements],
    );
    const page = await context.newPage();
    await page.goto("https://excalidraw.com/", { waitUntil: "load", timeout: 60000 });
    await page.waitForSelector("canvas", { timeout: 60000 });
    await page.waitForTimeout(4000); // let the app settle and persist

    if (!viewerVersion) {
      viewerVersion = await page.evaluate(() => ({
        version: document.querySelector('meta[name="version"]')?.content ?? null,
        buildId: window.__EXCALIDRAW_SHA__ ?? null,
        ua: navigator.userAgent,
      }));
      viewerResults.metrics = await page.evaluate(
        `(${MEASURE_FN})({families: ${JSON.stringify(FAMILIES)}, sizes: ${JSON.stringify(SIZES)}, samples: ${JSON.stringify(SAMPLES)}})`,
      );
    }

    viewerResults[name] = await page.evaluate(() => {
      const raw = localStorage.getItem("excalidraw");
      if (!raw) return { error: "no scene persisted" };
      return JSON.parse(raw).map((el) => ({
        id: el.id, type: el.type,
        x: Number(el.x), y: Number(el.y),
        width: Number(el.width), height: Number(el.height),
        angle: Number(el.angle ?? 0),
        frameId: el.frameId ?? null, containerId: el.containerId ?? null,
        boundElements: el.boundElements ?? null,
        fontSize: el.fontSize ?? null, fontFamily: el.fontFamily ?? null,
        lineHeight: el.lineHeight ?? null,
        textAlign: el.textAlign ?? null, verticalAlign: el.verticalAlign ?? null,
        autoResize: el.autoResize ?? null,
        text: el.text ?? null, originalText: el.originalText ?? null,
        isDeleted: el.isDeleted === true,
      }));
    });
    await context.close();
  }
} finally {
  await browser.close();
}

// ---------- diff ----------

// Raw comparison with an explicit tolerance. Rounding to 4dp before diffing
// would let a sub-0.0001 systematic drift read as "identical".
const TOLERANCE_PX = 0;

// The exact key set both sides must report. Iterating only `ours` let a key
// missing from BOTH measurements yield a passing 99/100 corpus.
const EXPECTED_FP_KEYS = FAMILIES.flatMap((f) =>
  SIZES.flatMap((s) => Object.keys(SAMPLES).map((r) => `${f}@${s}/${r}`)),
);
if (process.env.BD_NEG_FPKEY === "1") {
  delete ours.metrics.fingerprint[Object.keys(ours.metrics.fingerprint)[0]];
}
const fpKeyFailures = [];
for (const [side, fp] of [
  ["ours", ours.metrics.fingerprint],
  ["viewer", viewerResults.metrics?.fingerprint],
]) {
  for (const k of EXPECTED_FP_KEYS) {
    if (fp?.[k] === undefined) fpKeyFailures.push(`${side}/${k} (missing)`);
  }
  const extra = Object.keys(fp ?? {}).filter((k) => !EXPECTED_FP_KEYS.includes(k));
  for (const k of extra) fpKeyFailures.push(`${side}/${k} (unexpected)`);
}

const fpDiff = {};
for (const k of EXPECTED_FP_KEYS) {
  const a = ours.metrics.fingerprint[k];
  const b = viewerResults.metrics?.fingerprint?.[k];
  fpDiff[k] = {
    ours: a,
    viewer: b,
    deltaPx: b == null ? null : b - a,
    deltaPct: b == null ? null : ((b - a) / a) * 100,
  };
}
if (process.env.BD_NEG_FP === "1") {
  const k = Object.keys(fpDiff)[0];
  fpDiff[k].deltaPx = 0.00001;
  fpDiff[k].deltaPct = 0.000001;
}
const maxDelta = Math.max(
  ...Object.values(fpDiff).map((d) => Math.abs(d.deltaPct ?? Infinity)),
);
const maxDeltaPx = Math.max(
  ...Object.values(fpDiff).map((d) => Math.abs(d.deltaPx ?? Infinity)),
);

// A repertoire whose faces never loaded would measure "identically" on both
// sides — both wrong. The check results are evidence, so they are asserted and
// persisted, not merely observed.
// The exact key set both sides must report. A missing key is a failure, not an
// absence — filtering only over present entries would pass a truncated report.
const EXPECTED_CHECK_KEYS = FAMILIES.flatMap((f) =>
  Object.keys(SAMPLES).map((r) => `${f}/${r}`),
);
const failedChecks = [];
for (const [side, checks] of [
  ["ours", ours.metrics.check],
  ["viewer", viewerResults.metrics?.check],
]) {
  for (const k of EXPECTED_CHECK_KEYS) {
    const v = checks?.[k];
    if (v === undefined) failedChecks.push(`${side}/${k} (missing)`);
    else if (v !== true) failedChecks.push(`${side}/${k}`);
  }
}

const writtenText = boundText.text;
const readBack = (viewerResults.childBeforeFrame ?? []).find((e) => e.id === "txt1");
const readBackFF = (viewerResults.frameFirst ?? []).find((e) => e.id === "txt1");

// Full scene integrity, normalised by element id. Recording frameId/containerId
// without asserting them let a viewer drop membership, bindings or whole
// elements and still pass.
// Fields that must be genuinely present (non-null) on a text element. The `?? null`
// in both projections means `in` alone cannot see raw absence — without this, a
// viewer that dropped fontFamily entirely would compare null === null and pass.
const REQUIRED_ON_TEXT = [
  "fontSize", "fontFamily", "lineHeight", "textAlign", "verticalAlign",
  "autoResize", "text", "originalText",
];

const ASSERTED_FIELDS = [
  "type", "x", "y", "width", "height", "angle",
  "frameId", "containerId",
  // The complete text metric tuple, not a subset — these are exactly the fields
  // PLAN.md §2 pins, so parity has to cover all of them.
  "fontSize", "fontFamily", "lineHeight", "textAlign", "verticalAlign", "autoResize",
  "text", "originalText",
];

const duplicateIdFailures = [];

// Duplicate ids must fail, not collapse: `new Map(scene.map(...))` keeps only the
// last, so a duplicated viewer element would slip past the diff entirely.
function byId(scene, label) {
  const m = new Map();
  const dupes = [];
  for (const e of scene ?? []) {
    if (m.has(e.id)) dupes.push(e.id);
    m.set(e.id, e);
  }
  if (dupes.length) {
    duplicateIdFailures.push(
      `duplicate element ids in ${label}: ${[...new Set(dupes)].join(", ")}`,
    );
  }
  return m;
}

function diffScenes(labelA, a, labelB, b) {
  const A = byId(a, labelA);
  const B = byId(b, labelB);
  const out = [];
  for (const id of new Set([...A.keys(), ...B.keys()])) {
    const x = A.get(id);
    const y = B.get(id);
    if (!x) { out.push({ id, issue: `missing in ${labelA}` }); continue; }
    if (!y) { out.push({ id, issue: `missing in ${labelB}` }); continue; }
    if (x.isDeleted || y.isDeleted) out.push({ id, issue: "element marked deleted" });
    for (const f of ASSERTED_FIELDS) {
      // `undefined === undefined` is how three fields silently passed for a
      // whole round: they were named in ASSERTED_FIELDS but never projected.
      if (!(f in x) || !(f in y)) {
        out.push({ id, field: f, issue: "field not projected on both sides" });
        continue;
      }
      if (x[f] !== y[f]) out.push({ id, field: f, [labelA]: x[f], [labelB]: y[f] });
    }
    if (x.type === "text" || y.type === "text") {
      for (const f of REQUIRED_ON_TEXT) {
        if (x[f] === null || x[f] === undefined)
          out.push({ id, field: f, issue: `null/absent on ${labelA}` });
        if (y[f] === null || y[f] === undefined)
          out.push({ id, field: f, issue: `null/absent on ${labelB}` });
      }
    }
    // Normalise ONLY null/undefined to []. `v && v.length ? v : []` also
    // swallowed malformed non-array values such as {} or {length: 0}, which is
    // fail-open: a viewer returning garbage here would have compared equal.
    const canon = (v, side) => {
      if (v === null || v === undefined) return "[]";
      if (!Array.isArray(v)) {
        // Never returned as a comparable string — two identically-malformed
        // sides would otherwise compare equal and pass.
        out.push({
          id, field: "boundElements", issue: `non-array on ${side}`,
          value: JSON.stringify(v),
        });
        return null;
      }
      return JSON.stringify(v);
    };
    const bx = canon(x.boundElements, labelA);
    const by = canon(y.boundElements, labelB);
    if (bx !== null && by !== null && bx !== by) {
      out.push({ id, field: "boundElements", [labelA]: bx, [labelB]: by });
    }
  }
  return out;
}

// (a) the two array orderings must agree element-for-element
const sceneMismatch = diffScenes(
  "childBeforeFrame", viewerResults.childBeforeFrame,
  "frameFirst", viewerResults.frameFirst,
);

// (b) what the viewer holds must match what we wrote
const writtenScene = orderings.childBeforeFrame.map((e) => ({
  id: e.id, type: e.type, x: e.x, y: e.y, width: e.width, height: e.height,
  angle: e.angle ?? 0, frameId: e.frameId ?? null, containerId: e.containerId ?? null,
  boundElements: e.boundElements ?? null,
  fontSize: e.fontSize ?? null, fontFamily: e.fontFamily ?? null,
  lineHeight: e.lineHeight ?? null,
  textAlign: e.textAlign ?? null, verticalAlign: e.verticalAlign ?? null,
  autoResize: e.autoResize ?? null,
  text: e.text ?? null, originalText: e.originalText ?? null, isDeleted: false,
}));
// Env-gated negative-test hooks. A gate whose failure path has never executed is
// not a gate — these keep that path reproducible from the checked-in probe.
//   BD_NEG_SCENE=1  sub-4dp geometry drift on the written baseline
//   BD_NEG_FP=1     sub-4dp font-metric drift
//   BD_NEG_FIELD=1  an asserted field raw-absent on one side
//   BD_NEG_NULLFIELD=1  an asserted text field present but null
//   BD_NEG_FPKEY=1  a fingerprint key missing from one side
//   BD_NEG_DUP=1    a duplicated element id
//   BD_NEG_BOUND=1  a malformed boundElements value
if (process.env.BD_NEG_SCENE === "1") {
  writtenScene.find((e) => e.id === "cont1").width += 0.00001;
}
if (process.env.BD_NEG_BOUND === "1") {
  writtenScene.find((e) => e.id === "cont1").boundElements = { length: 0 };
}
if (process.env.BD_NEG_FIELD === "1") {
  delete writtenScene.find((e) => e.id === "txt1").textAlign;   // raw absence
}
if (process.env.BD_NEG_NULLFIELD === "1") {
  writtenScene.find((e) => e.id === "txt1").fontFamily = null;  // masked absence
}
if (process.env.BD_NEG_DUP === "1") {
  viewerResults.childBeforeFrame.push({ ...viewerResults.childBeforeFrame[0] });
}
const writtenMismatch = diffScenes(
  "written", writtenScene, "viewer", viewerResults.childBeforeFrame,
);

const report = {
  viewerVersion,
  pinnedViewerBuild: PINNED_VIEWER_BUILD,
  viewerBuildMatchesPinned: viewerVersion?.version === PINNED_VIEWER_BUILD,
  fontChecks: { ours: ours.metrics.check, viewer: viewerResults.metrics?.check ?? null },
  failedChecks,
  fpKeyFailures,
  fontFingerprintDiff: fpDiff,
  maxFingerprintDeltaPct: maxDelta,
  maxFingerprintDeltaPx: maxDeltaPx,
  tolerancePx: TOLERANCE_PX,
  fingerprintIdentical: maxDeltaPx <= TOLERANCE_PX,
  boundTextParity: {
    written: {
      width: boundText.width, height: boundText.height, text: writtenText,
    },
    readBack,
    textUnchanged: readBack ? readBack.text === writtenText : null,
    widthDelta: readBack ? readBack.width - boundText.width : null,
    heightDelta: readBack ? readBack.height - boundText.height : null,
  },
  orderingParity: {
    childBeforeFrameKeptFrameId: readBack?.frameId ?? null,
    frameFirstKeptFrameId: readBackFF?.frameId ?? null,
    // Normalised by id — the two scenes differ in ARRAY order by construction,
    // which is the whole point of the test. Comparing them positionally made
    // this field false on every successful run, and the gate ignored it.
    identicalGeometry: sceneMismatch.length === 0,
    mismatches: sceneMismatch,
  },
  writtenSceneParity: writtenMismatch,
  rawViewerScenes: {
    childBeforeFrame: viewerResults.childBeforeFrame,
    frameFirst: viewerResults.frameFirst,
  },
};

await writeFile(
  resolve(OUT, "probe-06-parity.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify({ ...report, rawViewerScenes: "<written to file>" }, null, 2));

// ---------- fail closed ----------
//
// This probe is the ONLY mechanism that detects live viewer drift (PLAN.md §2
// risk list), so recording a mismatch without failing would make that mitigation
// decorative. Every condition below blocks re-signing the oracle.

const failures = [];
if (!viewerVersion?.version) failures.push("viewer build not identified");
else if (!report.viewerBuildMatchesPinned)
  failures.push(
    `viewer build drifted: pinned ${PINNED_VIEWER_BUILD}, live ${viewerVersion.version}`,
  );
if (failedChecks.length)
  failures.push(`fonts not loaded for: ${failedChecks.join(", ")}`);
if (!Number.isFinite(maxDeltaPx)) failures.push("a fingerprint entry was missing");
else if (maxDeltaPx > TOLERANCE_PX)
  failures.push(`font metric drift: max |delta| ${maxDeltaPx}px > ${TOLERANCE_PX}px`);
if (!readBack) failures.push("scene did not round-trip through the viewer");
else {
  if (!report.boundTextParity.textUnchanged)
    failures.push("viewer rewrote the bound text");
  if (report.boundTextParity.widthDelta !== 0 || report.boundTextParity.heightDelta !== 0)
    failures.push(
      `bound-text geometry drift: dw=${report.boundTextParity.widthDelta} dh=${report.boundTextParity.heightDelta}`,
    );
}
for (const d of duplicateIdFailures) failures.push(d);
if (fpKeyFailures.length)
  failures.push(`fingerprint key set wrong: ${fpKeyFailures.slice(0, 6).join(", ")}`);
if (writtenMismatch.length)
  failures.push(
    `viewer altered the scene we wrote (${writtenMismatch.length}): ` +
      JSON.stringify(writtenMismatch.slice(0, 6)),
  );
if (sceneMismatch.length)
  failures.push(
    `the two array orderings diverged (${sceneMismatch.length}): ` +
      JSON.stringify(sceneMismatch.slice(0, 6)),
  );

report.passed = failures.length === 0;
report.failures = failures;
await writeFile(
  resolve(OUT, "probe-06-parity.json"),
  JSON.stringify(report, null, 2) + "\n",
);

if (failures.length) {
  console.error("PARITY FAILED — oracle must stay blocked:");
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    "\nBumping the pinned viewer constant does NOT fix a behavioural mismatch:\n" +
      "update the local bundle/adapter until parity passes, THEN re-pin and re-sign.\n" +
      "There is no accepted-divergence state — parity passes or the oracle stays blocked.",
  );
  process.exit(1);
}
console.error(
  `parity holds: ${Object.keys(fpDiff).length} measurements, max |delta| ${maxDeltaPx}px, viewer ${viewerVersion.version}`,
);
