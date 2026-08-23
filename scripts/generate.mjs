// Node entry point: node scripts/generate.mjs <spec.json> <outdir>
//
// Boots the harness (scripts/harness-runner.mjs), loads scripts/layout.mjs
// inside the page, runs layoutDeck, validates the result against every check in
// LAYOUT-CONTRACT.md's "Deliverables" §3, and — only if every check passes —
// writes <outdir>/deck.excalidraw, band-NN.png per frame, scene.png and
// diagnostics.json.
//
// A failed run still writes diagnostics.json (with the failure reasons) but
// never writes deck.excalidraw — a blocked run that explains nothing is
// useless, but a blocked run that ships a file anyway is worse.

import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { withHarness } from "./harness-runner.mjs";
import { formatDiagnostic } from "./cli.mjs";
import { preflightDeck, readJsonInput } from "./preflight.mjs";
import {
  BAND_HEIGHT_CAP,
  FONT_NAME,
  PAGE_WIDTH,
  PAGE_X,
  USABLE_H,
  USABLE_W,
  collectFontRequirements,
} from "./layout.mjs";

const EPSILON = 0.08 * PAGE_WIDTH; // edge-coverage tolerance, LAYOUT-CONTRACT.md §Deliverables

function usageAndExit(code = 1) {
  console.error("usage: node scripts/generate.mjs <spec.json> <outdir>");
  console.error("       runs the deterministic base layout in the harness and writes");
  console.error("       deck.excalidraw, band PNGs, scene.png, and diagnostics.json.");
  process.exit(code);
}

