import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, cp, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const claudeSpecPath = resolve(root, "decks/claude-code-artifacts/deck-spec.json");

const exists = async (path) => {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

test("a missing image preserves the previous output and leaves no stage residue", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "beautidraw-build-recovery-"));
  const output = join(tempRoot, "out");
  const specPath = join(tempRoot, "broken.json");
  const spec = JSON.parse(await readFile(claudeSpecPath, "utf8"));
  const image = spec.bands.find((band) => band.visual?.image)?.visual.image;
  image.file = "assets/does-not-exist.png";
  await writeFile(specPath, JSON.stringify(spec));
  await (await import("node:fs/promises")).mkdir(output);
  await writeFile(join(output, "sentinel.txt"), "last good build");

  const result = spawnSync(process.execPath, [resolve(root, "scripts/build-deck.mjs"), specPath, output], {
    cwd: root,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(await readFile(join(output, "sentinel.txt"), "utf8"), "last good build");
  const siblings = await readdir(dirname(output));
  assert.equal(siblings.some((name) => name.includes("stage-") || name.includes("backup-")), false);
});

test("a successful Claude build replaces the output with all six deliverables", { timeout: 120_000 }, async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "beautidraw-build-success-"));
  const output = join(tempRoot, "out");
  const result = spawnSync(process.execPath, [resolve(root, "scripts/build-deck.mjs"), claudeSpecPath, output], {
    cwd: root,
    encoding: "utf8",
    timeout: 110_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  for (const file of ["deck.excalidraw", "scene.png", "diagnostics.json", "composition-manifest.json", "outline.md"]) {
    assert.equal(await exists(join(output, file)), true, `${file} was not emitted`);
  }
  const deck = JSON.parse(await readFile(join(output, "deck.excalidraw"), "utf8"));
  const diagnostics = JSON.parse(await readFile(join(output, "diagnostics.json"), "utf8"));
  const frameCount = deck.elements.filter((element) => element.type === "frame").length;
  assert.equal(frameCount, 14);
  assert.equal(diagnostics.build.deliverables.bands.category, "band-png");
  assert.equal(diagnostics.build.deliverables.bands.count, frameCount);
  const composed = deck.elements.filter((element) => element.customData?.beautidrawComposition === true);
  const familyForRole = { prose: 6, mono: 3, handwritten: 5 };
  assert.ok(composed.filter((element) => element.type === "text").every((element) => ["prose", "mono", "handwritten"].includes(element.role)));
  assert.ok(composed.filter((element) => element.type === "text").every((element) => element.fontFamily === familyForRole[element.role]));
  assert.ok(composed.some((element) => element.type === "text" && element.role === "mono"));
  for (const container of composed.filter((element) => element.customData?.beautidrawAutoSize)) {
    const labelId = (container.boundElements ?? []).find((binding) => binding.type === "text")?.id;
    const label = composed.find((element) => element.id === labelId);
    assert.ok(label, `${container.id} has a converted label`);
    assert.ok(container.width >= label.width + 10 - 0.5, `${container.id} width is measured with padding`);
    assert.ok(container.height >= label.height + 10 - 0.5, `${container.id} height is measured with padding`);
  }
  assert.ok(composed.filter((element) => element.customData?.semanticKind).every((element) => ["example", "boundary", "inspect", "warning"].includes(element.customData.semanticKind)));
  for (let index = 1; index <= frameCount; index += 1) {
    assert.equal(await exists(join(output, `band-${String(index).padStart(2, "0")}.png`)), true);
  }
});

