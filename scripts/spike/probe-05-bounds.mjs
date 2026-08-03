// Probe 5 — nail the two whole-scene constants by direct isolation.
//
// Probe 4 showed a null frame name still paints a default "Frame" label, so the
// named/unnamed diff isolated nothing. The correct control is *no frame at all*.
// Also pins whether exportPadding has a floor, since probe 4 asked for 0 and got
// what looked like 10.

import { withHarness } from "../harness-runner.mjs";

const result = await withHarness(async ({ page }) => {
  return page.evaluate(async () => {
    await Promise.all(
      ["Excalifont", "Nunito", "Assistant"].map((f) =>
        document.fonts.load(`20px "${f}"`, "0123456789 Band One ABC"),
      ),
    );
    await document.fonts.ready;

    const { exportToSvg } = window.__bdApi;

    // A single rectangle whose bounds are exactly the frame's, so "with frame"
    // and "without frame" have identical element geometry.
    const box = {
      type: "rectangle", id: "box", x: 100, y: 100, width: 400, height: 200,
      angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent",
      fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid", roughness: 0,
      opacity: 100, groupIds: [], frameId: null, roundness: null, seed: 7,
      version: 1, versionNonce: 1, isDeleted: false, boundElements: null,
      updated: 1, link: null, locked: false,
    };
    const frame = {
      ...box, id: "frm", type: "frame", strokeWidth: 2, seed: 1,
      name: "01 Band One",
    };

    // exportPadding is a TOP-LEVEL option, not an appState field. Passing it
    // inside appState is silently ignored and the default 10 applies.
    const dims = async (elements, pad) => {
      const svg = await exportToSvg({
        elements,
        appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
        files: null,
        exportPadding: pad,
      });
      return { w: +svg.getAttribute("width"), h: +svg.getAttribute("height") };
    };

    const padSweep = {};
    for (const p of [0, 5, 10, 20, 40]) {
      padSweep[`noFrame@${p}`] = await dims([box], p);
      padSweep[`framed@${p}`] = await dims([{ ...box, frameId: "frm" }, frame], p);
    }

    const perFramePadSweep = {};
    for (const p of [0, 10, 40]) {
      const svg = await exportToSvg({
        elements: [{ ...box, frameId: "frm" }, frame],
        appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
        files: null,
        exportPadding: p,
        exportingFrame: frame,
      });
      perFramePadSweep[`p${p}`] = {
        w: +svg.getAttribute("width"), h: +svg.getAttribute("height"),
      };
    }

    return {
      padSweep,
      perFramePadSweep,
      derived: {
        // Element bbox is 400 x 200 (+1 stroke each side on the plain box).
        scenePadIsHonoured:
          padSweep["noFrame@40"].w - padSweep["noFrame@0"].w === 80,
        labelExtentHeight: +(
          padSweep["framed@0"].h - padSweep["noFrame@0"].h
        ).toFixed(4),
        labelExtentWidth: +(
          padSweep["framed@0"].w - padSweep["noFrame@0"].w
        ).toFixed(4),
        perFrameIgnoresPad:
          perFramePadSweep.p0.w === perFramePadSweep.p40.w &&
          perFramePadSweep.p0.h === perFramePadSweep.p40.h,
        perFrameExactFrameSize:
          perFramePadSweep.p10.w === 400 && perFramePadSweep.p10.h === 200,
      },
    };
  });
});

console.log(JSON.stringify(result, null, 2));