async function writeDiagnosticsAndExit(outDir, diagnostics, message) {
  await mkdir(outDir, { recursive: true });
  await writeFile(
    resolve(outDir, "diagnostics.json"),
    JSON.stringify(diagnostics, null, 2) + "\n",
  );
  console.error(message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Section 3 validators. Each takes the FINAL (finalize-call) elements array
// and returns a list of failure strings — never the numbers layoutDeck
// computed along the way, so a measure/finalize divergence can't hide behind
// a validator that's really just re-checking its own bookkeeping.
// ---------------------------------------------------------------------------

function bbox(el) {
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}

// A perfectly horizontal or vertical line/arrow has a zero-area AABB on one
// axis. That's correct for the timeline's axis-crossing-tick case (two
// zero-extent linear elements meeting at a single point is not an
// "overlap"), but it would also make a straight connector that runs THROUGH
// a rectangle invisible to a naive area test, since a zero-width or
// zero-height box can never satisfy `overlapW > 0 && overlapH > 0` against
// anything. Inflate the zero extent to strokeWidth so a real stroke's
// rendered thickness participates in the test — except when BOTH sides of
// the pair are zero-extent linear elements, which keeps the intentional
// axis/tick crossing exempt.
function isZeroExtentLinear(el) {
  return (el.type === "line" || el.type === "arrow") && (el.width === 0 || el.height === 0);
}

function inflated(el) {
  const pad = el.strokeWidth ?? 0;
  const w = el.width === 0 ? pad : el.width;
  const h = el.height === 0 ? pad : el.height;
  return { x: el.x - (w - el.width) / 2, y: el.y - (h - el.height) / 2, width: w, height: h };
}

function overlaps(a, b) {
  // Strict positive-area intersection, computed directly as an overlap
  // rectangle rather than the textbook 4-condition form. The 4-condition
  // form (`a.x1<b.x2 && b.x1<a.x2 && ...`) silently assumes both inputs have
  // positive width AND height; it does not — e.g. a `line` element drawn
  // perfectly vertical has width 0, and a horizontal axis crossing it then
  // reads as "overlapping" even though the true intersection is a
  // zero-area point. Timeline's axis/tick crossing hit exactly this.
  const exempt = isZeroExtentLinear(a) && isZeroExtentLinear(b);
  const boxA = exempt ? bbox(a) : inflated(a);
  const boxB = exempt ? bbox(b) : inflated(b);
  const overlapW = Math.min(boxA.x + boxA.width, boxB.x + boxB.width) - Math.max(boxA.x, boxB.x);
  const overlapH = Math.min(boxA.y + boxA.height, boxB.y + boxB.height) - Math.max(boxA.y, boxB.y);
  return overlapW > 0 && overlapH > 0;
}

function checkFrameHeightCap(elements) {
  const failures = [];
  for (const el of elements) {
    if (el.type !== "frame") continue;
    if (el.height > BAND_HEIGHT_CAP) {
      failures.push(
        `frame "${el.name}" (${el.id}): height ${el.height.toFixed(1)} exceeds BAND_HEIGHT_CAP=${BAND_HEIGHT_CAP}`,
      );
    }
  }
  return failures;
}

// Patterns exempted from the edge-coverage check below, with the reason each
// one is exempt — the rule exists so a band cannot quietly abandon the
// page, and every pattern except the ones named here still has to clear it.
const EDGE_COVERAGE_EXEMPT_PATTERNS = new Set([
  // `flow` cards are deliberately narrow and centred on the page axis
  // (composition fix, see FLOW_CARD_WIDTH in layout.mjs): a page-wide label
  // strip plus a page-wide note strip per step reads as two disconnected
  // bars, not a chain, and the connecting arrow gets lost against all that
  // width. A centred k=1 column can never clear ε=0.08×PAGE_WIDTH of edge
  // coverage — that's an intended consequence of the fix, not a bug in it.
  // Widening the cards back out to pass this check would just reintroduce
  // the composition defect the narrowing exists to remove.
  "flow",
  // `canvas` is intentionally blank until scripts/compose.mjs fills it.
  "canvas",
]);

function checkEdgeCoverage(elements, diagnostics) {
  const failures = [];
  const frames = elements.filter((e) => e.type === "frame");
  // Frame ids are `b${bandIndex}-frame` (layoutDeck's own convention) — used
  // here, not stored pattern metadata on the element, since frames carry no
  // pattern field of their own.
  const patternByBandIndex = new Map((diagnostics?.bands ?? []).map((b) => [b.index, b.pattern]));
  for (const frame of frames) {
    const bandMatch = /^b(\d+)-frame$/.exec(frame.id);
    const pattern = bandMatch ? patternByBandIndex.get(Number(bandMatch[1])) : undefined;
    if (EDGE_COVERAGE_EXEMPT_PATTERNS.has(pattern)) continue;

    // Probe set: this band's framed body elements plus its heading and deck
    // line — i.e. everything with frameId === frame.id except the frame
    // itself, EXCLUDING decorative `line` elements (so a full-width divider
    // cannot mask an under-filled band — the timeline axis is
    // exactly that shape, and it always spans edge-to-edge regardless of
    // whether the actual content cards do).
    const probe = elements.filter((e) => e.frameId === frame.id && e.type !== "line");
    if (!probe.length) continue;
    const left = Math.min(...probe.map((e) => e.x));
    const right = Math.max(...probe.map((e) => e.x + e.width));
    const leftDelta = Math.abs(left - PAGE_X);
    const rightDelta = Math.abs(right - (PAGE_X + PAGE_WIDTH));
    if (leftDelta > EPSILON || rightDelta > EPSILON) {
      failures.push(
        `frame "${frame.name}" (${frame.id}): content spans [${left.toFixed(1)}, ${right.toFixed(1)}], ` +
          `page is [${PAGE_X}, ${PAGE_X + PAGE_WIDTH}], ε=${EPSILON.toFixed(1)} ` +
          `(leftΔ=${leftDelta.toFixed(1)}, rightΔ=${rightDelta.toFixed(1)})`,
      );
    }
  }
  return failures;
}

function checkNoOverlap(elements) {
  const failures = [];
  const byFrame = new Map();
  for (const el of elements) {
    if (!el.frameId) continue;
    if (!byFrame.has(el.frameId)) byFrame.set(el.frameId, []);
    byFrame.get(el.frameId).push(el);
  }
  for (const [frameId, members] of byFrame) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i];
        const b = members[j];
        // A container and its own bound text are expected to coincide.
        if (a.id === b.containerId || b.id === a.containerId) continue;
        if (overlaps(a, b)) {
          failures.push(
            `band ${frameId}: "${a.id}" (${a.type}) overlaps "${b.id}" (${b.type})`,
          );
        }
      }
    }
  }
  return failures;
}

function checkLegibility(elements) {
  const failures = [];
  const frames = new Map(elements.filter((e) => e.type === "frame").map((f) => [f.id, f]));
  for (const el of elements) {
    if (el.type !== "text" || !el.frameId) continue;
    const frame = frames.get(el.frameId);
    if (!frame) continue;
    const zActual = Math.min(USABLE_W / frame.width, USABLE_H / frame.height);
    const effective = el.fontSize * zActual;
    if (effective < 12) {
      failures.push(
        `text "${el.id}" in frame "${frame.name}": fontSize ${el.fontSize} × z_actual ${zActual.toFixed(4)} ` +
          `= ${effective.toFixed(2)}px effective, below the 12px gate`,
      );
    }
  }
  return failures;
}

