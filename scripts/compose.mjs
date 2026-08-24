// Fill `canvas` bands in a generated Beautidraw deck with deterministic,
// frame-relative Excalidraw compositions.
//
// Usage:
//   node scripts/compose.mjs <deck.excalidraw> <composition-spec.json> <outdir>

// Coordinates in composition-spec.json are normalized to the band's body
// area (0..1). The script converts them through Excalidraw's browser API,
// embeds PNG assets, preserves frame ordering, and rerenders the final deck.

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, normalize, resolve } from "node:path";
import { BODY_INSET, BOUND_TEXT_PADDING, DECK_BODY_GAP, FRAME_PAD_BOTTOM, FONT, PAGE_WIDTH, USABLE_H, USABLE_W } from "./layout.mjs";
import { runCli } from "./cli.mjs";
import { readJsonInput, resolveAssetWithinRoot } from "./preflight.mjs";

const usage = "usage: node scripts/compose.mjs <deck.excalidraw> <composition-spec.json> <outdir>\n       embeds composed canvas frames into a generated deck and rerenders it.";
const status = await runCli("compose", async ({ values }) => {
const { deckArg, compositionArg, outArg } = values;

const deckPath = resolve(deckArg);
const compositionPath = resolve(compositionArg);
const compositionDir = dirname(compositionPath);
const outDir = resolve(outArg);
async function readJsonOrExit(path, label) {
  return readJsonInput(path, { label });
}
const deck = await readJsonOrExit(deckPath, "deck");
const spec = await readJsonOrExit(compositionPath, "composition spec");
const diagnostics = await readJsonOrExit(resolve(dirname(deckPath), "diagnostics.json"), "layout diagnostics");

if (!Array.isArray(spec.bands) || spec.bands.length === 0) {
  throw new Error("composition-spec.bands must be a non-empty array");
}

const canvasBands = new Set(
  (diagnostics.diagnostics?.bands ?? [])
    .filter((band) => band.pattern === "canvas")
    .map((band) => band.index),
);
const requestedBands = new Set();
const imageModes = new Set(["scene", "side", "focal", "background"]);
const elementTypes = new Set(["text", "rectangle", "ellipse", "diamond", "triangle", "line", "arrow"]);
const existingIds = new Set(
  deck.elements
    .filter((element) => element.customData?.beautidrawComposition !== true)
    .map((element) => element.id),
);
const requestedIds = new Set();
const hexColor = /^#[0-9a-f]{6}$/i;

const normalized = (value, where, { positive = false } = {}) => {
  if (!Number.isFinite(value) || value < 0 || value > 1 || (positive && value === 0)) {
    throw new Error(`${where} must be ${positive ? "greater than 0 and " : ""}between 0 and 1`);
  }
  return value;
};

const frames = new Map(
  deck.elements.filter((element) => element.type === "frame").map((frame) => [frame.id, frame]),
);

const bodyForBand = (band) => {
  const frameId = `b${band}-frame`;
  const frame = frames.get(frameId);
  if (!frame) throw new Error(`composition band ${band}: frame ${frameId} not found`);
  const deckLine = deck.elements.find((element) => element.id === `b${band}-deck`);
  if (!deckLine) throw new Error(`composition band ${band}: deck line not found`);
  const x = frame.x + BODY_INSET;
  const y = deckLine.y + deckLine.height + DECK_BODY_GAP;
  return {
    frame,
    frameId,
    x,
    y,
    width: frame.width - 2 * BODY_INSET,
    height: frame.y + frame.height - FRAME_PAD_BOTTOM - y,
  };
};

const files = { ...(deck.files ?? {}) };
const manifest = [];
const prepared = [];
const portablePath = (value, where) => {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    isAbsolute(value) ||
    value.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.split(/[\\/]/).includes("..")
  ) {
    throw new Error(`${where} must be a deck-relative path`);
  }
  const normalized = normalize(value);
  if (normalized === ".." || normalized.startsWith("../") || normalized.startsWith("..\\")) {
    throw new Error(`${where} must stay inside the deck directory`);
  }
  return normalized;
};

for (const entry of spec.bands) {
  if (!Number.isInteger(entry.band) || entry.band < 0) {
    throw new Error("composition band must be a non-negative integer");
  }
  if (requestedBands.has(entry.band)) throw new Error(`composition band ${entry.band}: duplicate entry`);
  requestedBands.add(entry.band);
  if (!canvasBands.has(entry.band)) {
    throw new Error(`composition band ${entry.band}: target must use pattern \"canvas\"`);
  }
  if (entry.lane !== "composed" && entry.lane !== "hybrid") {
    throw new Error(`composition band ${entry.band}: lane must be \"composed\" or \"hybrid\"`);
  }
  if (typeof entry.surfaceColor !== "string" || !hexColor.test(entry.surfaceColor)) {
    throw new Error(`composition band ${entry.band}: surfaceColor must be a six-digit hex color`);
  }

  const body = bodyForBand(entry.band);
  const skeletons = [];
  const surfaceId = `b${entry.band}-composition-surface`;
  if (existingIds.has(surfaceId)) throw new Error(`band ${entry.band}: surface id collides with the base deck`);
  requestedIds.add(surfaceId);
  skeletons.push({
    id: surfaceId,
    type: "rectangle",
    x: body.x,
    y: body.y,
    width: body.width,
    height: body.height,
    strokeColor: entry.surfaceColor,
    backgroundColor: entry.surfaceColor,
    strokeWidth: 0,
    roughness: 0,
    customData: { beautidrawCompositionKind: "surface" },
  });

  if (entry.image) {
    const image = entry.image;
    const imageFile = portablePath(image.file, `band ${entry.band} image file`);
    const imagePath = await resolveAssetWithinRoot(compositionDir, imageFile, {
      label: `band ${entry.band} image file`,
    });
    const bytes = await readFile(imagePath);
    const pngSignature = bytes.subarray(0, 8).toString("hex");
    if (pngSignature !== "89504e470d0a1a0a") throw new Error(`${image.file}: only PNG assets are supported`);
    const pixelWidth = bytes.readUInt32BE(16);
    const pixelHeight = bytes.readUInt32BE(20);
    const x = normalized(image.x, `band ${entry.band} image.x`);
    const y = normalized(image.y, `band ${entry.band} image.y`);
    const width = normalized(image.width, `band ${entry.band} image.width`, { positive: true });
    const height = normalized(image.height, `band ${entry.band} image.height`, { positive: true });
    if (x + width > 1 || y + height > 1) throw new Error(`band ${entry.band} image exceeds body bounds`);
    if (!imageModes.has(image.mode)) {
      throw new Error(`band ${entry.band} image.mode must be scene, side, focal, or background`);
    }
    if (typeof image.use !== "string" || image.use.trim() === "") {
      throw new Error(`band ${entry.band} image requires use`);
    }
    if (typeof image.description !== "string" || image.description.trim() === "") {
      throw new Error(`band ${entry.band} image requires description distinct from use`);
    }
    if (image.description.trim() === image.use.trim()) {
      throw new Error(`band ${entry.band} image description must be distinct from use`);
    }
    if (!Number.isFinite(image.opacity ?? 100) || (image.opacity ?? 100) < 1 || (image.opacity ?? 100) > 100) {
      throw new Error(`band ${entry.band} image.opacity must be from 1 to 100`);
    }
    const targetWidth = body.width * width;
    const targetHeight = body.height * height;
    const aspectDelta = Math.abs(pixelWidth / pixelHeight - targetWidth / targetHeight) / (targetWidth / targetHeight);
    if (aspectDelta > 0.02) {
      throw new Error(
        `band ${entry.band} image aspect ${pixelWidth}x${pixelHeight} does not match target ${targetWidth.toFixed(1)}x${targetHeight.toFixed(1)}`,
      );
    }
    const digest = createHash("sha1").update(bytes).digest("hex");
    const id = `b${entry.band}-composition-image`;
    if (existingIds.has(id) || requestedIds.has(id)) {
      throw new Error(`band ${entry.band}: image id collides with the base deck`);
    }
    requestedIds.add(id);
    skeletons.push({
      id,
      type: "image",
      x: body.x + body.width * x,
      y: body.y + body.height * y,
      width: targetWidth,
      height: targetHeight,
      fileId: digest,
      status: "saved",
      scale: [1, 1],
      crop: null,
      opacity: image.opacity ?? 100,
      customData: { beautidrawCompositionKind: "image", mode: image.mode },
    });
    files[digest] = {
      id: digest,
      mimeType: "image/png",
      dataURL: `data:image/png;base64,${bytes.toString("base64")}`,
      created: Date.now(),
    };
    manifest.push({
      path: portablePath(image.path ?? image.file, `band ${entry.band} image path`),
      sha1: digest,
      band: entry.band,
      mode: image.mode,
      use: image.use,
      description: image.description,
      pixelWidth,
      pixelHeight,
      dimensions: { width: pixelWidth, height: pixelHeight },
      targetWidth,
      targetHeight,
    });
  }

  for (const element of entry.elements ?? []) {
    if (typeof element.id !== "string" || !/^[a-z0-9-]+$/.test(element.id)) {
      throw new Error(`band ${entry.band} element id must use lowercase letters, digits, and hyphens`);
    }
    if (!elementTypes.has(element.type)) {
      throw new Error(`band ${entry.band} ${element.id}: unsupported type "${element.type}"`);
    }
    const finalId = `b${entry.band}-${element.id}`;
    if (requestedIds.has(finalId)) {
      if (element.id === "composition-image" || element.id === "composition-surface") {
        throw new Error(`band ${entry.band}: element id "${element.id}" collides with a reserved composition id`);
      }
      throw new Error(`band ${entry.band}: duplicate element id "${element.id}"`);
    }
    if (existingIds.has(finalId)) throw new Error(`band ${entry.band}: element id "${element.id}" collides with the base deck`);
    requestedIds.add(finalId);
    const x = normalized(element.x, `band ${entry.band} ${element.id}.x`);
    const y = normalized(element.y, `band ${entry.band} ${element.id}.y`);
    const skeleton = {
      ...element,
      id: finalId,
      x: body.x + body.width * x,
      y: body.y + body.height * y,
    };
    if (skeleton.customData?.semanticLabelId || skeleton.customData?.semanticLabelFor) {
      skeleton.customData = {
        ...skeleton.customData,
        ...(skeleton.customData.semanticLabelId
          ? { semanticLabelId: `b${entry.band}-${skeleton.customData.semanticLabelId}` }
          : {}),
        ...(skeleton.customData.semanticLabelFor
          ? { semanticLabelFor: `b${entry.band}-${skeleton.customData.semanticLabelFor}` }
          : {}),
      };
    }
    if (element.width != null) {
      const width = normalized(element.width, `band ${entry.band} ${element.id}.width`, { positive: true });
      if (x + width > 1) throw new Error(`band ${entry.band} ${element.id} exceeds body width`);
      skeleton.width = body.width * width;
    }
    if (element.height != null) {
      const height = normalized(element.height, `band ${entry.band} ${element.id}.height`, { positive: true });
      if (y + height > 1) throw new Error(`band ${entry.band} ${element.id} exceeds body height`);
      skeleton.height = body.height * height;
    }
    if (Array.isArray(element.points)) {
      if (!Number.isFinite(element.width) || !Number.isFinite(element.height)) {
        throw new Error(`band ${entry.band} ${element.id}: points require width and height`);
      }
      if (
        element.points.length < 2 ||
        !element.points.every(
          (point) =>
            Array.isArray(point) &&
            point.length === 2 &&
            point.every((value) => Number.isFinite(value) && value >= 0 && value <= 1),
        )
      ) {
        throw new Error(`band ${entry.band} ${element.id}: points must be normalized [x,y] tuples`);
      }
      skeleton.points = element.points.map(([px, py]) => [px * skeleton.width, py * skeleton.height]);
    } else if (element.type === "line" || element.type === "arrow") {
      throw new Error(`band ${entry.band} ${element.id}: points are required for ${element.type}`);
    }
    delete skeleton.lane;
    skeletons.push(skeleton);
  }

  if (skeletons.length === 0) throw new Error(`composition band ${entry.band}: image or elements required`);
  prepared.push({ entry, body, skeletons });
}

for (const band of canvasBands) {
  if (!requestedBands.has(band)) throw new Error(`canvas band ${band} has no composition entry`);
}

const { withHarness } = await import("./harness-runner.mjs");
const result = await withHarness(async ({ page }) =>
  page.evaluate(
    async ({ deck, prepared, files, validationConfig }) => {
      const api = window.__bdApi;
      const roleFontFamily = validationConfig.fontFamily;
      const sizeFromConvertedBounds = (item, skeletons = item.skeletons) => skeletons.map((skeleton) => {
        if (skeleton.type === "text" && skeleton.customData?.beautidrawMeasuredText) {
          const role = skeleton.role ?? "prose";
          const fontFamily = roleFontFamily[role] ?? roleFontFamily.prose;
          const [measured] = api.convertToExcalidrawElements([{
            id: `${skeleton.id}-measurement`,
            type: "text",
            x: 0,
            y: 0,
            text: skeleton.text,
            fontSize: skeleton.fontSize,
            fontFamily,
            role,
          }], { regenerateIds: false });
          const x = skeleton.x;
          const y = skeleton.y;
          const availableWidth = Math.min(
            item.body.x + item.body.width - x,
            Number.isFinite(skeleton.customData?.beautidrawMaxWidth)
              ? skeleton.customData.beautidrawMaxWidth * item.body.width
              : Number.POSITIVE_INFINITY,
          );
          if (measured.width <= availableWidth + 0.5) {
            return { ...skeleton, width: measured.width, height: measured.height, role, fontFamily };
          }
          if (availableWidth <= 2 * validationConfig.boundTextPadding) {
            throw new Error(`${skeleton.id}: converter-derived text has no available body width; shorten or reposition the authored text`);
          }
          const width = availableWidth;
          const [wrappedContainer] = api.convertToExcalidrawElements([{
            id: `${skeleton.id}-container-measurement`,
            type: "rectangle",
            x: 0,
            y: 0,
            width,
            strokeColor: "transparent",
            backgroundColor: "transparent",
            strokeWidth: 0,
            roughness: 0,
            label: {
              text: skeleton.text,
              fontSize: skeleton.fontSize,
              fontFamily,
              role,
              strokeColor: skeleton.strokeColor,
              roughness: 0,
            },
          }], { regenerateIds: false });
          const height = wrappedContainer.height;
          if (y + height > item.body.y + item.body.height + 0.5) {
            throw new Error(`${skeleton.id}: converter-derived text bounds exceed the composition body; shorten or reposition the authored text`);
          }
          return {
            id: skeleton.id,
            type: "rectangle",
            x,
            y,
            width,
            height,
            strokeColor: "transparent",
            backgroundColor: "transparent",
            strokeWidth: 0,
            roughness: 0,
            role,
            customData: { ...(skeleton.customData ?? {}), beautidrawTextContainer: true },
            label: {
              text: skeleton.text,
              fontSize: skeleton.fontSize,
              fontFamily,
              role,
              strokeColor: skeleton.strokeColor,
              roughness: 0,
            },
          };
        }
        if (!skeleton.customData?.beautidrawAutoSize || !skeleton.label) return skeleton;
        const role = skeleton.label.role ?? skeleton.role ?? "prose";
        const fontFamily = roleFontFamily[role] ?? roleFontFamily.prose;
        const [measured] = api.convertToExcalidrawElements([{
          id: `${skeleton.id}-measurement`,
          type: "text",
          x: 0,
          y: 0,
          text: skeleton.label.text,
          fontSize: skeleton.label.fontSize,
          fontFamily,
          role,
        }], { regenerateIds: false });
        const x = skeleton.x;
        const y = skeleton.y;
        const availableWidth = Math.min(
          item.body.x + item.body.width - x,
          Number.isFinite(skeleton.width) ? skeleton.width : Number.POSITIVE_INFINITY,
        );
        const width = Math.min(
          Math.max(measured.width + 2 * validationConfig.boundTextPadding, skeleton.width),
          availableWidth,
        );
        const [wrapped] = api.convertToExcalidrawElements([{
          id: `${skeleton.id}-container-measurement`,
          type: "rectangle",
          x: 0,
          y: 0,
          width,
          label: { ...skeleton.label, role, fontFamily },
        }], { regenerateIds: false });
        const height = wrapped.height;
        if (y + height > item.body.y + item.body.height + 0.5) {
          throw new Error(`${skeleton.id}: converter-derived label bounds exceed the composition body (y=${y.toFixed(1)}, height=${height.toFixed(1)}, bodyBottom=${(item.body.y + item.body.height).toFixed(1)}); shorten or reposition the authored text`);
        }
        return {
          ...skeleton,
          width,
          height,
          role,
          fontFamily,
          label: { ...skeleton.label, role, fontFamily },
        };
      });
      const annotationCandidates = [
        [0.05, 0.18], [0.30, 0.18], [0.55, 0.18],
        [0.05, 0.30], [0.30, 0.30], [0.55, 0.30],
        [0.05, 0.42], [0.30, 0.42], [0.55, 0.42],
        [0.05, 0.54], [0.30, 0.54], [0.55, 0.54],
        [0.05, 0.60], [0.30, 0.60], [0.55, 0.60],
        [0.05, 0.66], [0.30, 0.66], [0.55, 0.66],
        [0.05, 0.70], [0.30, 0.70], [0.55, 0.70],
      ];
      const annotationOverlaps = (a, b) =>
        Number.isFinite(a.width) && Number.isFinite(a.height) &&
        Number.isFinite(b.width) && Number.isFinite(b.height) &&
        Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0 &&
        Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0;
      const inside = (bounds, item) => {
        const { body } = item;
        const { frame } = body;
        return (
          bounds.x >= body.x - 0.5 &&
          bounds.y >= body.y - 0.5 &&
          bounds.x + bounds.width <= body.x + body.width + 0.5 &&
          bounds.y + bounds.height <= body.y + body.height + 0.5 &&
          bounds.x >= frame.x - 0.5 &&
          bounds.y >= frame.y - 0.5 &&
          bounds.x + bounds.width <= frame.x + frame.width + 0.5 &&
          bounds.y + bounds.height <= frame.y + frame.height + 0.5
        );
      };
      const byFrame = new Map();
      for (const item of prepared) {
        const annotationSkeletons = item.skeletons.filter((skeleton) => skeleton.customData?.beautidrawAnnotation === true);
        const familySkeletons = item.skeletons.filter((skeleton) => skeleton.customData?.beautidrawAnnotation !== true);
        const familySized = sizeFromConvertedBounds(item, familySkeletons);
        const familyConverted = api.convertToExcalidrawElements(familySized, { regenerateIds: false });
        const familyCollisionElements = familyConverted.filter(
          (element) => element && element.customData?.beautidrawCompositionKind !== "surface" &&
            !["line", "arrow"].includes(element.type),
        );
        const placedAnnotationBounds = [];
        const annotationConverted = [];
        for (const skeleton of annotationSkeletons) {
          const requested = [
            (skeleton.x - item.body.x) / item.body.width,
            (skeleton.y - item.body.y) / item.body.height,
          ];
          const candidates = [requested, ...annotationCandidates].filter(([x, y], index, all) =>
            Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1 &&
            all.findIndex(([otherX, otherY]) => otherX === x && otherY === y) === index,
          );
          let placed = null;
          for (const [x, y] of candidates) {
            const candidateSkeleton = {
              ...skeleton,
              x: item.body.x + item.body.width * x,
              y: item.body.y + item.body.height * y,
            };
            try {
              const sized = sizeFromConvertedBounds(item, [candidateSkeleton]);
              const [candidateBounds] = sized;
              if (!candidateBounds) continue;
              if (!inside(candidateBounds, item)) {
                continue;
              }
              if ([...familyCollisionElements, ...placedAnnotationBounds].filter(Boolean).some((element) => annotationOverlaps(candidateBounds, element))) {
                continue;
              }
              placed = { sized, candidateBounds };
              break;
            } catch {
              // A measured candidate that cannot fit is rejected like any other
              // collision; the field-addressed error below is the only output.
            }
          }
          if (!placed) {
            const field = skeleton.customData?.beautidrawAnnotationField ?? `band ${item.entry.band} ${skeleton.id}`;
            throw new Error(`${field}: annotation has no collision-free placement inside its frame/body`);
          }
          placedAnnotationBounds.push(placed.candidateBounds);
          annotationConverted.push(...api.convertToExcalidrawElements(placed.sized, { regenerateIds: false }));
        }
        const converted = [...familyConverted, ...annotationConverted].map((element) => ({
          ...element,
          frameId: item.body.frameId,
          boundElements: element.boundElements ?? [],
          customData: { ...(element.customData ?? {}), beautidrawComposition: true, lane: item.entry.lane },
        }));
        byFrame.set(item.body.frameId, converted);
      }

      const oldCompositionIds = new Set(
        deck.elements
          .filter((element) => element.customData?.beautidrawComposition === true)
          .map((element) => element.id),
      );
      const clean = deck.elements.filter((element) => !oldCompositionIds.has(element.id));
      const output = [];
      for (const element of clean) {
        if (element.type === "frame" && byFrame.has(element.id)) {
          const additions = byFrame.get(element.id);
          const baseChildren = (element.children ?? []).filter((id) => !oldCompositionIds.has(id));
          output.push(...additions);
          output.push({
            ...element,
            children: [...new Set([...baseChildren, ...additions.map((item) => item.id)])],
          });
        } else {
          output.push(element);
        }
      }

      const roleById = new Map(
        prepared.flatMap((item) => item.skeletons)
          .filter((element) => element.role || element.customData?.beautidrawRole)
          .map((element) => [element.id, element.role ?? element.customData.beautidrawRole]),
      );
      const restored = api.restoreElements(output, null).map((element) => {
        const role = element.role ?? element.customData?.beautidrawRole ?? roleById.get(element.id) ?? roleById.get(element.containerId);
        if (!role) return { ...element, boundElements: element.boundElements ?? [] };
        return {
          ...element,
          role,
          fontFamily: element.fontFamily ?? roleFontFamily[role] ?? roleFontFamily.prose,
          customData: { ...(element.customData ?? {}), beautidrawRole: role },
          boundElements: element.boundElements ?? [],
        };
      });
      const frames = restored.filter((element) => element.type === "frame");
      const frameById = new Map(frames.map((frame) => [frame.id, frame]));
      const elementById = new Map(restored.map((element) => [element.id, element]));
      const preparedByFrame = new Map(prepared.map((item) => [item.body.frameId, item]));
      const failures = [];
      const semanticKinds = new Set(["example", "boundary", "inspect", "warning"]);
      for (const icon of restored.filter((element) => element.customData?.semanticKind !== undefined)) {
        const kind = icon.customData.semanticKind;
        if (!semanticKinds.has(kind)) failures.push(`${icon.id}: unsupported semantic icon kind "${kind}"`);
        if (!icon.frameId) failures.push(`${icon.id}: semantic icon must belong to a frame`);
        const labelId = icon.customData.semanticLabelId;
        const label = (labelId ? elementById.get(labelId) : null) ?? restored.find(
          (element) => element.type === "text" && (
            element.containerId === icon.id || element.customData?.semanticLabelFor === icon.id
          ),
        );
        if (!label || label.type !== "text" || typeof label.text !== "string" || label.text.trim() === "") {
          failures.push(`${icon.id}: semantic icon must have a visible label`);
        }
      }

      for (const element of restored) {
        if (element.customData?.beautidrawComposition !== true || element.type !== "text") continue;
        const expectedFamily = roleFontFamily[element.role];
        if (!expectedFamily) failures.push(`${element.id}: unsupported text role "${element.role}"`);
        else if (element.fontFamily !== expectedFamily) {
          failures.push(`${element.id}: role "${element.role}" requires fontFamily ${expectedFamily}, got ${element.fontFamily}`);
        }
      }
      for (const container of restored.filter((element) => element.customData?.beautidrawAutoSize === true)) {
        const labelId = (container.boundElements ?? []).find((binding) => binding.type === "text")?.id;
        const label = labelId ? elementById.get(labelId) : null;
        if (!label) {
          failures.push(`${container.id}: converter-sized container is missing its bound label`);
          continue;
        }
        if (container.width + 0.5 < label.width + 2 * validationConfig.boundTextPadding) {
          failures.push(`${container.id}: converted label width exceeds measured container bounds`);
        }
        if (container.height + 0.5 < label.height + 2 * validationConfig.boundTextPadding) {
          failures.push(`${container.id}: converted label height exceeds measured container bounds`);
        }
      }

      const channel = (hex) => {
        const value = Number.parseInt(hex, 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (color) =>
        0.2126 * channel(color.slice(1, 3)) +
        0.7152 * channel(color.slice(3, 5)) +
        0.0722 * channel(color.slice(5, 7));
      const contrast = (a, b) => {
        const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (light + 0.05) / (dark + 0.05);
      };
      const overlaps = (a, b) =>
        Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0 &&
        Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0;

      for (const [frameId, item] of preparedByFrame) {
        const frame = frameById.get(frameId);
        const members = restored.filter(
          (element) =>
            element.frameId === frameId && element.customData?.beautidrawComposition === true,
        );
        for (const element of members) {
          const outside =
            element.x < item.body.x - 0.5 ||
            element.y < item.body.y - 0.5 ||
            element.x + element.width > item.body.x + item.body.width + 0.5 ||
            element.y + element.height > item.body.y + item.body.height + 0.5;
          if (outside) failures.push(`${element.id}: outside body bounds`);
          if (element.containerId && !elementById.has(element.containerId)) {
            failures.push(`${element.id}: bound-text container ${element.containerId} is missing`);
          }
          if (element.type === "text") {
            const zoom = Math.min(
              validationConfig.usableWidth / validationConfig.pageWidth,
              validationConfig.usableHeight / frame.height,
            );
            if (element.fontSize * zoom < 12) {
              failures.push(`${element.id}: effective text size ${(element.fontSize * zoom).toFixed(2)} is below 12px`);
            }
            if (!/^#[0-9a-f]{6}$/i.test(element.strokeColor)) {
              failures.push(`${element.id}: text color must be a six-digit hex color`);
              continue;
            }
            const container = element.containerId ? elementById.get(element.containerId) : null;
            const surface =
              container && /^#[0-9a-f]{6}$/i.test(container.backgroundColor)
                ? container.backgroundColor
                : item.entry.surfaceColor;
            if (contrast(element.strokeColor, surface) < 4.5) {
              failures.push(`${element.id}: text contrast is below 4.5:1`);
            }
          }
        }
        for (let i = 0; i < members.length; i++) {
          for (let j = i + 1; j < members.length; j++) {
            const a = members[i];
            const b = members[j];
            if (a.id === b.containerId || b.id === a.containerId) continue;
            if ([a.type, b.type].some((type) => type === "line" || type === "arrow")) continue;
            if (
              a.customData?.beautidrawCompositionKind === "surface" ||
              b.customData?.beautidrawCompositionKind === "surface"
            ) {
              continue;
            }
            const image = a.type === "image" ? a : b.type === "image" ? b : null;
            if (image && ["scene", "background"].includes(image.customData?.mode)) {
              const other = image === a ? b : a;
              if (other.type === "text" && overlaps(a, b)) {
                if (!other.containerId) {
                  failures.push(`${other.id}: direct text over an image requires a filled callout`);
                } else {
                  const container = elementById.get(other.containerId);
                  if (
                    !container ||
                    !/^#[0-9a-f]{6}$/i.test(container.backgroundColor) ||
                    container.opacity !== 100
                  ) {
                    failures.push(
                      `${other.id}: image-overlapping callout requires an opaque six-digit hex fill`,
                    );
                  }
                }
              }
              continue;
            }
            if (overlaps(a, b)) failures.push(`${a.id} overlaps ${b.id}`);
          }
        }
        if (frame.children && new Set(frame.children).size !== frame.children.length) {
          failures.push(`${frame.id}: duplicate child references`);
        }
      }
      if (failures.length) {
        throw new Error(`COMPOSITION VALIDATION FAILED:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
      }

      const bandPngs = [];
      for (const frame of frames) {
        const canvas = await api.exportToCanvas({
          elements: restored,
          appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
          files,
          exportingFrame: frame,
        });
        bandPngs.push(canvas.toDataURL("image/png"));
      }
      const scene = await api.exportToCanvas({
        elements: restored,
        appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
        files,
        exportPadding: 10,
      });
      return {
        deck: JSON.parse(api.serializeAsJSON(restored, deck.appState ?? { viewBackgroundColor: "#ffffff" }, files, "local")),
        bandPngs,
        scenePng: scene.toDataURL("image/png"),
      };
    },
    {
      deck,
      prepared,
      files,
      validationConfig: {
        pageWidth: PAGE_WIDTH,
        usableWidth: USABLE_W,
        usableHeight: USABLE_H,
        boundTextPadding: BOUND_TEXT_PADDING,
        fontFamily: { prose: FONT.prose, mono: FONT.mono, handwritten: FONT.handwritten },
      },
    },
  ),
);

await mkdir(outDir, { recursive: true });
// Same orphan rule as generate.mjs: a composition with fewer bands than the
// previous render must not leave stale band-NN.png files beside it.
const staleBand = (name) => /^band-\d{2}\.png$/.exec(name);
for (const name of await readdir(outDir)) {
  if (staleBand(name) && Number(staleBand(name)[1]) > result.bandPngs.length) {
    await rm(resolve(outDir, name));
  }
}
await writeFile(resolve(outDir, "deck.excalidraw"), JSON.stringify(result.deck, null, 2) + "\n");
for (let i = 0; i < result.bandPngs.length; i++) {
  await writeFile(
    resolve(outDir, `band-${String(i + 1).padStart(2, "0")}.png`),
    Buffer.from(result.bandPngs[i].split(",")[1], "base64"),
  );
}
await writeFile(resolve(outDir, "scene.png"), Buffer.from(result.scenePng.split(",")[1], "base64"));
await writeFile(
  resolve(outDir, "composition-manifest.json"),
  JSON.stringify({
    version: 1,
    assets: manifest,
    images: manifest,
    bands: spec.bands.map(({ band, lane }) => ({ band, lane })),
  }, null, 2) + "\n",
);
console.error(`OK: composed ${prepared.length} canvas bands in ${resolve(outDir, "deck.excalidraw")}`);
return 0;
}, { argv: process.argv.slice(2), usage, positional: ["deckArg", "compositionArg", "outArg"] });

process.exitCode = status;
