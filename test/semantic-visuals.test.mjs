import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import {
  FONT,
  FONT_NAME,
  collectFontRequirements,
  fontForRole,
} from "../scripts/layout.mjs";
import {
  normalizeCallout,
  normalizeAnnotations,
  SEMANTIC_KINDS,
  validateSemanticVisuals,
} from "../scripts/outline.mjs";
import { preflightDeck } from "../scripts/preflight.mjs";

test("mono, handwritten, and prose roles route to their declared fonts", () => {
  assert.deepEqual(fontForRole("mono"), { family: FONT.mono, name: FONT_NAME.mono });
  assert.deepEqual(fontForRole("handwritten"), { family: FONT.handwritten, name: FONT_NAME.handwritten });
  assert.deepEqual(fontForRole("prose"), { family: FONT.prose, name: FONT_NAME.prose });
  assert.deepEqual(fontForRole("unknown"), { family: FONT.prose, name: FONT_NAME.prose });
});

test("semantic callouts accept exactly the four labelled kinds", () => {
  assert.deepEqual([...SEMANTIC_KINDS].sort(), ["boundary", "example", "inspect", "warning"]);
  assert.doesNotThrow(() => validateSemanticVisuals({
    callouts: [
      { kind: "example", label: "Example", note: "A concrete case" },
      { kind: "boundary", label: "Boundary", note: "A decision edge" },
      { kind: "inspect", label: "Inspect", note: "A source check" },
      { kind: "warning", label: "Warning", note: "A risk" },
    ],
  }));
  assert.throws(() => validateSemanticVisuals({ callouts: [{ kind: "question", label: "Question" }] }), /unsupported.*kind/i);
  assert.throws(() => validateSemanticVisuals({ callouts: [{ kind: "example", label: "" }] }), /label/i);
  assert.throws(() => validateSemanticVisuals({ callouts: [{ kind: "example", note: "missing label" }] }), /label/i);
  assert.deepEqual(normalizeCallout({ label: "Legacy" }, 0), { kind: "example", label: "Legacy", note: "" });
  assert.deepEqual(normalizeCallout("Legacy string", 1), { kind: "example", label: "Callout 2", note: "Legacy string" });
  assert.throws(() => normalizeCallout({ kind: "", label: "Blank" }, 0), /kind/i);
  assert.throws(() => normalizeCallout({ kind: "   ", label: "Whitespace" }, 0), /kind/i);
});

test("preflight rejects an explicitly empty callout kind but keeps omitted legacy kinds", async () => {
  const base = {
    title: "Title",
    subtitle: "Subtitle",
    footer: "Footer",
    bands: [{
      heading: "Canvas",
      deck: "Deck",
      pattern: "canvas",
      accent: "blue",
      height: 620,
      visual: { family: "spotlight", callouts: [{ label: "Legacy" }] },
    }],
  };
  assert.equal((await preflightDeck({ spec: structuredClone(base) })).ok, true);
  const invalid = structuredClone(base);
  invalid.bands[0].visual.callouts = [{ kind: "   ", label: "Blank" }];
  const result = await preflightDeck({ spec: invalid });
  assert.equal(result.ok, false);
  assert.match(result.failures.map((failure) => `${failure.field}: ${failure.reason}`).join("\n"), /callouts\[0\]\.kind.*non-empty/i);
});

test("auto-compose reports explicit empty kind as a structured preflight failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "beautidraw-empty-callout-kind-"));
  const specPath = join(directory, "deck.json");
  await writeFile(specPath, JSON.stringify({
    title: "Title",
    subtitle: "Subtitle",
    footer: "Footer",
    bands: [{
      heading: "Canvas",
      deck: "Deck",
      pattern: "canvas",
      accent: "blue",
      height: 620,
      visual: { family: "spotlight", callouts: [{ kind: "", label: "Blank" }] },
    }],
  }));
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, "../scripts/auto-compose.mjs"), specPath, join(directory, "out")], {
    cwd: resolve(import.meta.dirname, ".."),
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /callouts\[0\]\.kind.*non-empty|kind is required/i);
});

test("image descriptions are mandatory and distinct from their use", () => {
  assert.throws(() => validateSemanticVisuals({ image: { file: "scene.png", use: "Show the scene" } }), /description/i);
  assert.throws(() => validateSemanticVisuals({ image: { file: "scene.png", use: "Show the scene", description: "Show the scene" } }), /distinct/i);
});

test("font requirements include canvas prose, mono, and handwritten corpora", () => {
  const requirements = collectFontRequirements({
    title: "Title",
    subtitle: "Subtitle",
    footer: "Footer",
    bands: [{
      heading: "Canvas",
      deck: "Measured content",
      pattern: "canvas",
      accent: "blue",
      height: 620,
      visual: {
        family: "field",
        focus: "Focus /context",
        caption: "Caption",
        nodes: [{ label: "Node", note: "A paragraph" }],
        axisX: "specificity",
        axisY: "blast radius",
        explanation: "A paragraph",
        inspect: "node scripts/build-deck.mjs /context",
        annotation: "Short note",
        annotations: [{ text: "Second note" }],
      },
    }],
  });
  assert.ok(requirements.some((item) => item.role === "prose" && [...new Set("Focus")].every((character) => item.chars.includes(character))));
  assert.ok(requirements.some((item) => item.role === "mono" && item.family === FONT_NAME.mono && [...new Set("/context")].every((character) => item.chars.includes(character))));
  assert.ok(requirements.some((item) => item.role === "handwritten" && item.family === FONT_NAME.handwritten));
});

