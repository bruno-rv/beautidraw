// Probe 2 — the font-readiness gate.
//
// Probe 1 showed document.fonts.ready resolving while every scene face still
// reported check() === false: Excalidraw registers unicode-range subsets that
// the browser loads lazily. docs/PLAN.md §11 requires measurement to be gated on
// real faces. This probe proves the gate is load-bearing by measuring the same
// strings before and after an explicit load, and it establishes the loader the
// oracle will use.

import { withHarness } from "../harness-runner.mjs";

const result = await withHarness(async ({ page }) => {
  return page.evaluate(async () => {
    const FAMILIES = ["Excalifont", "Nunito", "Cascadia", "Comic Shanns", "Lilita One"];
    const SIZES = [18, 23, 30, 38, 48];
    const SAMPLE =
      "The quick brown fox jumps over the lazy dog 0123456789 —–’“”";

    const measure = (family, size, text) => {
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.font = `${size}px ${family}`;
      return ctx.measureText(text).width;
    };

    const before = {};
    for (const f of FAMILIES) {
      before[f] = { check: document.fonts.check(`20px ${f}`), w: measure(f, 20, SAMPLE) };
    }

    // The loader under test. Excalidraw's faces are unicode-range subsets, so
    // the sample text decides which subsets get pulled.
    const loadReport = {};
    for (const f of FAMILIES) {
      for (const s of SIZES) {
        try {
          const faces = await document.fonts.load(`${s}px "${f}"`, SAMPLE);
          loadReport[`${f}@${s}`] = faces.length;
        } catch (e) {
          loadReport[`${f}@${s}`] = `ERROR ${e}`;
        }
      }
    }
    await document.fonts.ready;

    const after = {};
    for (const f of FAMILIES) {
      after[f] = { check: document.fonts.check(`20px ${f}`), w: measure(f, 20, SAMPLE) };
    }

    const delta = Object.fromEntries(
      FAMILIES.map((f) => [
        f,
        {
          checkBefore: before[f].check,
          checkAfter: after[f].check,
          widthBefore: before[f].w,
          widthAfter: after[f].w,
          changed: Math.abs(before[f].w - after[f].w) > 0.01,
        },
      ]),
    );

    // Re-run the probe-1 conversion now that faces are real, so the two
    // geometries can be compared directly.
    const long =
      "The quick brown fox jumps over the lazy dog and keeps running well past the edge";
    const converted = window.__bdApi.convertToExcalidrawElements([
      {
        type: "rectangle",
        x: 0,
        y: 0,
        width: 300,
        height: 100,
        label: { text: long, fontSize: 20, fontFamily: 5 },
      },
    ]);
    const t = converted.find((e) => e.type === "text");

    return {
      loadReport,
      delta,
      // A font fingerprint the oracle record can pin (docs/PLAN.md §8).
      fingerprint: Object.fromEntries(
        FAMILIES.flatMap((f) =>
          SIZES.map((s) => [`${f}@${s}`, +measure(f, s, SAMPLE).toFixed(4)]),
        ),
      ),
      convertedWithLoadedFonts: {
        width: t.width,
        height: t.height,
        x: t.x,
        y: t.y,
        lines: t.text.split("\n"),
      },
    };
  });
});

console.log(JSON.stringify(result, null, 2));
