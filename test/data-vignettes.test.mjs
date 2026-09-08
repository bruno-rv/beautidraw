import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  DATA_VIGNETTE_KINDS,
  DATA_VIGNETTE_LIMITS,
  DATA_VIGNETTE_VIEWPORT,
  dataVignetteOutline,
  formatProbabilityLabel,
  renderDataVignette,
  validateDataVignette,
} from "../scripts/data-vignettes.mjs";
import { FONT } from "../scripts/layout.mjs";
import { buildOutline } from "../scripts/outline.mjs";
import { preflightDeck } from "../scripts/preflight.mjs";
import { withHarness } from "../scripts/harness-runner.mjs";

const caption = "Synthetic illustrative example — toy values are not real tokenizer or model output.";
const tokenData = {
  kind: "token-sequence",
  caption,
  pieces: [
    { text: "The", id: "toy-01" },
    { text: " sky", id: "toy-02" },
    { text: " is", id: "toy-03" },
  ],
};
const lookupData = {
  kind: "lookup",
  caption,
  key: "toy-314",
  rows: [
    { id: "toy-301", label: "cat", vector: [0.12, -0.08, 0.44, 0.31] },
    { id: "toy-314", label: "sky", vector: [0.62, -0.11, 0.27, 0.49] },
    { id: "toy-318", label: "blue", vector: [-0.05, 0.38, 0.21, 0.16] },
  ],
  selected: "toy-314",
};
const distributionData = {
  kind: "distribution",
  caption,
  candidates: [
    { label: "blue", probability: 0.52 },
    { label: "gray", probability: 0.24 },
    { label: "clear", probability: 0.16 },
    { label: "gold", probability: 0.08 },
  ],
  selected: "gray",
};

const samples = [tokenData, lookupData, distributionData];

test("data-vignette schema accepts the three bounded native data kinds", () => {
  assert.deepEqual([...DATA_VIGNETTE_KINDS].sort(), ["distribution", "lookup", "token-sequence"]);
  for (const data of samples) assert.deepEqual(validateDataVignette(data), []);
});

test("data-vignette validation rejects misleading, unbounded, and inconsistent data", () => {
  const badCaption = structuredClone(tokenData);
  badCaption.caption = "A real tokenizer output";
  assert.ok(validateDataVignette(badCaption).some(({ field }) => field === "caption"));

  const badId = structuredClone(tokenData);
  badId.pieces[0].id = "314";
  assert.ok(validateDataVignette(badId).some(({ field, reason }) => field === "pieces[0].id" && /toy/.test(reason)));

  const paddedId = structuredClone(lookupData);
  paddedId.rows[1].id = "toy-314 ";
  assert.ok(validateDataVignette(paddedId).some(({ field, reason }) => field === "rows[1].id" && /whitespace/.test(reason)));

  const paddedLabel = structuredClone(distributionData);
  paddedLabel.candidates[1].label = "gray ";
  assert.ok(validateDataVignette(paddedLabel).some(({ field, reason }) => field === "candidates[1].label" && /whitespace/.test(reason)));

  const badVector = structuredClone(lookupData);
  badVector.rows[1].vector[0] = 2;
  assert.ok(validateDataVignette(badVector).some(({ field, reason }) => field === "rows[1].vector[0]" && /between/.test(reason)));

  const badSelection = structuredClone(lookupData);
  badSelection.selected = "toy-missing";
  assert.ok(validateDataVignette(badSelection).some(({ field }) => field === "selected"));

  const badDistribution = structuredClone(distributionData);
  badDistribution.candidates[0].probability = 0.55;
  assert.ok(validateDataVignette(badDistribution).some(({ field, reason }) => field === "candidates" && /sum/.test(reason)));
});