test("semantic composition preserves full authored text and handwritten annotations", { timeout: 120_000 }, async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "beautidraw-build-annotation-"));
  const output = join(tempRoot, "out");
  const spec = JSON.parse(await readFile(claudeSpecPath, "utf8"));
  const firstCanvas = spec.bands.find((band) => band.visual?.callouts?.length);
  firstCanvas.visual.callouts[0].note = "This authored label is intentionally long enough to prove that composition preserves every word without character-count ellipsis.";
  const orbitBand = spec.bands[1];
  orbitBand.visual.family = "orbit";
  orbitBand.visual.annotations = [
    { text: "Orbit annotation one", x: 0.41, y: 0.66 },
    { text: "Orbit annotation two" },
  ];
  const matrixBand = spec.bands.find((band) => band.visual?.family === "matrix");
  matrixBand.visual.annotations = [
    { text: "Matrix annotation one stays clear of quadrants.", x: 0.58, y: 0.51 },
    { text: "Matrix annotation two remains handwritten." },
  ];
  await cp(join(dirname(claudeSpecPath), "assets"), join(tempRoot, "assets"), { recursive: true });
  const specPath = join(tempRoot, "annotated.json");
  await writeFile(specPath, JSON.stringify(spec));
  const result = spawnSync(process.execPath, [resolve(root, "scripts/build-deck.mjs"), specPath, output], {
    cwd: root,
    encoding: "utf8",
    timeout: 110_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const deck = JSON.parse(await readFile(join(output, "deck.excalidraw"), "utf8"));
  const composed = deck.elements.filter((element) => element.customData?.beautidrawComposition === true);
  const annotations = composed.filter((element) => element.type === "text" && element.role === "handwritten");
  assert.ok(annotations.some((element) => element.text.includes("Orbit annotation one")));
  assert.ok(annotations.some((element) => element.text.includes("Orbit annotation two")));
  assert.ok(annotations.findIndex((element) => element.text.includes("Orbit annotation one")) < annotations.findIndex((element) => element.text.includes("Orbit annotation two")));
  assert.ok(composed.some((element) => element.type === "text" && element.text.includes("without character-count ellipsis")));

  const overlaps = (a, b) =>
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0 &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0;
  for (const frameId of ["b1-frame", "b13-frame"]) {
    const frame = deck.elements.find((element) => element.id === frameId);
    const members = composed.filter((element) => element.frameId === frameId);
    const frameAnnotations = members.filter((element) => element.type === "text" && element.role === "handwritten");
    assert.ok(frameAnnotations.length >= 2, `${frameId} has handwritten annotations`);
    for (const annotation of frameAnnotations) {
      assert.equal(annotation.frameId, frameId);
      assert.equal(annotation.fontFamily, 5);
      assert.ok(frame.children.includes(annotation.id), `${annotation.id} is a frame child`);
      assert.ok(annotation.x >= frame.x && annotation.y >= frame.y);
      assert.ok(annotation.x + annotation.width <= frame.x + frame.width);
      assert.ok(annotation.y + annotation.height <= frame.y + frame.height);
      for (const other of members) {
        if (other.id === annotation.id || other.customData?.beautidrawCompositionKind === "surface") continue;
        if (["line", "arrow"].includes(other.type)) continue;
        if (other.containerId === annotation.id || annotation.containerId === other.id) continue;
        assert.equal(overlaps(annotation, other), false, `${annotation.id} overlaps ${other.id}`);
      }
    }
  }
});

test("a missing final artifact preserves the previous output", { timeout: 120_000 }, async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "beautidraw-build-final-artifact-"));
  const output = join(tempRoot, "out");
  await (await import("node:fs/promises")).mkdir(output);
  await writeFile(join(output, "sentinel.txt"), "last good build");
  const result = spawnSync(process.execPath, [resolve(root, "scripts/build-deck.mjs"), claudeSpecPath, output], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, BEAUTIDRAW_TEST_OMIT_FINAL_ARTIFACT: "scene.png" },
    timeout: 110_000,
  });
  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(await readFile(join(output, "sentinel.txt"), "utf8"), "last good build");
  const siblings = await readdir(dirname(output));
  assert.equal(siblings.some((name) => name.includes("stage-") || name.includes("backup-")), false);
});
