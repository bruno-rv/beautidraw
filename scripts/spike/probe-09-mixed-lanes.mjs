// Probe 9 — a mixed deck can contain a native structured band, a true
// composed scene, and a hybrid scene without hiding native placeholder cards
// underneath the custom frames.

import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { ROOT } from "../harness-runner.mjs";

const exec = promisify(execFile);
const work = await mkdtemp(resolve(tmpdir(), "beautidraw-mixed-"));
const baseSpecPath = resolve(work, "deck-spec.json");
const compositionPath = resolve(work, "composition-spec.json");
const assetPath = resolve(work, "pixel.png");
const outDir = resolve(work, "out");

const baseSpec = {
  title: "Mixed-lane acceptance",
  subtitle: "Structured, composed, and hybrid in one canvas",
  footer: "The delivered deck contains no fake placeholder cards",
  bands: [
    {
      heading: "A precise comparison stays structured",
      deck: "The native table is the clearest explanation",
      pattern: "comparison",
      accent: "blue",
      nodes: [
        { label: "Lookup", items: ["Known key", "One record"] },
        { label: "Retrieval", items: ["Ambiguous intent", "Ranked evidence"] },
      ],
    },
    {
      heading: "A concept becomes a scene",
      deck: "The visual itself carries the explanation",
      pattern: "canvas",
      accent: "violet",
      height: 620,
    },
    {
      heading: "Intuition and inspection share a frame",
      deck: "A visual zone and a precise annotation zone work together",
      pattern: "canvas",
      accent: "green",
      height: 660,
    },
  ],
};

const compositionSpec = {
  bands: [
    {
      band: 1,
      lane: "composed",
      surfaceColor: "#10231f",
      image: { file: "pixel.png", mode: "focal", use: "Carry the composed visual argument", description: "A focused raster scene anchors the composed frame", x: 0.375, y: 0.05, width: 0.25, height: 0.9, opacity: 100 },
      elements: [
        { id: "scene-label", type: "text", x: 0.08, y: 0.34, text: "Direct scene annotation", fontSize: 30, strokeColor: "#f8fafc" },
      ],
    },
    {
      band: 2,
      lane: "hybrid",
      surfaceColor: "#ffffff",
      image: { file: "pixel.png", mode: "focal", use: "Establish the hybrid visual zone", description: "A focused raster scene leaves room for inspectable annotations", x: 0.02, y: 0.08, width: 0.25, height: 0.84, opacity: 100 },
      elements: [
        { id: "hybrid-card", type: "rectangle", x: 0.54, y: 0.24, width: 0.38, height: 0.34, strokeColor: "#047857", backgroundColor: "#d1fae5", label: { text: "Evidence stays inspectable", fontSize: 26 } },
      ],
    },
  ],
};

// Valid 1×1 opaque PNG. Runtime fixture keeps binary data out of the repo.
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

await writeFile(baseSpecPath, JSON.stringify(baseSpec, null, 2));
await writeFile(compositionPath, JSON.stringify(compositionSpec, null, 2));
await writeFile(assetPath, pixel);

await exec(process.execPath, [resolve(ROOT, "scripts/generate.mjs"), baseSpecPath, outDir]);
const baseDeck = await readFile(resolve(outDir, "deck.excalidraw"));
await exec(process.execPath, [resolve(ROOT, "scripts/compose.mjs"), resolve(outDir, "deck.excalidraw"), compositionPath, outDir]);

const deck = JSON.parse(await readFile(resolve(outDir, "deck.excalidraw"), "utf8"));
const frames = deck.elements.filter((element) => element.type === "frame");
const composedMembers = deck.elements.filter((element) => element.frameId === "b1-frame");
const hybridMembers = deck.elements.filter((element) => element.frameId === "b2-frame");
const firstCompositionIds = deck.elements
  .filter((element) => element.customData?.beautidrawComposition === true && !element.containerId)
  .map((element) => element.id)
  .sort();
const firstCompositionCount = deck.elements.filter(
  (element) => element.customData?.beautidrawComposition === true,
).length;

await exec(process.execPath, [resolve(ROOT, "scripts/compose.mjs"), resolve(outDir, "deck.excalidraw"), compositionPath, outDir]);
const twice = JSON.parse(await readFile(resolve(outDir, "deck.excalidraw"), "utf8"));
const secondCompositionIds = twice.elements
  .filter((element) => element.customData?.beautidrawComposition === true && !element.containerId)
  .map((element) => element.id)
  .sort();
const secondCompositionCount = twice.elements.filter(
  (element) => element.customData?.beautidrawComposition === true,
).length;
const twiceIds = new Set(twice.elements.map((element) => element.id));
const frameChildrenAreUnique = twice.elements
  .filter((element) => element.type === "frame")
  .every(
    (frame) =>
      !frame.children ||
      (new Set(frame.children).size === frame.children.length && frame.children.every((id) => twiceIds.has(id))),
  );

