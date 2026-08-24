import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { withHarness } from "../scripts/harness-runner.mjs";

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

test("Claude Code exemplar satisfies its mixed-media contract", { timeout: 300_000 }, async () => {
  const spec = await readJson(specPath);
  const manifest = await readJson(manifestPath);
  const assets = manifest.assets ?? manifest.images;
  const imageBands = spec.bands.filter((band) => band.visual?.image);

  assert.equal(spec.bands.length, 14);
  assert.equal(imageBands.length, 4);
  assert.equal(assets.length, 4);
  assert.deepEqual(
    assets.map((asset) => asset.file ?? asset.path).sort(),
    imageBands.map((band) => band.visual.image.file).sort(),
    "manifest paths must exactly match visual image paths",
  );
  const imageMetadataByPath = new Map(imageBands.map((band) => [band.visual.image.file, band.visual.image]));
  for (const asset of assets) {
    const path = asset.file ?? asset.path;
    const image = imageMetadataByPath.get(path);
    assert.ok(image, `${path} must have matching visual metadata`);
    portable(path);
    assert.ok(asset.use?.trim(), `${asset.file ?? asset.path} needs a use`);
    assert.ok(asset.description?.trim(), `${asset.file ?? asset.path} needs a description`);
    assert.equal(asset.use, image.use, `${path} manifest use must match visual metadata`);
    assert.equal(asset.description, image.description, `${path} manifest description must match visual metadata`);
    assert.notEqual(asset.use.trim(), asset.description.trim());
    const bytes = await readFile(join(deckDir, path));
    assert.equal(createHash("sha1").update(bytes).digest("hex"), asset.sha1);
  }
  for (const band of imageBands) {
    portable(band.visual.image.file);
    assert.ok(band.visual.image.use?.trim(), `${band.heading} needs an image use`);
    assert.ok(band.visual.image.description?.trim(), `${band.heading} needs an image description`);
    assert.notEqual(band.visual.image.use.trim(), band.visual.image.description.trim());
  }

  const callouts = spec.bands.flatMap((band) => band.visual?.callouts ?? []);
  const expectedCalloutKinds = new Map([
    ["Enters context", "boundary"], ["Stays external", "boundary"],
    ["Billing path", "inspect"], ["User-owned", "boundary"],
    ["Project-owned", "boundary"], ["Private project state", "warning"],
    ["Shared landscape", "boundary"], ["Focused district", "example"],
    ["Normal order", "boundary"], ["Not one rule", "warning"],
    ["Isolation", "boundary"], ["Return value", "example"],
    ["Specialization", "example"], ["Lifecycle", "boundary"],
    ["Guidance", "example"], ["Enforcement", "warning"],
  ]);
  assert.ok(callouts.length > 0);
  for (const callout of callouts) {
    assert.equal(typeof callout, "object");
    assert.ok(["example", "boundary", "inspect", "warning"].includes(callout.kind), `${callout.label} must declare a semantic kind`);
    assert.equal(callout.kind, expectedCalloutKinds.get(callout.label), `${callout.label} has the wrong semantic kind`);
  }
  const inspectIcons = callouts.filter((callout) => callout?.kind === "inspect" && callout.label?.trim());
  assert.ok(inspectIcons.length, "the exemplar needs at least one labelled inspect icon");

  const inspections = spec.bands.map((band) => band.visual?.inspect).filter(Boolean);
  assert.ok(inspections.length >= 12, "the exemplar needs mono inspection commands across its frames");
  assert.ok(inspections.every((value) => /(?:\/[a-z][a-z0-9-]*|\b(?:claude|node|pnpm|git|cat|find)\b)/i.test(value)), "inspection text must contain a command or path token");

  const output = await mkdtemp(join(tmpdir(), "beautidraw-claude-contract-"));
  try {
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
  const expectedNames = spec.bands.map(frameName);
  assert.deepEqual(frames.map((frame) => frame.name), expectedNames);
  assert.equal((await readdir(output)).filter((name) => /^band-\d+\.png$/.test(name)).length, 14);
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
    assert.equal(asset.pixelWidth, manifestAsset.pixelWidth, `${asset.path} composition width must match manifest metadata`);
    assert.equal(asset.pixelHeight, manifestAsset.pixelHeight, `${asset.path} composition height must match manifest metadata`);
  }
  assert.doesNotMatch(JSON.stringify(compositionManifest), /(?:^|[" ])\/(?:Users|private|tmp)\//);
  assert.doesNotMatch(outline, /\/(?:Users|private|tmp)\//);
  const outlineHeadingOffsets = expectedNames.map((name) => outline.indexOf(`## ${name.replace(/`/g, "")}`));
  assert.ok(outlineHeadingOffsets.every((offset) => offset >= 0), "outline is missing an expected frame heading");
  for (let index = 1; index < outlineHeadingOffsets.length; index += 1) {
    assert.ok(outlineHeadingOffsets[index] > outlineHeadingOffsets[index - 1], "outline frame headings must remain in frame order");
  }

  const overview = new Map(elements.filter((element) => element.id.startsWith("deck-overview-")).map((element) => [element.id, element]));
  assert.deepEqual([...overview.keys()], ["deck-overview-map", "deck-overview-navigation", "deck-overview-small-screen"]);
  assert.equal(overview.get("deck-overview-map").text, expectedNames.join("\n"));
  assert.match(overview.get("deck-overview-navigation").text, /frame navigation/i);
  for (const element of overview.values()) assert.ok(!element.frameId);

  const monoInspections = elements.filter((element) => element.type === "text" && element.role === "mono" && /^Inspect:/i.test(element.text ?? ""));
  assert.equal(monoInspections.length, inspections.length, "inspection commands must remain mono text in the built scene");
  const semanticInspect = elements.find((element) => element.customData?.semanticKind === "inspect");
  assert.ok(semanticInspect, "built scene must include an inspect semantic icon");
  const inspectLabelId = semanticInspect.customData.semanticLabelId;
  const inspectLabel = elements.find((element) => element.id === inspectLabelId || element.customData?.semanticLabelFor === semanticInspect.id);
  assert.ok(inspectLabel?.text?.trim(), "inspect icon must have a visible label");
  const semanticElements = elements.filter((element) => element.customData?.semanticKind);
  assert.equal(semanticElements.length, callouts.length, "every authored callout must survive composition as one semantic element");
  for (const callout of callouts) {
    const rendered = semanticElements.find((element) => {
      const label = elements.find((candidate) => candidate.type === "text" && (
        candidate.containerId === element.id || candidate.customData?.semanticLabelFor === element.id
      ));
      return (element.label?.text ?? element.text ?? label?.text ?? "").includes(callout.label);
    });
    assert.equal(rendered?.customData?.semanticKind, callout.kind, `${callout.label} kind must survive composition`);
  }
  const shapeTypes = (prefix) => new Set(elements.filter((element) => new RegExp(`^${prefix}\\d+$`).test(element.id)).map((element) => element.type));
  for (const [prefix, expectedType] of [
    ["b1-field-", "ellipse"], ["b2-field-", "ellipse"],
    ["b4-evidence-", "rectangle"], ["b8-star-", "ellipse"],
    ["b11-satellite-", "ellipse"], ["b12-evidence-", "rectangle"],
    ["b13-quadrant-", "rectangle"],
  ]) {
    assert.deepEqual(shapeTypes(prefix), new Set([expectedType]), `${prefix} must use one relationship shape`);
  }
  const semanticShapeByKind = { example: "ellipse", boundary: "diamond", inspect: "line", warning: "rectangle" };
  for (const element of semanticElements) {
    assert.equal(element.type, semanticShapeByKind[element.customData.semanticKind], `${element.id} shape must follow its semantic kind`);
  }

    for (const viewport of [{ width: 1600, height: 900 }, { width: 1280, height: 800 }]) {
      await withHarness(async ({ page }) => {
        const fidelity = await page.evaluate((scene) => window.__bdLoadScene(scene), deck);
        assert.equal(fidelity.state, "ready", `${viewport.width}x${viewport.height}: generated deck must reach Ready`);
        assert.equal(fidelity.frames.length, 14);
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

    const generatedBound = elements.find((element) => element.type === "text" && element.containerId);
    assert.ok(generatedBound, "generated deck must contain a bound text element");
    for (const [mutation, mutate] of [
      ["text", (element) => { element.text += " stale generated text"; }],
      ["font", (element) => { element.fontSize += 1; }],
      ["line height", (element) => { element.lineHeight += 0.5; }],
      ["bogus role", (element) => { element.role = "bogus"; }],
      ["missing role", (element) => { delete element.role; }],
    ]) {
      const changed = structuredClone(deck);
      mutate(changed.elements.find((element) => element.id === generatedBound.id));
      const result = await withHarness(async ({ page }) =>
        page.evaluate((scene) => window.__bdLoadScene(scene), changed));
      assert.equal(result.state, "error", `${generatedBound.id}: generated ${mutation} mutation must fail fidelity`);
      assert.match(result.error.reason, /^Fidelity report failed/);
      assert.match(result.error.recovery, /geometry|bounds/i);
      assert.match(result.error.reason, new RegExp(generatedBound.id));
      assert.match(result.error.reason, new RegExp(generatedBound.containerId));
    }

    const missingSerializedRoles = structuredClone(deck);
    const missingRoleText = missingSerializedRoles.elements.find((element) => element.id === generatedBound.id);
    const missingRoleContainer = missingSerializedRoles.elements.find((element) => element.id === generatedBound.containerId);
    delete missingRoleText.role;
    delete missingRoleText.customData.beautidrawRole;
    delete missingRoleContainer.role;
    delete missingRoleContainer.customData.beautidrawRole;
    const missingSerializedRoleResult = await withHarness(async ({ page }) =>
      page.evaluate((scene) => window.__bdLoadScene(scene), missingSerializedRoles));
    assert.equal(missingSerializedRoleResult.state, "error", "generated bound label missing every role source must fail fidelity");
    assert.match(missingSerializedRoleResult.error.reason, /^Fidelity report failed/);
    assert.match(missingSerializedRoleResult.error.reason, new RegExp(generatedBound.id));
    assert.match(missingSerializedRoleResult.error.reason, new RegExp(generatedBound.containerId));

    const legacyLineHeight = structuredClone(deck);
    legacyLineHeight.elements.find((element) => element.id === generatedBound.id).lineHeight = 1.25;
    const legacyResult = await withHarness(async ({ page }) =>
      page.evaluate((scene) => window.__bdLoadScene(scene), legacyLineHeight));
    assert.ok(
      legacyResult.state === "ready" || (legacyResult.state === "error" && legacyResult.error?.code === "FIDELITY"),
      `${generatedBound.id}: generated lineHeight=1.25 must pass compatibility or fail as typed fidelity, got ${legacyResult.error?.reason ?? legacyResult.state}`,
    );
    if (legacyResult.state === "error") {
      assert.match(legacyResult.error.reason, new RegExp(generatedBound.id));
      assert.match(legacyResult.error.reason, new RegExp(generatedBound.containerId));
    }
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