test("annotation and annotations normalize to ordered handwritten text descriptors", () => {
  assert.deepEqual(normalizeAnnotations("First note"), [{ text: "First note" }]);
  assert.deepEqual(normalizeAnnotations(["Second note", { text: "Third note", x: 0.5 }]), [
    { text: "Second note" },
    { text: "Third note", x: 0.5 },
  ]);
  assert.throws(() => normalizeAnnotations([{ label: "missing text" }]), /annotation.*text/i);
});

test("compose rejects traversal before reading an outside image", async () => {
  const root = await mkdtemp(join(tmpdir(), "beautidraw-compose-path-"));
  const compositionDir = join(root, "composition");
  const deckDir = join(root, "deck");
  await mkdir(compositionDir);
  await mkdir(deckDir);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await writeFile(join(root, "outside.png"), png);
  await writeFile(join(deckDir, "deck.excalidraw"), JSON.stringify({
    elements: [
      { id: "b0-deck", type: "text", x: 80, y: 100, width: 100, height: 20 },
      { id: "b0-frame", type: "frame", x: 0, y: 0, width: 2280, height: 620, children: [] },
    ],
    files: {},
  }));
  await writeFile(join(deckDir, "diagnostics.json"), JSON.stringify({ diagnostics: { bands: [{ index: 0, pattern: "canvas" }] } }));
  await writeFile(join(compositionDir, "composition.json"), JSON.stringify({ bands: [{
    band: 0,
    lane: "composed",
    surfaceColor: "#f8fafc",
    image: {
      file: "../outside.png",
      path: "assets/outside.png",
      mode: "side",
      use: "Use",
      description: "Description",
      x: 0,
      y: 0,
      width: 0.1,
      height: 0.1,
    },
  }] }));
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, "../scripts/compose.mjs"), join(deckDir, "deck.excalidraw"), join(compositionDir, "composition.json"), join(root, "out")], {
    cwd: resolve(import.meta.dirname, ".."),
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /deck-relative|portable|outside|traversal/i);
});

test("compose rejects an escaping image symlink before reading it", async () => {
  const root = await mkdtemp(join(tmpdir(), "beautidraw-compose-symlink-"));
  const compositionDir = join(root, "composition");
  const deckDir = join(root, "deck");
  await mkdir(compositionDir);
  await mkdir(deckDir);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const outside = join(root, "outside.png");
  await writeFile(outside, png);
  const symlink = join(compositionDir, "linked.png");
  await (await import("node:fs/promises")).symlink(outside, symlink);
  await writeFile(join(deckDir, "deck.excalidraw"), JSON.stringify({
    elements: [
      { id: "b0-deck", type: "text", x: 80, y: 100, width: 100, height: 20 },
      { id: "b0-frame", type: "frame", x: 0, y: 0, width: 2280, height: 620, children: [] },
    ],
    files: {},
  }));
  await writeFile(join(deckDir, "diagnostics.json"), JSON.stringify({ diagnostics: { bands: [{ index: 0, pattern: "canvas" }] } }));
  await writeFile(join(compositionDir, "composition.json"), JSON.stringify({ bands: [{
    band: 0,
    lane: "composed",
    surfaceColor: "#f8fafc",
    image: {
      file: "linked.png",
      path: "assets/linked.png",
      mode: "side",
      use: "Use",
      description: "Description",
      x: 0,
      y: 0,
      width: 0.1,
      height: 0.1,
    },
  }] }));
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, "../scripts/compose.mjs"), join(deckDir, "deck.excalidraw"), join(compositionDir, "composition.json"), join(root, "out")], {
    cwd: resolve(import.meta.dirname, ".."),
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /symlink|outside|realpath|contain/i);
});

test("preflight rejects an escaping semantic image symlink", async () => {
  const root = await mkdtemp(join(tmpdir(), "beautidraw-preflight-symlink-"));
  const outside = join(root, "outside.png");
  const linked = join(root, "linked.png");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await writeFile(outside, png);
  const deckRoot = join(root, "deck");
  await mkdir(deckRoot);
  await (await import("node:fs/promises")).symlink(outside, join(deckRoot, "linked.png"));
  const result = await preflightDeck({
    specPath: join(deckRoot, "spec.json"),
    spec: {
      title: "Title",
      subtitle: "Subtitle",
      footer: "Footer",
      bands: [{
        heading: "Canvas",
        deck: "Deck",
        pattern: "canvas",
        accent: "blue",
        height: 620,
        visual: {
          family: "illustration",
          image: { file: "linked.png", use: "Use", description: "Description" },
        },
      }],
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.failures.map((failure) => failure.reason).join("\n"), /symlink|outside|realpath|contain|escape|readable/i);
});
