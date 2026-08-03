// Probe 4 — isolate the frame label's painted extent.
//
// Probe 3 inferred it from a whole-scene height subtraction, which conflates the
// label with stroke width, rounding and the frame box itself. This varies exactly
// one thing — whether the frame carries a `name` — and diffs the reported bounds.
// The result decides whether FRAME_LABEL_BAND survives in docs/PLAN.md §4 and at what
// value.

import { withHarness } from "../harness-runner.mjs";

const result = await withHarness(async ({ page }) => {
  return page.evaluate(async () => {
    await Promise.all(
      ["Excalifont", "Nunito", "Assistant"].map((f) =>
        document.fonts.load(`20px "${f}"`, "0123456789 Band One ABC"),
      ),
    );
    await document.fonts.ready;

    const { convertToExcalidrawElements, exportToSvg } = window.__bdApi;

    const baseFrame = {
      type: "frame", x: 100, y: 100, width: 400, height: 200,
      angle: 0, strokeColor: "#bbb", backgroundColor: "transparent",
      fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 0,
      opacity: 100, groupIds: [], frameId: null, roundness: null, seed: 1,
      version: 1, versionNonce: 1, isDeleted: false, boundElements: null,
      updated: 1, link: null, locked: false,
    };

    const child = convertToExcalidrawElements([
      { type: "rectangle", x: 150, y: 150, width: 200, height: 80,
        backgroundColor: "#a5d8ff" },
    ])[0];

    const dims = async (frame, opts = {}) => {
      const svg = await exportToSvg({
        elements: [{ ...child, frameId: frame.id }, frame],
        appState: {
          exportBackground: true, viewBackgroundColor: "#ffffff",
          exportPadding: opts.pad ?? 0,
        },
        files: null,
        ...(opts.exportingFrame ? { exportingFrame: frame } : {}),
      });
      return {
        w: +svg.getAttribute("width"),
        h: +svg.getAttribute("height"),
        viewBox: svg.getAttribute("viewBox"),
        texts: [...svg.querySelectorAll("text")].map((t) => t.textContent),
      };
    };

    const named = { ...baseFrame, id: "fNamed", name: "01 Band One" };
    const unnamed = { ...baseFrame, id: "fUnnamed", name: null };
    const longName = {
      ...baseFrame, id: "fLong",
      name: "01 A Very Long Section Name That Runs Past The Frame Width Itself",
    };

    const scene = {
      named: await dims(named),
      unnamed: await dims(unnamed),
      longName: await dims(longName),
    };
    const perFrame = {
      named: await dims(named, { exportingFrame: true }),
      unnamed: await dims(unnamed, { exportingFrame: true }),
      longName: await dims(longName, { exportingFrame: true }),
    };
    const perFrameWithPad = {
      named: await dims(named, { exportingFrame: true, pad: 10 }),
    };

    return {
      scene,
      perFrame,
      perFrameWithPad,
      derived: {
        // Frame box is 400 x 200 with strokeWidth 2, exportPadding 0.
        labelHeightSceneExport: +(scene.named.h - scene.unnamed.h).toFixed(4),
        labelWidthSceneExport: +(scene.named.w - scene.unnamed.w).toFixed(4),
        longLabelWidthOverflow: +(scene.longName.w - scene.unnamed.w).toFixed(4),
        labelAffectsPerFrameExport:
          perFrame.named.h !== perFrame.unnamed.h ||
          perFrame.named.w !== perFrame.unnamed.w,
        perFramePaddingApplied:
          perFrameWithPad.named.w - perFrame.named.w !== 0,
      },
    };
  });
});

console.log(JSON.stringify(result, null, 2));
