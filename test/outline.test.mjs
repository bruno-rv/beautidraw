import test from "node:test";
import assert from "node:assert/strict";

import { buildOverview, buildOutline } from "../scripts/outline.mjs";

const spec = {
  title: "Deck title",
  subtitle: "A semantic reading path",
  footer: "Source-backed decisions",
  bands: [
    {
      heading: "Context",
      deck: "Scope determines what enters the working set",
      pattern: "canvas",
      accent: "blue",
      height: 620,
      visual: {
        family: "illustration",
        thesis: "Context is a boundary, not a pile of files.",
        explanation: "The active scope narrows the evidence that a learner can inspect.",
        example: "Run node scripts/build-deck.mjs /context.",
        tradeoff: "A narrow scope reduces noise but can hide a dependency.",
        inspect: "Inspect source at https://example.com/context?view=source",
        callouts: [
          { kind: "example", label: "Example", note: "The scoped command" },
          { kind: "boundary", label: "Boundary", note: "What remains outside" },
        ],
        image: {
          file: "assets/context.png",
          use: "A layered system showing scope",
          description: "A layered system with a highlighted context boundary.",
        },
      },
    },
    {
      heading: "Boundary",
      deck: "Inspection makes the decision falsifiable",
      pattern: "flow",
      relation: "causal",
      accent: "amber",
      nodes: [{ label: "Inspect", note: "Read the source and compare the result" }],
    },
  ],
};

test("outline preserves the full ordered learning content", () => {
  const markdown = buildOutline(spec, {
    frameNames: ["01 Context", "02 Boundary"],
    compositionManifest: {
      assets: [{ path: "assets/context.png", description: "A layered system with a highlighted context boundary." }],
    },
  });
  assert.match(markdown, /^# Deck title/m);
  assert.ok(markdown.indexOf("## 01 Context") < markdown.indexOf("## 02 Boundary"));
  assert.match(markdown, /Image: A layered system with a highlighted context boundary\./);
  assert.match(markdown, /`\/context`/);
  assert.match(markdown, /\[Inspect source\]\(https:\/\//);
  assert.match(markdown, /Example: Example/);
  assert.match(markdown, /Boundary: Boundary/);
});

test("overview is derived from the existing title and bands", () => {
  assert.deepEqual(buildOverview(spec), {
    title: "Deck title",
    subtitle: "A semantic reading path",
    frames: [{ name: "01 Context" }, { name: "02 Boundary" }],
    navigation: "Use Excalidraw frame navigation for reading; use outline.md on smaller screens.",
  });
});

test("outline preserves timeline and canvas fields consumed by composition", () => {
  const rich = structuredClone(spec);
  rich.bands[0].visual = {
    family: "field",
    focus: "Scope decision",
    caption: "Two axes make the decision inspectable.",
    nodes: [
      { label: "Narrow", note: "Low blast radius" },
      { label: "Broad", note: "High reuse" },
    ],
    axisX: "specificity →",
    axisY: "blast radius ↑",
    thesis: "Scope is a decision surface.",
    explanation: "The visual compares the two dimensions.",
    example: "Run /context before a package read.",
    tradeoff: "A broader scope increases reuse and risk.",
    inspect: "Inspect /context and compare the loaded sources.",
    callouts: [{ kind: "warning", label: "Risk", note: "Broad scope" }],
  };
  rich.bands.push({
    heading: "Timeline",
    deck: "The sequence remains ordered in the accessible reading path",
    pattern: "timeline",
    accent: "violet",
    nodes: [{ at: "Q1", label: "Start", note: "Initial scope" }],
  });
  const markdown = buildOutline(rich, { frameNames: ["01 Context", "02 Timeline"] });
  for (const expected of [
    "**Focus:** Scope decision",
    "**Caption:** Two axes make the decision inspectable.",
    "**Axis X:** specificity →",
    "**Axis Y:** blast radius ↑",
    "Narrow",
    "Low blast radius",
    "Warning: Risk",
    "At: Q1",
    "Start",
    "Initial scope",
  ]) assert.match(markdown, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("outline rejects absolute source paths", () => {
  const unsafe = structuredClone(spec);
  unsafe.bands[0].visual.image.file = "/Users/bruno/private/context.png";
  assert.throws(() => buildOutline(unsafe), /absolute|portable|path/i);
});

test("outline headings and inline content cannot inject Markdown structure", () => {
  const unsafe = structuredClone(spec);
  unsafe.title = "Title\n# Injected heading";
  unsafe.bands[0].heading = "Frame\n## Injected frame";
  unsafe.bands[0].visual.thesis = "[link](javascript:alert(1)) *emphasis*";
  const markdown = buildOutline(unsafe);
  assert.doesNotMatch(markdown, /^# Injected heading$/m);
  assert.doesNotMatch(markdown, /^## Injected frame$/m);
  assert.match(markdown, /\\\[link\\\]/);
});

test("outline rejects POSIX and Windows absolute paths", () => {
  for (const path of ["/home/bruno/private.png", "C:\\\\Users\\\\bruno\\\\private.png"]) {
    const unsafe = structuredClone(spec);
    unsafe.bands[0].visual.image.file = path;
    assert.throws(() => buildOutline(unsafe), /portable|absolute|path/i);
  }
});