test("renderDataVignette emits readable normalized editable primitives with role metadata", () => {
  assert.throws(
    () => renderDataVignette(tokenData, { idPrefix: "too-small", width: DATA_VIGNETTE_VIEWPORT.minWidth - 0.01, height: DATA_VIGNETTE_VIEWPORT.minHeight }),
    /at least/,
  );
  for (const [index, data] of samples.entries()) {
    const elements = renderDataVignette(data, {
      idPrefix: `vignette-${index + 1}`,
      x: 0.08,
      y: 0.06,
      width: 0.84,
      height: 0.88,
      dark: index === 2,
    });
    assert.ok(elements.length >= 8);
    assert.ok(elements.some((element) => element.type === "rectangle"));
    for (const element of elements) {
      assert.match(element.id, new RegExp(`^vignette-${index + 1}-`));
      for (const key of ["x", "y"]) {
        assert.equal(Number.isFinite(element[key]), true, `${data.kind}: ${key} must be finite`);
      }
      assert.ok(["text", "rectangle", "line", "arrow"].includes(element.type));
      if (element.type !== "text") {
        for (const key of ["width", "height"]) {
          assert.equal(Number.isFinite(element[key]), true, `${data.kind}: ${key} must be finite`);
          assert.ok(element[key] > 0, `${data.kind}: ${key} must be positive`);
        }
        assert.ok(element.x + element.width <= 1 && element.y + element.height <= 1, `${data.kind}: element must stay normalized`);
      }
      if (element.type === "text") {
        assert.equal(element.fontFamily, FONT[element.role]);
        assert.equal(element.customData.beautidrawMeasuredText, true);
        assert.equal(element.customData.beautidrawRole, element.role);
      }
      if (element.label) {
        assert.equal(element.customData.beautidrawAutoSize, true);
        assert.equal(element.label.fontFamily, FONT[element.role]);
        assert.equal(element.label.role, element.role);
      }
    }
  }
  const tokenElements = renderDataVignette(tokenData, { idPrefix: "tokens" });
  assert.equal(tokenElements.filter((element) => element.type === "line").length, tokenData.pieces.length);
  const tokenPiece = tokenElements.find((element) => element.id === "tokens-piece-2");
  assert.equal(tokenPiece.label.text, "␠sky");
  assert.equal(tokenPiece.customData.beautidrawDataValue, " sky");
  const lookupElements = renderDataVignette(lookupData, { idPrefix: "lookup" });
  assert.ok(lookupElements.some((element) => element.id === "lookup-selected-arrow"));
  const distributionElements = renderDataVignette(distributionData, { idPrefix: "distribution" });
  assert.equal(distributionElements.filter((element) => /-bar$/.test(element.id)).length, distributionData.candidates.length);
});

