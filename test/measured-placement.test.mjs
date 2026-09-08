import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { BODY_INSET, DECK_BODY_GAP, FRAME_PAD_BOTTOM } from "../scripts/layout.mjs";
import { preflightDeck } from "../scripts/preflight.mjs";

const root = resolve(import.meta.dirname, "..");

function overlaps(a, b) {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0
    && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0;
}

function elementText(element) {
  return String(element.text ?? element.label?.text ?? "");
}

function frameBody(deck, bandIndex) {
  const frame = deck.elements.find((element) => element.id === `b${bandIndex}-frame`);
  const deckLine = deck.elements.find((element) => element.id === `b${bandIndex}-deck`);
  assert.ok(frame && deckLine, `band ${bandIndex} must have a frame and deck line`);
  return {
    frame,
    x: frame.x + BODY_INSET,
    y: deckLine.y + deckLine.height + DECK_BODY_GAP,
    width: frame.width - 2 * BODY_INSET,
    height: frame.y + frame.height - FRAME_PAD_BOTTOM - (deckLine.y + deckLine.height + DECK_BODY_GAP),
  };
}

function assertInsideBody(members, body, label) {
  for (const element of members) {
    if (!Number.isFinite(element.width) || !Number.isFinite(element.height)) continue;
    assert.ok(element.x >= body.x - 0.5, `${label}: ${element.id} starts outside body`);
    assert.ok(element.y >= body.y - 0.5, `${label}: ${element.id} starts above body`);
    assert.ok(element.x + element.width <= body.x + body.width + 0.5, `${label}: ${element.id} exceeds body width`);
    assert.ok(element.y + element.height <= body.y + body.height + 0.5, `${label}: ${element.id} exceeds body height`);
  }
}

function runBuild(specPath, output) {
  return spawnSync(process.execPath, [resolve(root, "scripts/build-deck.mjs"), specPath, output], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
  });
}

test("over-capacity wrapped node labels fail without publishing a bad deck", { timeout: 120_000 }, async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "beautidraw-measured-node-placement-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const spec = {
    title: "Measured node placement",
    subtitle: "Long labels keep their notes readable",
    footer: "Placement fixture",
    bands: [{
      heading: "Field",
      deck: "A field with measured node labels",
      pattern: "canvas",
      accent: "blue",
      height: 500,
      visual: {
        family: "field",
        thesis: "A field thesis reserves readable space for the visual argument and its supporting labels.",
        focus: "Field focus",
        axisX: "specificity →",
        axisY: "blast radius ↑",
        nodes: [
          { label: "W".repeat(120), note: "Short note below the wrapped label." },
          { label: "Short node", note: "Second short note." },
          { label: "Third node", note: "Third note." },
          { label: "Fourth node", note: "Fourth note." },
        ],
        explanation: "A mechanism explanation preserves the authored relationship and keeps supporting notes readable.",
        example: "A concrete example keeps the field inspectable.",
        tradeoff: "A boundary makes the choice explicit.",
        evidence: ["Evidence verifies the node label and note placement remains complete in the final frame."],
        inspect: "inspect field geometry",
      },
    }],
  };
  const specPath = join(temp, "spec.json");
  const output = join(temp, "out");
  await writeFile(specPath, JSON.stringify(spec));
  const preflight = await preflightDeck({ specPath, spec });
  assert.equal(preflight.ok, true, preflight.failures.map(({ field, reason }) => `${field}: ${reason}`).join("\n"));
  const result = runBuild(specPath, output);
  if (result.status !== 0) {
    const generated = spawnSync(process.execPath, [resolve(root, "scripts/generate.mjs"), specPath, output], { cwd: root, encoding: "utf8", timeout: 120_000 });
    assert.equal(generated.status, 0, `${generated.stdout}\n${generated.stderr}`);
    const composed = spawnSync(process.execPath, [resolve(root, "scripts/auto-compose.mjs"), specPath, output], { cwd: root, encoding: "utf8", timeout: 120_000 });
    assert.notEqual(composed.status, 0);
    const compositionPath = join(output, "auto-composition-spec.json");
    await readFile(compositionPath, "utf8");
    const directOutput = join(temp, "direct");
    await mkdir(directOutput);
    const sentinel = join(directOutput, "deck.excalidraw");
    await writeFile(sentinel, "SENTINEL");
    const direct = spawnSync(process.execPath, [resolve(root, "scripts/compose.mjs"), join(output, "deck.excalidraw"), compositionPath, directOutput], { cwd: root, encoding: "utf8", timeout: 120_000 });
    assert.notEqual(direct.status, 0);
    assert.match(`${direct.stdout}\n${direct.stderr}`, /COMPOSITION VALIDATION FAILED:.*b0-field-3.*overlaps/);
    assert.equal(await readFile(sentinel, "utf8"), "SENTINEL", "failed compose must not publish an invalid deck");
    return;
  }
  const deck = JSON.parse(await readFile(join(output, "deck.excalidraw"), "utf8"));
  const body = frameBody(deck, 0);
  const members = deck.elements.filter((element) => element.frameId === body.frame.id && element.customData?.beautidrawComposition === true);
  assertInsideBody(members, body, "field-over-capacity");
  const cells = members.filter((element) => element.customData?.beautidrawCompositionKind !== "surface" && element.type !== "line" && element.type !== "arrow" && !element.containerId);
  for (let left = 0; left < cells.length; left += 1) {
    for (let right = left + 1; right < cells.length; right += 1) {
      assert.equal(overlaps(cells[left], cells[right]), false, `${cells[left].id} overlaps ${cells[right].id}`);
    }
  }
});

