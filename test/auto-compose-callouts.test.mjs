import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { preflightDeck } from "../scripts/preflight.mjs";

const root = resolve(import.meta.dirname, "..");
const wideCalloutLabel = "A bounded ordinary English callout label remains readable";
const wideCalloutLabelTwo = "A second bounded ordinary English callout label remains readable";

function node(index) {
  return { label: `Node ${index + 1}`, note: "A short supporting note" };
}

function callout(index) {
  return { kind: index === 0 ? "example" : "boundary", label: `Callout ${index + 1}`, note: `A short authored note ${index + 1}` };
}

function spec() {
  const thesis = "A wide thesis must reserve top strip before two semantic callouts enter field without touching thesis or nodes clearly.";
  assert.ok(thesis.length <= 120);
  return {
    title: "Thesis and callouts",
    subtitle: "Semantic callouts keep their own readable lane",
    footer: "Composition fixture",
    bands: [
      ...[1, 2].map((calloutCount) => ({
        heading: `Field with ${calloutCount} callout${calloutCount === 1 ? "" : "s"}`,
        deck: "A field reserves the thesis strip before its semantic callouts.",
        pattern: "canvas",
        accent: "blue",
        height: 800,
        visual: {
          family: "field",
          thesis,
          focus: "Field focus",
          axisX: "specificity →",
          axisY: "blast radius ↑",
          nodes: Array.from({ length: 6 }, (_, index) => node(index)),
          callouts: Array.from({ length: calloutCount }, (_, index) => callout(index)),
          explanation: "The lower lane keeps authored context readable after the visual relationship is understood.",
          example: "A callout can mark a concrete boundary without competing with the thesis.",
          tradeoff: "A split frame is preferable when the semantic inventory exceeds its finite capacity.",
          inspect: "inspect field geometry",
        },
      })),
      ...[1, 2].map((calloutCount) => ({
        heading: `Matrix with ${calloutCount} callout${calloutCount === 1 ? "" : "s"}`,
        deck: "A matrix reserves the thesis strip before its semantic callouts.",
        pattern: "canvas",
        accent: "violet",
        height: 800,
        visual: {
          family: "matrix",
          thesis,
          focus: "Matrix focus",
          axisX: "specificity →",
          axisY: "blast radius ↑",
          nodes: Array.from({ length: 4 }, (_, index) => node(index)),
          callouts: Array.from({ length: calloutCount }, (_, index) => callout(index)),
          explanation: "The lower lane keeps authored context readable after the matrix relationship is understood.",
          example: "A callout can mark a concrete boundary without competing with the thesis.",
          tradeoff: "A split frame is preferable when the semantic inventory exceeds its finite capacity.",
          inspect: "inspect matrix geometry",
        },
      })),
      ...["orbit", "constellation"].map((family) => ({
        heading: `${family} with authored callouts`,
        deck: `A ${family} keeps its authored callouts in the editorial reading surface.`,
        pattern: "canvas",
        accent: "amber",
        height: 800,
        visual: {
          family,
          thesis,
          focus: `${family} focus`,
          nodes: Array.from({ length: 6 }, (_, index) => node(index)),
          callouts: [callout(0), callout(1)],
          explanation: `The ${family} preserves the visual relationship while the authored callouts remain complete.`,
          example: `A concrete ${family} example keeps the claim inspectable.`,
          tradeoff: "A split frame is preferable when the semantic inventory exceeds its finite capacity.",
          inspect: `inspect ${family} geometry`,
        },
      })),
      {
        heading: "Matrix with authored zone fields",
        deck: "Authored zone fields and notes retain their own readable space.",
        pattern: "canvas",
        accent: "green",
        height: 800,
        visual: {
          family: "matrix",
          thesis,
          focus: "Zone matrix focus",
          axisX: "specificity →",
          axisY: "blast radius ↑",
          left: "Left zone field",
          middle: "Middle zone field",
          right: "Right zone field",
          nodes: [
            { label: "Zone node 1", note: "A bounded upper note remains complete." },
            { label: "Zone node 2", note: "A second upper note remains readable." },
            { label: "Zone node 3", note: "A lower quadrant note that needs clearance from callouts." },
            { label: "Zone node 4", note: "The final quadrant note remains complete and readable." },
          ],
          callouts: [
            { ...callout(0), label: wideCalloutLabel },
            { ...callout(1), label: wideCalloutLabelTwo },
          ],
          explanation: "The lower lane keeps authored zone fields and notes readable after the matrix relationship is understood.",
          example: "A concrete example keeps each zone inspectable.",
          tradeoff: "A split frame is preferable when the semantic inventory exceeds its finite capacity.",
          inspect: "inspect authored matrix geometry",
        },
      },
    ],
  };
}

