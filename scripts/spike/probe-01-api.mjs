// Probe 1 — does the harness boot, do the scene fonts actually load, what are
// the real FONT_FAMILY ids, and does the public API perform bound-text layout?
//
// Everything in the spike that is cheap to answer, answered first. If
// convertToExcalidrawElements does not produce real wrapped geometry, route 1
// has to vendor internals and the plan's largest risk is live.

import { withHarness } from "../harness-runner.mjs";

const result = await withHarness(async ({ page, consoleErrors }) => {
  return page.evaluate(async () => {
    const api = window.__bdApi;
    const out = {};

    out.exports = Object.keys(api).sort();
    out.FONT_FAMILY = api.FONT_FAMILY;

    // Which faces did Excalidraw actually register, and are they loaded?
    const faces = [];
    document.fonts.forEach((f) =>
      faces.push({ family: f.family, status: f.status, unicodeRange: f.unicodeRange?.slice(0, 40) }),
    );
    const families = [...new Set(faces.map((f) => f.family))].sort();
    out.registeredFamilies = families;
    out.loadedCheck = Object.fromEntries(
      families.map((f) => [f, document.fonts.check(`20px ${f}`)]),
    );

    // Does the public converter lay out bound text? Give it a container with a
    // label far too long for its declared width and see whether the returned
    // elements carry real wrapped geometry.
    const long =
      "The quick brown fox jumps over the lazy dog and keeps running well past the edge";
    try {
      const converted = api.convertToExcalidrawElements([
        {
          type: "rectangle",
          x: 0,
          y: 0,
          width: 300,
          height: 100,
          label: { text: long, fontSize: 20, fontFamily: 5 },
        },
      ]);
      out.convert = converted.map((el) => ({
        type: el.type,
        id: el.id,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        containerId: el.containerId ?? null,
        boundElements: el.boundElements ?? null,
        fontSize: el.fontSize,
        fontFamily: el.fontFamily,
        lineHeight: el.lineHeight,
        text: el.text,
        originalText: el.originalText,
        autoResize: el.autoResize,
      }));
      const t = converted.find((e) => e.type === "text");
      out.convertWrapped = t ? t.text !== t.originalText : null;
      out.convertLineCount = t ? t.text.split("\n").length : null;
    } catch (e) {
      out.convertError = String(e && e.stack);
    }

    // Raw canvas metrics for the same string, as a sanity baseline.
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = "20px Excalifont";
    out.rawMeasure = ctx.measureText(long).width;

    return out;
  });
});

console.log(JSON.stringify(result, null, 2));
