// Probe 3 — the two-frame fixture (PLAN.md §11).
//
// Research 02 left four things empirically open: whether exportingFrame really
// selects only that frame's members, whether it clips, whether membership is
// frameId alone, and whether child-before-frame array order is load-bearing.
// This builds a scene designed so each of those produces a visible, measurable
// difference, and reports per-frame render time for the §8 retry budget.

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ROOT, withHarness } from "../harness-runner.mjs";

const OUT = resolve(ROOT, ".scratch/spike-artifacts");
await mkdir(OUT, { recursive: true });

const result = await withHarness(async ({ page }) => {
  return page.evaluate(async () => {
    await Promise.all(
      ["Excalifont", "Nunito", "Cascadia"].map((f) =>
        document.fonts.load(`20px "${f}"`, "The quick brown fox 0123456789"),
      ),
    );
    await document.fonts.ready;

    const { convertToExcalidrawElements, exportToSvg } = window.__bdApi;

    // Two frames stacked vertically, each holding a labelled rectangle, plus
    // one unframed element sitting between them. If exportingFrame works as
    // documented, a per-frame export shows that frame's rectangle and never
    // the unframed marker or the other frame's content.
    const skeleton = [
      { type: "rectangle", id: "boxA", x: 60, y: 60, width: 300, height: 120,
        backgroundColor: "#a5d8ff", label: { text: "BAND ONE", fontSize: 20, fontFamily: 6 } },
      { type: "rectangle", id: "boxB", x: 60, y: 460, width: 300, height: 120,
        backgroundColor: "#b2f2bb", label: { text: "BAND TWO", fontSize: 20, fontFamily: 6 } },
      { type: "rectangle", id: "unframed", x: 60, y: 300, width: 300, height: 60,
        backgroundColor: "#ffc9c9", label: { text: "UNFRAMED CHROME", fontSize: 20, fontFamily: 6 } },
      // Deliberately oversized: it starts inside frame A's bounds and runs
      // well past them, so clipping is visible in the exported geometry.
      { type: "rectangle", id: "overflow", x: 200, y: 100, width: 600, height: 40,
        backgroundColor: "#ffd8a8" },
    ];
    const els = convertToExcalidrawElements(skeleton);

    const byLabel = (t) => els.find((e) => e.type === "text" && e.originalText === t);
    const containerOf = (t) => els.find((e) => e.id === byLabel(t)?.containerId);
    const overflowEl = els.find(
      (e) => e.type === "rectangle" && e.width === 600,
    );
    const unframedBox = containerOf("UNFRAMED CHROME");

    const frameA = {
      id: "frameA", type: "frame", x: 20, y: 20, width: 400, height: 200,
      angle: 0, strokeColor: "#bbb", backgroundColor: "transparent",
      fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 0,
      opacity: 100, groupIds: [], frameId: null, roundness: null, seed: 1,
      version: 1, versionNonce: 1, isDeleted: false, boundElements: null,
      updated: 1, link: null, locked: false, name: "01 Band One",
    };
    const frameB = { ...frameA, id: "frameB", y: 420, seed: 2, name: "02 Band Two" };

    // Membership is frameId only — never geometry. The overflow rectangle is
    // assigned to frame A even though most of it lies outside.
    const assign = (el, fid) => ({ ...el, frameId: fid });
    const aMembers = [
      assign(containerOf("BAND ONE"), "frameA"),
      assign(byLabel("BAND ONE"), "frameA"),
      assign(overflowEl, "frameA"),
    ];
    const bMembers = [
      assign(containerOf("BAND TWO"), "frameB"),
      assign(byLabel("BAND TWO"), "frameB"),
    ];
    const chrome = [unframedBox, byLabel("UNFRAMED CHROME")];

    // Children immediately before their frame (research 02).
    const scene = [...aMembers, frameA, ...bMembers, frameB, ...chrome];

    const svgAttrs = (svg) => ({
      width: svg.getAttribute("width"),
      height: svg.getAttribute("height"),
      viewBox: svg.getAttribute("viewBox"),
      // Text content is the cheapest reliable proxy for "what got drawn".
      texts: [...svg.querySelectorAll("text")].map((t) => t.textContent),
      clipPaths: svg.querySelectorAll("clipPath").length,
    });

    const common = {
      appState: { exportBackground: true, viewBackgroundColor: "#ffffff", exportPadding: 10 },
      files: null,
    };

    const timings = {};
    const t0 = performance.now();
    const svgA = await exportToSvg({ ...common, elements: scene, exportingFrame: frameA });
    timings.frameA = performance.now() - t0;

    const t1 = performance.now();
    const svgB = await exportToSvg({ ...common, elements: scene, exportingFrame: frameB });
    timings.frameB = performance.now() - t1;

    const t2 = performance.now();
    const svgScene = await exportToSvg({ ...common, elements: scene });
    timings.wholeScene = performance.now() - t2;

    // Does array order actually matter? Same elements, frames first.
    const scrambled = [frameA, frameB, ...aMembers, ...bMembers, ...chrome];
    const svgScrambled = await exportToSvg({
      ...common, elements: scrambled, exportingFrame: frameA,
    });

    return {
      frameA: svgAttrs(svgA),
      frameB: svgAttrs(svgB),
      wholeScene: svgAttrs(svgScene),
      scrambledOrderFrameA: svgAttrs(svgScrambled),
      timings,
      overflowElement: { x: overflowEl.x, width: overflowEl.width, frameId: "frameA" },
      svgMarkup: {
        frameA: new XMLSerializer().serializeToString(svgA),
        wholeScene: new XMLSerializer().serializeToString(svgScene),
      },
    };
  });
});

const { svgMarkup, ...report } = result;
await writeFile(resolve(OUT, "probe-03-frameA.svg"), svgMarkup.frameA);
await writeFile(resolve(OUT, "probe-03-scene.svg"), svgMarkup.wholeScene);
await writeFile(
  resolve(OUT, "probe-03-report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