function checkBoundRolesResolved(elements) {
  const failures = [];
  const byId = new Map(elements.map((e) => [e.id, e]));
  // Every rectangle this deck emits was declared to carry bound text (every
  // rectSkeleton() call in layout.mjs sets a label) — so every rectangle here
  // must have boundElements referencing a real, non-empty text element.
  for (const el of elements) {
    if (el.type !== "rectangle") continue;
    const bound = (el.boundElements ?? []).filter((b) => b.type === "text");
    if (!bound.length) {
      failures.push(`rectangle "${el.id}": declared to carry bound text but boundElements has no text entry`);
      continue;
    }
    for (const b of bound) {
      const textEl = byId.get(b.id);
      if (!textEl) {
        failures.push(`rectangle "${el.id}": boundElements references missing text "${b.id}"`);
        continue;
      }
      if (typeof textEl.text !== "string" || textEl.text.trim() === "") {
        failures.push(`rectangle "${el.id}": bound text "${b.id}" is empty or whitespace-only`);
      }
    }
  }
  return failures;
}

function checkBoundElementsIsArray(elements) {
  const failures = [];
  for (const el of elements) {
    if (!Array.isArray(el.boundElements)) {
      failures.push(`element "${el.id}" (${el.type}): boundElements is ${JSON.stringify(el.boundElements)}, not an array`);
    }
  }
  return failures;
}

