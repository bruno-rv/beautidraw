import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
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
  assert.ok(composed.filter((element) => element.type === "text").every((element) => ["prose", "mono", "handwritten"].includes(element.role)));
  assert.ok(composed.some((element) => element.type === "text" && element.role === "mono"));
  assert.ok(composed.filter((element) => element.customData?.semanticKind).every((element) => ["example", "boundary", "inspect", "warning"].includes(element.customData.semanticKind)));
  for (let index = 1; index <= frameCount; index += 1) {
    assert.equal(await exists(join(output, `band-${String(index).padStart(2, "0")}.png`)), true);
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
