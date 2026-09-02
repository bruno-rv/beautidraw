import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { basename, join, resolve } from "node:path";
import { withHarness } from "../scripts/harness-runner.mjs";

const root = resolve(import.meta.dirname, "..");
const deckDir = resolve(root, "decks/rag-vector-graph");
const specPath = join(deckDir, "deck-spec.json");
const manifestPath = join(deckDir, "image-asset-manifest.json");
const assetDir = join(deckDir, "assets");

const expectedHeadings = [
  "RAG means relevance-selected evidence",
  "RAG versus a generic tool call",
  "Three questions that look alike",
  "Two pipelines, one handoff",
  "A vector is a point in meaning space",
  "Chunking controls signal quality",
  "Retrieval has several quality dials",
  "Where vector search lives",
  "Graph databases model connections directly",
  "One question can fan out across evidence types",
  "Vector, graph, keyword, hybrid",
  "From raw hits to usable context",
  "The litmus test: retrieve or look up?",
  "Choose memory by question shape",
  "Keep the answer honest",
];

const expectedImages = [
  ["RAG means relevance-selected evidence", "assets/evidence-selection.png"],
  ["A vector is a point in meaning space", "assets/vector-meaning-space.png"],
  ["Graph databases model connections directly", "assets/graph-traversal.png"],
  ["One question can fan out across evidence types", "assets/retriever-fanout.png"],
];

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const words = (value) => String(value ?? "").trim().split(/\s+/).filter(Boolean).length;
const portable = (value) => {
  assert.equal(typeof value, "string");
  assert.notEqual(value, "");
  assert.equal(value.startsWith("/"), false);
  assert.equal(value.startsWith("~"), false);
  assert.equal(value.split(/[\\/]/).includes(".."), false);
};

test("RAG, vector, and graph exemplar has a stable, image-led learning contract", async () => {
  const spec = await readJson(specPath);
  const manifest = await readJson(manifestPath);
  const bands = spec.bands ?? [];
  const canvas = bands.filter((band) => band.pattern === "canvas");
  const structured = bands.filter((band) => band.pattern !== "canvas");

  assert.equal(bands.length, 15);
  assert.equal(canvas.length, 12);
  assert.equal(structured.length, 3);
  assert.deepEqual(bands.map((band) => band.heading), expectedHeadings);

  let run = 0;
  let maxRun = 0;
  for (const band of bands) {
    run = band.pattern === "canvas" ? 0 : run + 1;
    maxRun = Math.max(maxRun, run);
  }
  assert.ok(maxRun <= 2, "structured frames must never run more than twice in sequence");

  const imageBands = bands.filter((band) => band.visual?.image);
  const assets = manifest.images ?? manifest.assets ?? [];
  assert.equal(imageBands.length, 4);
  assert.equal(assets.length, 4);
  assert.deepEqual(
    assets.map((asset) => asset.file ?? asset.path).sort(),
    imageBands.map((band) => band.visual.image.file).sort(),
  );
  // Each raster supports exactly one thesis: pin which image illustrates
  // which frame so a future spec edit cannot silently swap scenes.
  assert.deepEqual(
    imageBands.map((band) => [band.heading, band.visual.image.file]),
    expectedImages,
  );
  const bandNumber = (file) => bands.findIndex((band) => band.visual?.image?.file === file) + 1;
  for (const asset of assets) {
    assert.equal(asset.suggestedBand, bandNumber(asset.file ?? asset.path), `${asset.file ?? asset.path} suggestedBand must match its frame`);
  }
  for (const asset of assets) {
    const path = asset.file ?? asset.path;
    const visualImage = imageBands.find((band) => band.visual.image.file === path)?.visual.image;
    assert.ok(visualImage, `${path} must be used by one image band`);
    assert.equal(asset.use, visualImage.use);
    assert.equal(asset.description, visualImage.description);
    assert.notEqual(asset.use, asset.description);
    assert.deepEqual(asset.dimensions, { width: 1536, height: 864 });
    const bytes = await readFile(join(deckDir, path));
    assert.equal(createHash("sha1").update(bytes).digest("hex"), asset.sha1);
    assert.equal(bytes.readUInt32BE(16), 1536);
    assert.equal(bytes.readUInt32BE(20), 864);
  }

  const listedFiles = assets.map((asset) => basename(asset.file ?? asset.path)).sort();
  const diskFiles = (await readdir(assetDir)).sort();
  assert.deepEqual(diskFiles, listedFiles, "asset directory must contain exactly the four manifest files");

  const callouts = canvas.flatMap((band) => band.visual?.callouts ?? []);
  for (const callout of callouts) {
    assert.ok(["example", "boundary", "inspect", "warning"].includes(callout.kind));
    assert.ok(callout.label?.trim());
  }

  for (const band of canvas) {
    const visual = band.visual;
    assert.ok(visual, `${band.heading} canvas must have visual`);
    assert.ok(words(visual.explanation) >= 10, `${band.heading} explanation`);
    assert.ok(words(visual.example) >= 5, `${band.heading} example`);
    assert.ok(words(visual.tradeoff) >= 5, `${band.heading} tradeoff`);
    assert.ok(words(visual.inspect) >= 2, `${band.heading} inspect`);
    assert.ok(
      words(visual.explanation) + words(visual.example) + words(visual.tradeoff) + words(visual.inspect) >= 35,
      `${band.heading} canvas depth`,
    );
  }
  assert.equal(bands[2].pattern, "comparison");
  assert.equal(bands[7].pattern, "comparison");
  assert.equal(bands[12].pattern, "checklist");
  assert.doesNotMatch(JSON.stringify(spec), /assets\/backgrounds|blackboard-asset-manifest/i);
  assert.doesNotMatch(JSON.stringify(manifest), /assets\/backgrounds|blackboard-asset-manifest/i);
});

