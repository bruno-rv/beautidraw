import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const deckDir = resolve(root, "decks/claude-code-artifacts");
const specPath = join(deckDir, "deck-spec.json");
const manifestPath = join(deckDir, "image-asset-manifest.json");

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const frameName = (band, index) => `${String(index + 1).padStart(2, "0")} ${band.heading}`;
const portable = (value) => {
  assert.equal(typeof value, "string");
  assert.notEqual(value, "");
  assert.equal(value.startsWith("/"), false);
  assert.equal(value.startsWith("~"), false);
  assert.equal(value.split(/[\\/]/).includes(".."), false);
};

test("Claude Code exemplar satisfies its mixed-media contract", { timeout: 120_000 }, async () => {
  const spec = await readJson(specPath);
  const manifest = await readJson(manifestPath);
  const assets = manifest.assets ?? manifest.images;
  const imageBands = spec.bands.filter((band) => band.visual?.image);

  assert.equal(spec.bands.length, 14);
  assert.equal(imageBands.length, 4);
  assert.equal(assets.length, 4);
  for (const asset of assets) {
    portable(asset.file ?? asset.path);
    assert.ok(asset.use?.trim(), `${asset.file ?? asset.path} needs a use`);
    assert.ok(asset.description?.trim(), `${asset.file ?? asset.path} needs a description`);
    assert.notEqual(asset.use.trim(), asset.description.trim());
    const bytes = await readFile(join(deckDir, asset.file ?? asset.path));
    assert.equal(createHash("sha1").update(bytes).digest("hex"), asset.sha1);
  }
  for (const band of imageBands) {
    portable(band.visual.image.file);
    assert.ok(band.visual.image.use?.trim(), `${band.heading} needs an image use`);
    assert.ok(band.visual.image.description?.trim(), `${band.heading} needs an image description`);
    assert.notEqual(band.visual.image.use.trim(), band.visual.image.description.trim());
  }

  const callouts = spec.bands.flatMap((band) => band.visual?.callouts ?? []);
  const inspectIcons = callouts.filter((callout) => callout?.kind === "inspect" && callout.label?.trim());
  assert.ok(inspectIcons.length, "the exemplar needs at least one labelled inspect icon");

  const inspections = spec.bands.map((band) => band.visual?.inspect).filter(Boolean);
  assert.ok(inspections.length >= 12, "the exemplar needs mono inspection commands across its frames");
  assert.ok(inspections.every((value) => /(?:\/[a-z][a-z0-9-]*|\b(?:claude|node|pnpm|git|cat|find)\b)/i.test(value)), "inspection text must contain a command or path token");

  const output = await mkdtemp(join(tmpdir(), "beautidraw-claude-contract-"));
  const result = spawnSync(process.execPath, [resolve(root, "scripts/build-deck.mjs"), specPath, output], {
    cwd: root,
    encoding: "utf8",
    timeout: 110_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const deck = await readJson(join(output, "deck.excalidraw"));
  const compositionManifest = await readJson(join(output, "composition-manifest.json"));
  const outline = await readFile(join(output, "outline.md"), "utf8");
  const elements = deck.elements;
  const frames = elements.filter((element) => element.type === "frame");
  const expectedNames = spec.bands.map(frameName);
  assert.deepEqual(frames.map((frame) => frame.name), expectedNames);
  assert.equal((await readdir(output)).filter((name) => /^band-\d+\.png$/.test(name)).length, 14);
  assert.equal(Object.keys(deck.files).length, 4);
  for (const asset of assets) assert.ok(deck.files[asset.sha1], `embedded file ${asset.file ?? asset.path} must use its SHA-1 id`);
  assert.equal(compositionManifest.images.length, 4);
  for (const asset of compositionManifest.images) portable(asset.path);
  assert.doesNotMatch(JSON.stringify(compositionManifest), /(?:^|[" ])\/(?:Users|private|tmp)\//);
  assert.doesNotMatch(outline, /\/(?:Users|private|tmp)\//);
  for (const name of expectedNames) {
    const heading = `## ${name.replace(/`/g, "")}`;
    assert.ok(outline.includes(heading), `outline is missing ${heading}`);
  }

  const overview = new Map(elements.filter((element) => element.id.startsWith("deck-overview-")).map((element) => [element.id, element]));
  assert.deepEqual([...overview.keys()], ["deck-overview-map", "deck-overview-navigation", "deck-overview-small-screen"]);
  assert.equal(overview.get("deck-overview-map").text, expectedNames.join("\n"));
  assert.match(overview.get("deck-overview-navigation").text, /frame navigation/i);
  for (const element of overview.values()) assert.ok(!element.frameId);

  const monoInspections = elements.filter((element) => element.type === "text" && element.role === "mono" && /inspect/i.test(element.id));
  assert.equal(monoInspections.length, inspections.length, "inspection commands must remain mono text in the built scene");
  const semanticInspect = elements.find((element) => element.customData?.semanticKind === "inspect");
  assert.ok(semanticInspect, "built scene must include an inspect semantic icon");
  const inspectLabelId = semanticInspect.customData.semanticLabelId;
  const inspectLabel = elements.find((element) => element.id === inspectLabelId || element.customData?.semanticLabelFor === semanticInspect.id);
  assert.ok(inspectLabel?.text?.trim(), "inspect icon must have a visible label");
});
