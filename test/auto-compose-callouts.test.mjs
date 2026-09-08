import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { preflightDeck } from "../scripts/preflight.mjs";

const root = resolve(import.meta.dirname, "..");

function node(index) {
  return { label: `Node ${index + 1}`, note: "A short supporting note" };
}

function callout(index) {
  return { kind: index === 0 ? "example" : "boundary", label: `Callout ${index + 1}`, note: "A short authored note" };
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
    ],
  };
}

test("field and matrix callouts compose below a max-length thesis", { timeout: 120_000 }, async (t) => {
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
    assert.equal(thesis.text, source.visual.thesis);
    assert.equal(callouts.length, source.visual.callouts.length);
    assert.ok(callouts.every((element) => element.y > thesis.y));
    assert.ok(explanation.y > Math.max(...callouts.map((element) => element.y)));
  }
});