test("composed retrieval exemplar survives the golden build inside the real editor", { timeout: 300_000 }, async (t) => {
  const spec = await readJson(specPath);
  const manifest = await readJson(manifestPath);
  const assets = manifest.assets ?? manifest.images;

  const output = await mkdtemp(join(tmpdir(), "beautidraw-rag-contract-"));
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
  assert.equal(frames.length, 15);
  assert.deepEqual(frames.map((frame) => frame.name), expectedNames);
  assert.equal((await readdir(output)).filter((name) => /^band-\d+\.png$/.test(name)).length, 15);
  assert.equal(Object.keys(deck.files).length, 4);
  for (const asset of assets) assert.ok(deck.files[asset.sha1], `embedded file ${asset.file ?? asset.path} must use its SHA-1 id`);

  assert.equal(compositionManifest.images.length, 4);
  for (const asset of compositionManifest.images) {
    const manifestAsset = assets.find((candidate) => (candidate.file ?? candidate.path) === asset.path);
    assert.ok(manifestAsset, `${asset.path} composition metadata must have a matching manifest asset`);
    portable(asset.path);
    assert.equal(asset.use, manifestAsset.use, `${asset.path} composition use must match manifest metadata`);
    assert.equal(asset.description, manifestAsset.description, `${asset.path} composition description must match manifest metadata`);
    assert.equal(asset.sha1, manifestAsset.sha1, `${asset.path} composition SHA-1 must match manifest metadata`);
    assert.deepEqual(asset.dimensions, { width: 1536, height: 864 }, `${asset.path} composition dimensions must match the normalized target`);
  }
  assert.doesNotMatch(JSON.stringify(compositionManifest), /(?:^|[" ])\/(?:Users|private|tmp)\//);
  assert.doesNotMatch(outline, /\/(?:Users|private|tmp)\//);
  const outlineHeadingOffsets = expectedNames.map((name) => outline.indexOf(`## ${name.replace(/`/g, "")}`));
  assert.ok(outlineHeadingOffsets.every((offset) => offset >= 0), "outline is missing an expected frame heading");
  for (let index = 1; index < outlineHeadingOffsets.length; index += 1) {
    assert.ok(outlineHeadingOffsets[index] > outlineHeadingOffsets[index - 1], "outline frame headings must remain in frame order");
  }

  for (const viewport of [{ width: 1600, height: 900 }, { width: 1280, height: 800 }]) {
    await withHarness(async ({ page }) => {
      const fidelity = await page.evaluate((scene) => window.__bdLoadScene(scene), deck);
      assert.equal(fidelity.state, "ready", `${viewport.width}x${viewport.height}: generated deck must reach Ready`);
      assert.equal(fidelity.frames.length, 15);
      assert.equal(fidelity.imageRegions.length, 4);
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