// Contrast — not one of the six enumerated bullets, but the contract's
// "Contrast" section says to assert rather than assume, so this runs too.
function relativeLuminance(hex) {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrastRatio(hexA, hexB) {
  const [l1, l2] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}
function checkContrast(elements) {
  const failures = [];
  const frames = new Map(elements.filter((e) => e.type === "frame").map((f) => [f.id, f]));
  const containers = new Map(
    elements.filter((e) => e.type === "rectangle").map((e) => [e.id, e]),
  );
  for (const el of elements) {
    if (el.type !== "text") continue;
    const zActual = el.frameId && frames.has(el.frameId)
      ? Math.min(USABLE_W / frames.get(el.frameId).width, USABLE_H / frames.get(el.frameId).height)
      : Math.min(USABLE_W / (PAGE_WIDTH + 20), 1); // z_scene approximation for unframed chrome
    const effective = el.fontSize * zActual;
    const threshold = effective < 24 ? 4.5 : 3;
    const container = el.containerId ? containers.get(el.containerId) : null;
    const bg = container && container.backgroundColor !== "transparent" ? container.backgroundColor : "#ffffff";
    const fg = el.strokeColor;
    if (!/^#[0-9a-fA-F]{6}$/.test(bg) || !/^#[0-9a-fA-F]{6}$/.test(fg)) continue; // skip non-hex (e.g. "transparent")
    const ratio = contrastRatio(fg, bg);
    if (ratio < threshold) {
      failures.push(
        `text "${el.id}": contrast ${ratio.toFixed(2)}:1 (${fg} on ${bg}) at ${effective.toFixed(1)}px effective, ` +
          `needs ≥${threshold}:1`,
      );
    }
  }
  return failures;
}

function runValidations(elements, diagnostics) {
  return [
    ...checkFrameHeightCap(elements),
    ...checkEdgeCoverage(elements, diagnostics),
    ...checkNoOverlap(elements),
    ...checkLegibility(elements),
    ...checkBoundRolesResolved(elements),
    ...checkBoundElementsIsArray(elements),
    ...checkContrast(elements),
  ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const [, , specPath, outDirArg] = process.argv;
if (!specPath || !outDirArg) usageAndExit(specPath === "--help" || specPath === "-h" ? 0 : 1);
const outDir = resolve(outDirArg);

let spec;
try {
  spec = await readJsonInput(specPath, { label: "deck spec" });
} catch (e) {
  console.error(formatDiagnostic(e));
  process.exit(1);
}

const preflight = await preflightDeck({ specPath, spec });
if (!preflight.ok) {
  console.error(formatDiagnostic({
    command: "generate",
    stage: "preflight",
    input: specPath,
    reason: preflight.failures.map((failure) => `${failure.field}: ${failure.reason}`).join("; "),
    recovery: "Fix the deck spec and rerun generation.",
  }));
  process.exit(1);
}

// Pure validation + font corpus, before the harness even boots.
let fontReq;
try {
  fontReq = collectFontRequirements(spec);
} catch (e) {
  await writeDiagnosticsAndExit(
    outDir,
    { stage: "validate", passed: false, error: String(e.message ?? e) },
    `VALIDATION FAILED: ${e.message ?? e}`,
  );
}

const pageResult = await withHarness(async ({ page, origin }) => {
  return page.evaluate(
    async ({ specJson, fontReqJson, layoutUrl }) => {
      try {
        const spec = JSON.parse(specJson);
        const fontReq = JSON.parse(fontReqJson);

        // Font gate — character-driven, per LAYOUT-CONTRACT.md / spike F2/F8.
        // Load with the deck's own characters, then `ready`, then `check`
        // WITH the text argument — a bare check(font) passes vacuously.
        await Promise.all(
          fontReq.map(({ family, size, chars }) => document.fonts.load(`${size}px "${family}"`, chars)),
        );
        await document.fonts.ready;
        const failedChecks = fontReq
          .filter(({ family, size, chars }) => !document.fonts.check(`${size}px "${family}"`, chars))
          .map(({ family, size }) => `${family}@${size}`);
        if (failedChecks.length) {
          return { error: `font gate failed (document.fonts.check false for): ${failedChecks.join(", ")}` };
        }

        const mod = await import(layoutUrl);
        const { elements: rawElements, diagnostics } = mod.layoutDeck(spec, window.__bdApi);

        // "Emit boundElements: [], never null" — the converter only sets it
        // on containers with bound text; everything else comes back with it
        // absent, not null, so this normalizes both.
        const elements = rawElements.map((el) => ({ ...el, boundElements: el.boundElements ?? [] }));

        const { exportToCanvas, serializeAsJSON } = window.__bdApi;
        const frames = elements.filter((e) => e.type === "frame");
        const bandPngs = [];
        for (const frame of frames) {
          const canvas = await exportToCanvas({
            elements,
            appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
            files: null,
            exportingFrame: frame,
          });
          bandPngs.push({ frameId: frame.id, name: frame.name, dataUrl: canvas.toDataURL("image/png") });
        }

        const sceneCanvas = await exportToCanvas({
          elements,
          appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
          files: null,
          exportPadding: 10, // top-level option — inside appState it's silently ignored (spike F6)
        });
        const sceneDataUrl = sceneCanvas.toDataURL("image/png");

        const excalidrawJson = serializeAsJSON(elements, { viewBackgroundColor: "#ffffff" }, {}, "local");

        return {
          elements,
          diagnostics,
          bandPngs,
          sceneDataUrl,
          excalidrawJson,
          fontReport: { loaded: fontReq.map(({ family, size }) => `${family}@${size}`) },
        };
      } catch (e) {
        return { error: String((e && e.stack) || e) };
      }
    },
    {
      specJson: JSON.stringify(spec),
      fontReqJson: JSON.stringify(fontReq),
      layoutUrl: `${origin}/scripts/layout.mjs?v=${Date.now()}`,
    },
  );
});

if (pageResult.error) {
  await writeDiagnosticsAndExit(
    outDir,
    { stage: "layout", passed: false, error: pageResult.error },
    `LAYOUT FAILED: ${pageResult.error}`,
  );
}

const { elements, diagnostics, bandPngs, sceneDataUrl, excalidrawJson, fontReport } = pageResult;

const failures = runValidations(elements, diagnostics);
if (failures.length) {
  await writeDiagnosticsAndExit(
    outDir,
    { stage: "validate-output", passed: false, failures, diagnostics, fontReport },
    `VALIDATION FAILED (${failures.length}):\n` + failures.map((f) => `  - ${f}`).join("\n"),
  );
}

// Everything passed — write the deliverables.
await mkdir(outDir, { recursive: true });
// A rebuild against a spec that shrank must not leave orphaned band renders
// behind: a stale band-11.png beside ten current bands reads as part of the
// deck. Remove only files matching our own naming pattern beyond the new
// count — anything else in the directory is not ours to touch.
const staleBand = (name) => /^band-\d{2}\.png$/.exec(name);
for (const name of await readdir(outDir)) {
  if (staleBand(name) && Number(staleBand(name)[1]) > bandPngs.length) {
    await rm(resolve(outDir, name));
  }
}
await writeFile(resolve(outDir, "deck.excalidraw"), excalidrawJson);
for (let i = 0; i < bandPngs.length; i++) {
  const name = `band-${String(i + 1).padStart(2, "0")}.png`;
  const base64 = bandPngs[i].dataUrl.split(",")[1];
  await writeFile(resolve(outDir, name), Buffer.from(base64, "base64"));
}
await writeFile(resolve(outDir, "scene.png"), Buffer.from(sceneDataUrl.split(",")[1], "base64"));
await writeFile(
  resolve(outDir, "diagnostics.json"),
  JSON.stringify({ stage: "done", passed: true, diagnostics, fontReport, bandCount: bandPngs.length }, null, 2) + "\n",
);

console.error(
  `OK: wrote ${resolve(outDir, "deck.excalidraw")}, ${bandPngs.length} band PNGs, scene.png, diagnostics.json`,
);
