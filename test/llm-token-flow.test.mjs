import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { withHarness } from "../scripts/harness-runner.mjs";

const root = resolve(import.meta.dirname, "..");
const deckDir = resolve(root, "decks/llm-token-flow");
const specPath = join(deckDir, "deck-spec.json");
const manifestPath = join(deckDir, "image-asset-manifest.json");

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const words = (value) => String(value ?? "").trim().split(/\s+/).filter(Boolean).length;
const portable = (value) => {
  assert.equal(typeof value, "string");
  assert.notEqual(value, "");
  assert.equal(value.startsWith("/"), false);
  assert.equal(value.startsWith("~"), false);
  assert.equal(value.split(/[\\/]/).includes(".."), false);
};

test("LLM token-flow exemplar has a stable, image-led learning contract", async () => {
  const spec = await readJson(specPath);
  const manifest = await readJson(manifestPath);
  const bands = spec.bands ?? [];
  const canvas = bands.filter((band) => band.pattern === "canvas");
  const structured = bands.filter((band) => band.pattern !== "canvas");

  assert.equal(bands.length, 8);
  assert.equal(canvas.length, 6);
  assert.equal(structured.length, 2);
  assert.deepEqual(
    bands.map((band) => band.heading),
    [
      "The whole pipeline",
      "Tokenizer boundaries",
      "One integer becomes a vector",
      "Inside one transformer block",
      "From scores to a sampled token",
      "Sampling controls change the shortlist",
      "Generation is a loop",
      "The mental model to keep",
    ],
  );

  let run = 0;
  let maxRun = 0;
  for (const band of bands) {
    run = band.pattern === "canvas" ? 0 : run + 1;
    maxRun = Math.max(maxRun, run);
  }
  assert.ok(maxRun <= 2, "structured frames must never run more than twice in sequence");
  assert.equal(bands[0].relation, "causal");
  assert.equal(bands[6].relation, "temporal");

  const imageBands = bands.filter((band) => band.visual?.image);
  const assets = manifest.images ?? manifest.assets ?? [];
  assert.equal(imageBands.length, 3);
  assert.equal(assets.length, 3);
  assert.deepEqual(
    assets.map((asset) => asset.file ?? asset.path).sort(),
    imageBands.map((band) => band.visual.image.file).sort(),
  );
  // Each raster supports exactly one thesis: pin which image illustrates
  // which frame so a future spec edit cannot silently swap scenes.
  assert.deepEqual(
    imageBands.map((band) => [band.heading, band.visual.image.file]),
    [
      ["The whole pipeline", "assets/pipeline-mechanism.png"],
      ["One integer becomes a vector", "assets/vector-lookup-space.png"],
      ["From scores to a sampled token", "assets/probability-selection.png"],
    ],
  );
  const bandNumber = (file) => bands.findIndex((band) => band.visual?.image?.file === file) + 1;
  for (const asset of assets) {
    assert.equal(asset.suggestedBand, bandNumber(asset.file ?? asset.path), `${asset.file ?? asset.path} suggestedBand must match its frame`);
  }
  for (const asset of assets) {
    const path = asset.file ?? asset.path;
    const visualImage = imageBands.find((band) => band.visual.image.file === path)?.visual.image;
    assert.equal(asset.source, path, `${path} must preserve its source path`);
    assert.equal(asset.use, visualImage.use);
    assert.equal(asset.description, visualImage.description);
    assert.notEqual(asset.use, asset.description);
    assert.deepEqual(asset.dimensions, { width: 1672, height: 941 });
    const bytes = await readFile(join(deckDir, path));
    assert.equal(createHash("sha1").update(bytes).digest("hex"), asset.sha1);
    assert.equal(bytes.readUInt32BE(16), 1672);
    assert.equal(bytes.readUInt32BE(20), 941);
  }

  const callouts = canvas.flatMap((band) => band.visual?.callouts ?? []);
  assert.ok(callouts.length >= 6);
  for (const callout of callouts) {
    assert.ok(["example", "boundary", "inspect", "warning"].includes(callout.kind));
    assert.ok(callout.label?.trim());
  }

  for (const band of canvas) {
    const visual = band.visual;
    assert.ok(visual.thesis?.trim());
    assert.ok(words(visual.explanation) >= 10);
    assert.ok(words(visual.example) >= 5);
    assert.ok(words(visual.tradeoff) >= 5);
    assert.ok(words(visual.inspect) >= 2);
    assert.ok(words(visual.explanation) + words(visual.example) + words(visual.tradeoff) + words(visual.inspect) >= 28);
  }
  assert.equal(bands[5].pattern, "comparison");
  assert.equal(bands[7].pattern, "checklist");
  assert.match(JSON.stringify(spec), /temperature|top-p|top-k/i);
  assert.match(JSON.stringify(spec), /embedding|attention|residual|softmax/i);
  assert.doesNotMatch(JSON.stringify(spec), /assets\/backgrounds|blackboard-asset-manifest/i);
  assert.doesNotMatch(JSON.stringify(manifest), /assets\/backgrounds|blackboard-asset-manifest/i);
});