test("declared maximum data fits measured editor bounds in a real browser", { timeout: 120_000 }, async () => {
  const maxCaption = ("Synthetic illustrative example — toy values are not real output. "
    + "A bounded teaching caption keeps the mechanism readable.").slice(0, DATA_VIGNETTE_LIMITS.captionChars);
  assert.ok(maxCaption.length <= DATA_VIGNETTE_LIMITS.captionChars);
  const maxToken = {
    kind: "token-sequence",
    caption: maxCaption,
    pieces: Array.from({ length: DATA_VIGNETTE_LIMITS.pieces }, (_, index) => ({
      text: `${index === 0 ? " " : ""}${"piece".padEnd(DATA_VIGNETTE_LIMITS.pieceChars - (index === 0 ? 1 : 0), "x")}`,
      id: `toy-${String(index).padStart(DATA_VIGNETTE_LIMITS.ids - 4, "0")}`,
    })),
  };
  const maxLookup = {
    kind: "lookup",
    caption: maxCaption,
    key: `toy-${"k".repeat(DATA_VIGNETTE_LIMITS.keyChars - 4)}`,
    rows: Array.from({ length: DATA_VIGNETTE_LIMITS.lookupRows }, (_, index) => ({
      id: `toy-${String(index).padStart(DATA_VIGNETTE_LIMITS.ids - 4, "0")}`,
      label: `row-${String(index).padEnd(DATA_VIGNETTE_LIMITS.candidateChars - 4, "x")}`,
      vector: [0.12, -0.08, 0.44, 0.31],
    })),
    selected: "toy-" + String(DATA_VIGNETTE_LIMITS.lookupRows - 1).padStart(DATA_VIGNETTE_LIMITS.ids - 4, "0"),
  };
  const probabilities = [0.4, 0.2, 0.15, 0.1, 0.1, 0.05];
  const maxDistribution = {
    kind: "distribution",
    caption: maxCaption,
    candidates: probabilities.map((probability, index) => ({
      label: `candidate-${String(index).padEnd(DATA_VIGNETTE_LIMITS.candidateChars - 10, "x")}`,
      probability,
    })),
    selected: "candidate-1".padEnd(DATA_VIGNETTE_LIMITS.candidateChars, "x"),
  };
  const adaptiveDistribution = {
    kind: "distribution",
    caption: maxCaption,
    candidates: [
      { label: "dominant", probability: 0.9999996 },
      { label: "tiny", probability: 0.0000004 },
    ],
    selected: "tiny",
  };
  assert.equal(formatProbabilityLabel(0.0000004), "4.00e-5%");
  assert.equal(formatProbabilityLabel(0.9999996), "99.99996%");
  const scenes = [maxToken, maxLookup, maxDistribution, adaptiveDistribution];
  for (const data of scenes) assert.deepEqual(validateDataVignette(data), []);
  assert.ok(DATA_VIGNETTE_VIEWPORT.minWidth >= 0.68 && DATA_VIGNETTE_VIEWPORT.minHeight >= 0.76);

  const rendered = scenes.map((data, index) => renderDataVignette(data, {
    idPrefix: `max-${index + 1}`,
    x: 0.05,
    y: 0.05,
    width: DATA_VIGNETTE_VIEWPORT.minWidth,
    height: DATA_VIGNETTE_VIEWPORT.minHeight,
  }));
  await withHarness(async ({ page }) => {
    const result = await page.evaluate(async ({ rendered }) => {
      await document.fonts.ready;
      const api = window.__bdApi;
      const body = { x: 80, y: 80, width: 2232, height: 760 };
      const overlap = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0
        && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0;
      const failures = [];
      const counts = [];
      const texts = [];
      const viewport = {
        x: body.x + body.width * 0.05,
        y: body.y + body.height * 0.05,
        width: body.width * 0.68,
        height: body.height * 0.76,
      };
      for (const skeletons of rendered) {
        const pixels = skeletons.map((skeleton) => {
          const element = {
            ...skeleton,
            x: body.x + body.width * skeleton.x,
            y: body.y + body.height * skeleton.y,
          };
          if (Number.isFinite(skeleton.width)) element.width = body.width * skeleton.width;
          if (Number.isFinite(skeleton.height)) element.height = body.height * skeleton.height;
          if (Array.isArray(skeleton.points)) element.points = skeleton.points.map(([x, y]) => [x * element.width, y * element.height]);
          return element;
        });
        const converted = api.convertToExcalidrawElements(pixels, { regenerateIds: false });
        const byId = new Map(converted.map((element) => [element.id, element]));
        for (const element of converted) {
          if (!Number.isFinite(element.width) || !Number.isFinite(element.height)) continue;
          if (element.x < viewport.x - 1 || element.y < viewport.y - 1 || element.x + element.width > viewport.x + viewport.width + 1 || element.y + element.height > viewport.y + viewport.height + 1) {
            failures.push(`${element.id}: outside allocated vignette viewport`);
          }
          if (element.containerId) {
            const container = byId.get(element.containerId);
            if (container && (element.x < container.x - 5 || element.y < container.y - 5 || element.x + element.width > container.x + container.width + 5 || element.y + element.height > container.y + container.height + 5)) {
              failures.push(`${element.id}: bound label outside container`);
            }
          }
        }
        for (let i = 0; i < converted.length; i += 1) {
          for (let j = i + 1; j < converted.length; j += 1) {
            const a = converted[i]; const b = converted[j];
            if (!Number.isFinite(a.width) || !Number.isFinite(a.height) || !Number.isFinite(b.width) || !Number.isFinite(b.height)) continue;
            if ([a.type, b.type].some((type) => type === "line" || type === "arrow")) continue;
            if (a.containerId || b.containerId || a.id === b.containerId || b.id === a.containerId) continue;
            if (overlap(a, b)) failures.push(`${a.id} overlaps ${b.id}`);
          }
        }
        texts.push(...converted.filter((element) => element.type === "text").map((element) => element.text));
        counts.push(converted.length);
      }
      return { counts, failures, texts };
    }, { rendered });
    assert.deepEqual(result.failures, []);
    assert.ok(result.counts.every((count) => count > 8));
    assert.ok(result.texts.includes("4.00e-5%"));
    assert.ok(result.texts.includes("99.99996%"));
  });
});

