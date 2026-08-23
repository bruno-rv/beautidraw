// Embed frame-native PNG backgrounds into a generated beautidraw deck.
//
// Usage:
//   node scripts/embed-frame-backgrounds.mjs <deck.excalidraw> <manifest.json>
//
// The deck generator deliberately does not own images, so this post-process is
// the repeatable handoff step after `scripts/generate.mjs`.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { withHarness } from "./harness-runner.mjs";

function usage() {
  console.error("usage: node scripts/embed-frame-backgrounds.mjs <deck.excalidraw> <manifest.json>");
  process.exit(1);
}

function sha1(bytes) {
  return createHash("sha1").update(bytes).digest("hex");
}

const [, , deckPathArg, manifestPathArg] = process.argv;
if (!deckPathArg || !manifestPathArg) usage();

const deckPath = resolve(deckPathArg);
const manifestPath = resolve(manifestPathArg);
const manifestDir = dirname(manifestPath);
const deck = JSON.parse(await readFile(deckPath, "utf8"));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (!Array.isArray(deck.elements)) throw new Error("deck.elements must be an array");
if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
  throw new Error("manifest.assets must be a non-empty array");
}

const frames = deck.elements
  .filter((element) => element.type === "frame")
  .sort((a, b) => a.y - b.y);
if (frames.length !== manifest.assets.length) {
  throw new Error(`deck has ${frames.length} frames but manifest has ${manifest.assets.length} assets`);
}

const files = { ...(deck.files ?? {}) };
const skeletons = [];
const fileEntries = {};

for (let i = 0; i < manifest.assets.length; i++) {
  const asset = manifest.assets[i];
  const frame = frames[i];
  if (asset.frameId !== frame.id) {
    throw new Error(`asset ${i + 1} targets ${asset.frameId}, but frame order has ${frame.id}`);
  }

  const filePath = resolve(manifestDir, asset.file);
  const bytes = await readFile(filePath);
  const digest = sha1(bytes);
  if (digest !== asset.sha1) {
    throw new Error(`${asset.file}: SHA-1 ${digest} does not match manifest ${asset.sha1}`);
  }

  const imageId = `bbg-${String(i + 1).padStart(2, "0")}-${digest.slice(0, 12)}`;
  skeletons.push({
    id: imageId,
    type: "image",
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    angle: 0,
    fileId: digest,
    status: "saved",
    scale: [1, 1],
    crop: null,
    opacity: manifest.opacity ?? 22,
    frameId: frame.id,
    customData: { beautidrawBackground: true, mode: "background", suggestedBand: i + 1 },
  });
  fileEntries[digest] = {
    id: digest,
    mimeType: "image/png",
    dataURL: `data:image/png;base64,${bytes.toString("base64")}`,
  };
}

const oldBackgroundIds = new Set(
  deck.elements
    .filter((element) => element.customData?.beautidrawBackground === true)
    .map((element) => element.fileId)
    .filter(Boolean),
);
for (const fileId of oldBackgroundIds) delete files[fileId];
const existing = deck.elements.filter(
  (element) => element.customData?.beautidrawBackground !== true,
);

const result = await withHarness(async ({ page }) =>
  page.evaluate(
    ({ existingElements, imageSkeletons, appState }) => {
      const api = window.__bdApi;
      const images = api
        .convertToExcalidrawElements(imageSkeletons, { regenerateIds: false })
        .map((element) => ({ ...element, boundElements: element.boundElements ?? [] }));
      const imageByFrame = new Map(images.map((image) => [image.frameId, image]));
      const output = [];
      const inserted = new Set();

      for (const element of existingElements) {
        if (element.type === "text" && element.frameId && !inserted.has(element.frameId)) {
          const image = imageByFrame.get(element.frameId);
          if (image) {
            output.push(image);
            inserted.add(element.frameId);
          }
        }
        output.push(element);
      }
      for (const image of images) {
        if (inserted.has(image.frameId)) continue;
        const frameIndex = output.findIndex((element) => element.id === image.frameId);
        output.splice(frameIndex < 0 ? output.length : frameIndex, 0, image);
      }

      const restored = api
        .restoreElements(output, null)
        .map((element) => ({ ...element, boundElements: element.boundElements ?? [] }));
      const serialized = JSON.parse(
        api.serializeAsJSON(restored, appState ?? { viewBackgroundColor: "#ffffff" }, {}, "local"),
      );
      return { elements: restored, serialized };
    },
    { existingElements: existing, imageSkeletons: skeletons, appState: deck.appState },
  ),
);

const output = result.serialized;
output.source = deck.source ?? output.source;
output.files = { ...files, ...fileEntries };
await writeFile(deckPath, JSON.stringify(output, null, 2) + "\n");

console.error(
  `OK: embedded ${skeletons.length} frame backgrounds into ${deckPath}`,
);