test("composed token-flow exemplar survives the golden build inside the real editor", { timeout: 300_000 }, async (t) => {
  const spec = await readJson(specPath);
  const manifest = await readJson(manifestPath);
  const assets = manifest.assets ?? manifest.images;

  // Pin the two runtime-repair trigger paths in scripts/auto-compose.mjs:
  // the threshold family (frame 2) must stay authored, and an illustration
  // band must keep an inspect callout (frame 1), or these regressions stop
  // guarding composition.
  assert.equal(spec.bands[1].visual.family, "threshold", "frame 2 must keep the threshold family");
  assert.ok(
    spec.bands.some((band) => band.pattern === "canvas" && band.visual?.family === "illustration"
      && band.visual?.callouts?.some((callout) => callout.kind === "inspect")),
    "an illustration band must keep an inspect callout",
  );

  const output = await mkdtemp(join(tmpdir(), "beautidraw-tokenflow-contract-"));
  t.after(() => rm(output, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [resolve(root, "scripts/build-deck.mjs"), specPath, output], {
    cwd: root,
    encoding: "utf8",
    timeout: 240_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const deck = await readJson(join(output, "deck.excalidraw"));
  const compositionManifest = await readJson(join(output, "composition-manifest.json"));
  const outline = await readFile(join(output, "outline.md"), "utf8");
  const elements = deck.elements;
  const frames = elements.filter((element) => element.type === "frame");
  const expectedNames = spec.bands.map((band, index) => `${String(index + 1).padStart(2, "0")} ${band.heading}`);
  assert.deepEqual(frames.map((frame) => frame.name), expectedNames);
  assert.equal((await readdir(output)).filter((name) => /^band-\d+\.png$/.test(name)).length, 8);
  assert.equal(Object.keys(deck.files).length, 3);
  for (const asset of assets) assert.ok(deck.files[asset.sha1], `embedded file ${asset.file} must use its SHA-1 id`);

  assert.equal(compositionManifest.images.length, 3);
  for (const asset of compositionManifest.images) {
    const manifestAsset = assets.find((candidate) => candidate.file === asset.path);
    assert.ok(manifestAsset, `${asset.path} composition metadata must have a matching manifest asset`);
    portable(asset.path);
    assert.equal(asset.use, manifestAsset.use, `${asset.path} composition use must match manifest metadata`);
    assert.equal(asset.description, manifestAsset.description, `${asset.path} composition description must match manifest metadata`);
    assert.equal(asset.sha1, manifestAsset.sha1, `${asset.path} composition SHA-1 must match manifest metadata`);
    assert.deepEqual(asset.dimensions, { width: 1672, height: 941 }, `${asset.path} composition dimensions must match the normalized target`);
  }
  assert.doesNotMatch(JSON.stringify(compositionManifest), /(?:^|[" ])\/(?:Users|private|tmp)\//);
  assert.doesNotMatch(outline, /\/(?:Users|private|tmp)\//);
  const outlineHeadingOffsets = expectedNames.map((name) => outline.indexOf(`## ${name.replace(/`/g, "")}`));
  assert.ok(outlineHeadingOffsets.every((offset) => offset >= 0), "outline is missing an expected frame heading");
  for (let index = 1; index < outlineHeadingOffsets.length; index += 1) {
    assert.ok(outlineHeadingOffsets[index] > outlineHeadingOffsets[index - 1], "outline frame headings must remain in frame order");
  }

  // Threshold-family composition regression: frame 2 must emit its axis and
  // zone elements instead of crashing on an undefined text color.
  for (const id of ["b1-threshold-axis", "b1-left-zone", "b1-threshold", "b1-right-zone"]) {
    assert.ok(elements.some((element) => element.id === id), `threshold family must compose ${id}`);
  }

  // Semantic callouts survive with their kinds, and every bound label stays
  // inside its host frame — the inspect-icon label previously overflowed the
  // right page edge when sized like a full annotation column.
  const callouts = spec.bands.flatMap((band) => band.visual?.callouts ?? []);
  const semanticElements = elements.filter((element) => element.customData?.semanticKind);
  assert.equal(semanticElements.length, callouts.length, "every authored callout must survive composition as one semantic element");
  const frameById = new Map(frames.map((frame) => [frame.id, frame]));
  const semanticShapeByKind = { example: "ellipse", boundary: "diamond", inspect: "line", warning: "rectangle" };
  for (const element of semanticElements) {
    assert.equal(element.type, semanticShapeByKind[element.customData.semanticKind], `${element.id} shape must follow its semantic kind`);
    if (element.customData.semanticKind !== "inspect") continue;
    const labelId = element.customData.semanticLabelId;
    const label = elements.find((candidate) => candidate.id === labelId || candidate.customData?.semanticLabelFor === element.id);
    assert.ok(label?.text?.trim(), `${element.id} inspect icon must keep a visible label`);
    const hostFrame = frameById.get(label.frameId);
    assert.ok(hostFrame, `${label.id} must be bound to a frame`);
    assert.ok(
      label.x + label.width <= hostFrame.x + hostFrame.width + 0.5,
      `${label.id} must not overflow its frame's right edge`,
    );
  }
  for (const element of elements) {
    if (!element.frameId || ["line", "arrow"].includes(element.type)) continue;
    const hostFrame = frameById.get(element.frameId);
    assert.ok(
      element.x + element.width <= hostFrame.x + hostFrame.width + 0.5,
      `${element.id} must not overflow its frame horizontally`,
    );
  }

  for (const viewport of [{ width: 1600, height: 900 }, { width: 1280, height: 800 }]) {
    await withHarness(async ({ page }) => {
      const fidelity = await page.evaluate((scene) => window.__bdLoadScene(scene), deck);
      assert.equal(fidelity.state, "ready", `${viewport.width}x${viewport.height}: generated deck must reach Ready`);
      assert.equal(fidelity.frames.length, 8);
      assert.equal(fidelity.imageRegions.length, 3);
      for (const frame of fidelity.frames) {
        assert.ok(frame.minimumEffectiveTextPx >= 12, `${frame.frameId}: note text must remain legible`);
        assert.deepEqual(frame.clippedElementIds, []);
        assert.deepEqual(frame.overlapElementIds, []);
        assert.deepEqual(frame.obscuredByChromeElementIds, []);
        assert.deepEqual(frame.geometryElementIds, []);
      }
    }, { viewport });
  }
});
