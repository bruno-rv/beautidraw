// Probe 7 — per-family lineHeight, the height derivation, and the degenerate
// bound-text cases (including a multi-line bound text with a blank line).
//
// Two results here are load-bearing: lineHeight is derived from fontFamily
// rather than chosen, and an empty label produces NO text element at all —
// silently, with the container returned alone.

import { withHarness } from "../harness-runner.mjs";

const result = await withHarness(async ({ page }) => {
  return page.evaluate(async () => {
    const FAMILIES = { Cascadia: 3, Excalifont: 5, Nunito: 6, "Lilita One": 7, "Comic Shanns": 8 };
    await Promise.all(
      Object.keys(FAMILIES).map((f) =>
        document.fonts.load(`20px "${f}"`, "Ag 0123456789 the quick brown fox"),
      ),
    );
    await document.fonts.ready;
    const { convertToExcalidrawElements } = window.__bdApi;

    const build = (text, fontFamily) =>
      convertToExcalidrawElements([
        {
          type: "rectangle", x: 0, y: 0, width: 300, height: 100,
          label: { text, fontSize: 20, fontFamily },
        },
      ]);

    // lineHeight is not ours to choose.
    const lineHeights = {};
    for (const [name, id] of Object.entries(FAMILIES)) {
      const els = build(
        "one two three four five six seven eight nine ten eleven twelve",
        id,
      );
      const t = els.find((e) => e.type === "text");
      const lines = t.text.split("\n").length;
      lineHeights[name] = {
        id,
        lineHeight: t.lineHeight,
        lines,
        height: t.height,
        heightPerLine: t.height / lines,
        derivationHolds: t.height === lines * 20 * t.lineHeight,
      };
    }

    // Degenerate cases. Every one of these is reachable from real markdown.
    const CASES = {
      blankLine: "First paragraph here that wraps a bit\n\nSecond paragraph after a blank line",
      trailingNewline: "Ends with a newline\n",
      leadingNewline: "\nStarts with a newline",
      doubleBlank: "A\n\n\nB",
      tabs: "col\tone\tand\ttwo",
      emptyString: "",
      whitespaceOnly: "   ",
      singleSpace: " ",
    };
    const degenerate = {};
    for (const [k, text] of Object.entries(CASES)) {
      const els = build(text, 6);
      const t = els.find((e) => e.type === "text");
      const c = els.find((e) => e.type === "rectangle");
      degenerate[k] = t
        ? {
            producedTextElement: true,
            lines: t.text.split("\n"),
            lineCount: t.text.split("\n").length,
            height: t.height,
            predictedHeight: t.text.split("\n").length * 20 * t.lineHeight,
            containerHeight: c.height,
            originalTextMutated: t.originalText !== text,
          }
        : { producedTextElement: false, elementsReturned: els.length };
    }

    return {
      lineHeights,
      degenerate,
      assertions: {
        allDerivationsHold: Object.values(lineHeights).every((v) => v.derivationHolds),
        lineHeightVariesByFamily:
          new Set(Object.values(lineHeights).map((v) => v.lineHeight)).size > 1,
        emptyLabelProducesNoText: degenerate.emptyString.producedTextElement === false,
        blankLinesArePreserved: degenerate.blankLine.lineCount === 5,
        tabsMutateOriginalText: degenerate.tabs.originalTextMutated === true,
      },
    };
  });
});

console.log(JSON.stringify(result, null, 2));

const failed = Object.entries(result.assertions).filter(([, v]) => v !== true);
if (failed.length) {
  console.error("FAILED assertions:", failed.map(([k]) => k).join(", "));
  process.exit(1);
}
console.error("all assertions hold");