test("outline includes every data example value and preflight wires visual.data", async () => {
  const outline = dataVignetteOutline(lookupData);
  for (const value of ["toy-301", "toy-314", "toy-318", "0.12", "-0.11", "0.49", "Synthetic illustrative example"]) {
    assert.match(outline, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  const root = resolve(import.meta.dirname, "..");
  const specPath = resolve(root, "decks/llm-token-flow/deck-spec.json");
  const spec = {
    title: "Data vignette",
    subtitle: "A bounded example",
    footer: "Toy values only",
    bands: [{
      heading: "Lookup",
      deck: "A selected row becomes a vector",
      pattern: "canvas",
      accent: "violet",
      height: 700,
      visual: {
        family: "illustration",
        data: lookupData,
        image: {
          file: "assets/vector-lookup-space.png",
          use: "Lookup teaching scene",
          description: "A bounded table lookup scene for the toy vector example.",
        },
      },
    }],
  };
  const preflight = await preflightDeck({ specPath, spec });
  assert.equal(preflight.ok, true, preflight.failures.map((failure) => `${failure.field}: ${failure.reason}`).join("\n"));
  const accessible = buildOutline(spec);
  assert.match(accessible, /Selected row/);
  assert.match(accessible, /toy-314/);
  assert.match(accessible, /0\.49/);

  const precise = {
    kind: "distribution",
    caption,
    candidates: [
      { label: "high", probability: 0.9999992 },
      { label: "tiny", probability: 0.0000004 },
      { label: "other", probability: 0.0000004 },
    ],
    selected: "tiny",
  };
  assert.deepEqual(validateDataVignette(precise), []);
  assert.match(dataVignetteOutline(precise), /0\.0000004/);
});

test("preflight and outline reject data on unsupported runtime bands", async () => {
  const invalidSpecs = [
    {
      pattern: "flow",
      visual: { family: "illustration", data: tokenData },
      nodes: [{ label: "Input" }],
    },
    {
      pattern: "canvas",
      height: 700,
      visual: { family: "map", data: tokenData },
    },
  ];
  for (const band of invalidSpecs) {
    const spec = {
      title: "Unsupported data",
      subtitle: "A bounded example",
      footer: "Toy values only",
      bands: [{ heading: "Unsupported", deck: "Data must have a renderer", accent: "blue", ...band }],
    };
    const preflight = await preflightDeck({ spec });
    assert.equal(preflight.ok, false);
    assert.match(preflight.failures.map((failure) => failure.reason).join("\n"), /canvas.*illustration/i);
    assert.throws(() => buildOutline(spec), /canvas.*illustration/i);
  }
});

test("LLM exemplar data is present without changing its image manifest", async () => {
  const root = resolve(import.meta.dirname, "..");
  const spec = JSON.parse(await readFile(resolve(root, "decks/llm-token-flow/deck-spec.json"), "utf8"));
  const dataBands = spec.bands.filter((band) => band.visual?.data);
  assert.deepEqual(dataBands.map((band) => band.visual.data.kind), ["token-sequence", "lookup", "distribution"]);
  assert.equal(dataBands[2].visual.data.selected, "gray");
  assert.ok(dataBands[2].visual.data.candidates[0].probability > dataBands[2].visual.data.candidates[1].probability);
});

test("commands workflow map names all six moments with existing commands", async () => {
  const root = resolve(import.meta.dirname, "..");
  const spec = JSON.parse(await readFile(resolve(root, "decks/claude-code-commands/deck-spec.json"), "utf8"));
  const map = spec.bands.find((band) => band.heading === "Act 1 — The Essential 20 in workflow order");
  assert.deepEqual(map.visual.nodes.map((node) => node.label), ["Setup", "Steering", "Context", "Parallel", "Shipping", "Recovery"]);
  assert.match(map.visual.explanation, /Shipping.*Recovery/);
  assert.doesNotMatch(map.visual.explanation, /Four of the six/);
});