const assertions = {
  threeFramesRemainInNarrativeOrder:
    frames.length === 3 && frames.map((frame) => frame.id).join(",") === "b0-frame,b1-frame,b2-frame",
  composedSceneHasImageAndDirectAnnotation:
    composedMembers.some((element) => element.type === "image") &&
    composedMembers.some((element) => element.id === "b1-scene-label" && element.type === "text") &&
    composedMembers.some(
      (element) =>
        element.id === "b1-composition-surface" &&
        element.type === "rectangle" &&
        element.backgroundColor === "#10231f",
    ),
  hybridSceneHasImageAndInspectableStructure:
    hybridMembers.some((element) => element.type === "image") &&
    hybridMembers.some((element) => element.id === "b2-hybrid-card" && element.type === "rectangle"),
  canvasFramesContainNoNativePlaceholderCards:
    ![...composedMembers, ...hybridMembers].some((element) => element.customData?.beautidrawNativeBody === true),
  assetsAreEmbedded: deck.files && Object.keys(deck.files).length === 1,
  compositionManifestRecordsBothUses:
    JSON.parse(await readFile(resolve(outDir, "composition-manifest.json"), "utf8")).assets.length === 2,
  secondRunIsIdempotent:
    JSON.stringify(firstCompositionIds) === JSON.stringify(secondCompositionIds) &&
    new Set(secondCompositionIds).size === secondCompositionIds.length &&
    firstCompositionCount === secondCompositionCount &&
    frameChildrenAreUnique,
  finalRendersExist:
    (await readFile(resolve(outDir, "scene.png"))).length > 0 &&
    (await readFile(resolve(outDir, "band-02.png"))).length > 0 &&
    (await readFile(resolve(outDir, "band-03.png"))).length > 0,
};

const expectComposeFailure = async (name, mutate, message) => {
  const bad = structuredClone(compositionSpec);
  mutate(bad);
  const badPath = resolve(work, `${name}.json`);
  await writeFile(badPath, JSON.stringify(bad, null, 2));
  await writeFile(resolve(outDir, "deck.excalidraw"), baseDeck);
  try {
    await exec(process.execPath, [resolve(ROOT, "scripts/compose.mjs"), resolve(outDir, "deck.excalidraw"), badPath, outDir]);
    return false;
  } catch (error) {
    return String(error.stderr).includes(message);
  }
};

assertions.rejectsUnknownImageMode = await expectComposeFailure(
  "bad-mode",
  (bad) => { bad.bands[0].image.mode = "wallpaper"; },
  "image.mode",
);
assertions.rejectsInvalidOpacity = await expectComposeFailure(
  "bad-opacity",
  (bad) => { bad.bands[0].image.opacity = 140; },
  "image.opacity",
);
assertions.rejectsDuplicateElementIds = await expectComposeFailure(
  "duplicate-id",
  (bad) => { bad.bands[0].elements.push({ ...bad.bands[0].elements[0] }); },
  "duplicate element id",
);
assertions.rejectsImageElementIdCollision = await expectComposeFailure(
  "image-id-collision",
  (bad) => { bad.bands[0].elements.push({ id: "composition-image", type: "text", x: 0.02, y: 0.02, text: "Collision", fontSize: 30, strokeColor: "#f8fafc" }); },
  "collides with a reserved composition id",
);
assertions.rejectsUnsupportedElementType = await expectComposeFailure(
  "bad-type",
  (bad) => { bad.bands[0].elements[0].type = "freedraw"; },
  "unsupported type",
);
assertions.rejectsMalformedPoints = await expectComposeFailure(
  "bad-points",
  (bad) => { bad.bands[0].elements.push({ id: "bad-arrow", type: "arrow", x: 0.1, y: 0.1, width: 0.4, height: 0.4, points: [[0, 0], [2, 1]] }); },
  "points",
);
assertions.rejectsPostConversionOverflow = await expectComposeFailure(
  "overflow",
  (bad) => { bad.bands[0].elements.push({ id: "overflowing-text", type: "text", x: 0.98, y: 0.5, text: "This measured text cannot fit inside the remaining body width", fontSize: 30, strokeColor: "#f8fafc" }); },
  "outside body bounds",
);
assertions.rejectsTransparentTextColor = await expectComposeFailure(
  "transparent-text",
  (bad) => { bad.bands[0].elements[0].strokeColor = "transparent"; },
  "text color must be a six-digit hex color",
);
assertions.rejectsTransparentCalloutOverImage = await expectComposeFailure(
  "transparent-callout",
  (bad) => {
    bad.bands[0].image.mode = "scene";
    bad.bands[0].elements.push({
      id: "transparent-callout",
      type: "rectangle",
      x: 0.4,
      y: 0.35,
      width: 0.2,
      height: 0.2,
      strokeColor: "#f8fafc",
      backgroundColor: "transparent",
      label: { text: "Unreadable over arbitrary imagery", fontSize: 26 },
    });
  },
  "image-overlapping callout requires an opaque six-digit hex fill",
);

console.log(JSON.stringify({ work, assertions }, null, 2));
const failed = Object.entries(assertions).filter(([, value]) => value !== true);
if (failed.length) {
  console.error("FAILED assertions:", failed.map(([key]) => key).join(", "));
  process.exit(1);
}
console.error("all assertions hold");