test("generic callout families preserve authored content in the editorial surface", { timeout: 120_000 }, async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "beautidraw-thesis-callouts-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const specPath = join(temp, "spec.json");
  const output = join(temp, "out");
  const deckSpec = spec();

  const preflight = await preflightDeck({ specPath, spec: deckSpec, mode: "automatic" });
  assert.equal(preflight.ok, true, preflight.failures.map(({ field, reason }) => `${field}: ${reason}`).join("\n"));
  await writeFile(specPath, JSON.stringify(deckSpec));

  const generated = spawnSync(process.execPath, [resolve(root, "scripts/generate.mjs"), specPath, output], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.equal(generated.status, 0, `${generated.stdout}\n${generated.stderr}`);

  const composed = spawnSync(process.execPath, [resolve(root, "scripts/auto-compose.mjs"), specPath, output], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.equal(composed.status, 0, `${composed.stdout}\n${composed.stderr}`);

  const composition = JSON.parse(await readFile(join(output, "auto-composition-spec.json"), "utf8"));
  assert.equal(composition.bands.length, deckSpec.bands.length);
  for (const entry of composition.bands) {
    const source = deckSpec.bands[entry.band];
    const thesis = entry.elements.find((element) => element.id === "thesis");
    const callouts = entry.elements.filter((element) => /^callout-\d+-icon$/.test(element.id));
    const explanation = entry.elements.find((element) => element.id === "explanation");
    const visible = entry.elements.filter((element) => element.type === "text").map((element) => String(element.text ?? "")).join(" ");
    assert.equal(thesis.text, source.visual.thesis);
    assert.equal(callouts.length, 0, `${source.visual.family} generic callouts must use the editorial surface once`);
    assert.ok(explanation);
    for (const callout of source.visual.callouts) {
      assert.equal(visible.split(callout.label).length - 1, 1, `${source.visual.family} preserves callout label exactly once`);
      assert.equal(visible.split(callout.note).length - 1, 1, `${source.visual.family} preserves callout note exactly once`);
    }
  }

  const zoneBandIndex = deckSpec.bands.findIndex((band) => band.visual.left === "Left zone field");
  const zoneEntry = composition.bands.find((entry) => entry.band === zoneBandIndex);
  assert.ok(zoneEntry);
  for (const authoredText of [
    "Left zone field",
    "Middle zone field",
    "Right zone field",
    "Zone node 1",
    "A bounded upper note remains complete.",
    "Zone node 2",
    "A second upper note remains readable.",
    "Zone node 3",
    "A lower quadrant note that needs clearance from callouts.",
    "Zone node 4",
    "The final quadrant note remains complete and readable.",
    wideCalloutLabel,
    wideCalloutLabelTwo,
  ]) {
    assert.ok(zoneEntry.elements.some((element) => element.type === "text" && element.text.includes(authoredText)), authoredText);
  }

  const deck = JSON.parse(await readFile(join(output, "deck.excalidraw"), "utf8"));
  const zoneFrame = deck.elements.find((element) => element.id === `b${zoneBandIndex}-frame`);
  const zoneMembers = deck.elements.filter((element) => element.frameId === zoneFrame.id);
  for (const authoredText of [
    "Left zone field",
    "Middle zone field",
    "Right zone field",
    "Zone node 1",
    "A bounded upper note remains complete.",
    "Zone node 2",
    "A second upper note remains readable.",
    "Zone node 3",
    "A lower quadrant note that needs clearance from callouts.",
    "Zone node 4",
    "The final quadrant note remains complete and readable.",
    wideCalloutLabel,
    wideCalloutLabelTwo,
  ]) {
    assert.ok(zoneMembers.some((element) => String(element.text ?? element.label?.text ?? "").replace(/\s+/g, " ").includes(authoredText)), authoredText);
  }
});