test("two-line node labels keep short notes below measured bounds", { timeout: 120_000 }, async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "beautidraw-measured-node-positive-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const spec = {
    title: "Measured node placement",
    subtitle: "A two-line label fixture",
    footer: "Placement fixture",
    bands: [{
      heading: "Field",
      deck: "A field with measured node labels",
      pattern: "canvas",
      accent: "blue",
      height: 500,
      visual: {
        family: "field",
        thesis: "A field thesis reserves readable space for the visual argument and its supporting labels.",
        focus: "Field focus",
        axisX: "specificity →",
        axisY: "blast radius ↑",
        nodes: [
          { label: "A measured boundary keeps the context readable while preserving the bounded decision", note: "Short note below the two-line label." },
          { label: "A second node", note: "Second short note." },
        ],
        explanation: "A mechanism explanation preserves the authored relationship and keeps supporting notes readable.",
        example: "A concrete example keeps the field inspectable.",
        tradeoff: "A boundary makes the choice explicit.",
        evidence: ["Evidence verifies the node label and note placement remains complete in the final frame."],
        inspect: "inspect field geometry",
      },
    }],
  };
  const specPath = join(temp, "spec.json");
  const output = join(temp, "out");
  await writeFile(specPath, JSON.stringify(spec));
  const result = runBuild(specPath, output);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const deck = JSON.parse(await readFile(join(output, "deck.excalidraw"), "utf8"));
  const body = frameBody(deck, 0);
  const members = deck.elements.filter((element) => element.frameId === body.frame.id && element.customData?.beautidrawComposition === true);
  assertInsideBody(members, body, "field-positive");
  const label = members.find((element) => element.id === "b0-field-1-label");
  const labelText = label?.type === "text" ? label : members.find((element) => element.containerId === label?.id);
  const note = members.find((element) => element.id === "b0-field-1-note");
  assert.ok(label && labelText && note, "positive label/note must survive composition");
  assert.ok(labelText.height > 40 && labelText.height < 90, "positive label must measure as exactly two lines");
  assert.ok(note.y >= label.y + label.height - 0.5, "note must start below the measured wrapped label");
  const visible = members.map(elementText).join(" ").replace(/\s+/g, " ");
  assert.equal(visible.includes("A measured boundary keeps the context readable while preserving the bounded decision"), true, "full label must remain visible");
  assert.equal(visible.includes("Short note below the two-line label."), true, "full note must remain visible");
});

test("data illustration header content stays clear of left and right images", { timeout: 180_000 }, async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "beautidraw-measured-data-header-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const source = JSON.parse(await readFile(resolve(root, "decks/llm-token-flow/deck-spec.json"), "utf8"));
  const bandIndex = source.bands.findIndex((band) => band.visual?.data?.kind === "token-sequence");
  assert.ok(bandIndex >= 0);
  await cp(resolve(root, "decks/llm-token-flow/assets"), join(temp, "assets"), { recursive: true });

  for (const side of ["left", "right"]) {
    const spec = structuredClone(source);
    const band = spec.bands[bandIndex];
    band.visual.thesis = "T".repeat(120);
    band.visual.focus = "F".repeat(120);
    band.visual.image.side = side;
    band.visual.callouts = [{ kind: "boundary", label: "Header boundary", note: "The boundary remains visible in the editorial column." }];
    const specPath = join(temp, `spec-${side}.json`);
    const output = join(temp, `out-${side}`);
    await writeFile(specPath, JSON.stringify(spec));
    const result = runBuild(specPath, output);
    assert.equal(result.status, 0, `${side}: ${result.stdout}\n${result.stderr}`);

    const deck = JSON.parse(await readFile(join(output, "deck.excalidraw"), "utf8"));
    const body = frameBody(deck, bandIndex);
    const members = deck.elements.filter((element) => element.frameId === body.frame.id && element.customData?.beautidrawComposition === true);
    assertInsideBody(members, body, side);
    const image = members.find((element) => element.id === `b${bandIndex}-composition-image`);
    assert.ok(image, `${side}: raster image must survive composition`);
    const textMembers = members.filter((element) => element.type === "text" || element.containerId);
    assert.equal(textMembers.some((element) => overlaps(element, image)), false, `${side}: text must not overlap the image`);
    const visible = members.map(elementText).join(" ");
    const compactVisible = visible.replace(/\s+/g, "");
    for (const authored of [band.visual.thesis, band.visual.focus, "Header boundary", "The boundary remains visible in the editorial column."]) {
      assert.equal(compactVisible.includes(authored.replace(/\s+/g, "")), true, `${side}: authored text must remain complete`);
    }
    assert.equal(image.width / image.height > 1.7 && image.width / image.height < 1.8, true, `${side}: image aspect must remain 16:9`);
  }
});
