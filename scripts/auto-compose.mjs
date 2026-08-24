// Turn semantic `visual` declarations in deck-spec.json into deterministic
// composed frames. The model describes the visual thesis; this file owns all
// normalized geometry and chooses a varied composition family.
//
// Usage:
//   node scripts/auto-compose.mjs <deck-spec.json> <outdir>

import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BODY_INSET, PAGE_WIDTH, RAMP, fontForRole } from "./layout.mjs";
import { CliError, runCli } from "./cli.mjs";
import { normalizeAnnotations } from "./outline.mjs";
import { preflightDeck, readJsonInput, resolveAssetWithinRoot } from "./preflight.mjs";

const exec = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const usage = "usage: node scripts/auto-compose.mjs <deck-spec.json> <outdir>\n       turns semantic `visual` declarations into composed canvas frames\n       (writes auto-composition-spec.json, then runs compose.mjs).";
const status = await runCli("auto-compose", async ({ values, debug }) => {
const { specArg, outArg } = values;

let spec;
try {
  spec = await readJsonInput(specArg, { label: "deck spec" });
} catch (error) {
  throw error;
}
const preflight = await preflightDeck({ specPath: specArg, spec });
if (!preflight.ok) {
  throw new CliError({
    command: "auto-compose",
    stage: "preflight",
    input: specArg,
    reason: preflight.failures.map((failure) => `${failure.field}: ${failure.reason}`).join("; "),
    recovery: "Fix the deck spec and rerun composition.",
  });
}
const specDir = dirname(resolve(specArg));
const outDir = resolve(outArg);
const families = ["illustration", "orbit", "field", "spotlight", "constellation", "evidence", "matrix", "threshold", "map"];
const sequentialFamilies = new Set(["pipeline", "journey"]);
const allowedFamilies = new Set([...families, "pipeline", "journey", "tension"]);
const lightSurface = "#f8fafc";
const darkSurface = "#0f172a";
const lightText = "#1e293b";
const darkText = "#f8fafc";
const SEMANTIC_KINDS = new Set(["example", "boundary", "inspect", "warning"]);

const palette = {
  blue: { stroke: "#1e3a5f", fill: "#dbeafe", dark: "#1e3a5f" },
  green: { stroke: "#047857", fill: "#d1fae5", dark: "#064e3b" },
  amber: { stroke: "#b45309", fill: "#fef3c7", dark: "#78350f" },
  red: { stroke: "#b91c1c", fill: "#fee2e2", dark: "#7f1d1d" },
  violet: { stroke: "#5b21b6", fill: "#ede9fe", dark: "#4c1d95" },
  slate: { stroke: "#334155", fill: "#e2e8f0", dark: "#1e293b" },
};
const accentOrder = ["blue", "violet", "green", "amber", "red", "slate"];

function clean(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeNode(node, index) {
  if (typeof node === "string") return { label: node, note: "" };
  return {
    label: clean(node?.label, `Node ${index + 1}`),
    note: clean(node?.note, ""),
  };
}

function nodeText(node) {
  return node.note ? `${node.label}\n${node.note}` : node.label;
}

function colorFor(meta, index, dark = false) {
  const token = meta.nodes[index]?.tone ?? accentOrder[index % accentOrder.length];
  const chosen = palette[token] ?? palette.blue;
  return { ...chosen, text: dark ? darkText : lightText };
}

function text(id, x, y, value, fontSize, strokeColor, role = "prose", customData = {}) {
  return {
    id,
    type: "text",
    x,
    y,
    text: value,
    fontSize,
    fontFamily: fontForRole(role).family,
    role,
    strokeColor,
    customData: { ...customData, beautidrawRole: role, beautidrawMeasuredText: true },
  };
}

function shape(id, type, x, y, width, height, value, colors, fontSize = 23, customData = {}) {
  const role = "prose";
  const font = fontForRole(role);
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    strokeColor: colors.stroke,
    backgroundColor: colors.fill,
    strokeWidth: customData.semanticKind ? 3 : undefined,
    role,
    customData: { beautidrawRole: role, beautidrawAutoSize: true, ...customData },
    ...(type === "line" || type === "arrow" ? { points: [[0, 0.5], [1, 0.5]] } : {}),
    label: { text: value, fontSize, fontFamily: font.family, role, strokeColor: colors.text },
  };
}

function arrowBetween(id, ax, ay, bx, by, strokeColor = "#94a3b8") {
  const x = Math.min(ax, bx);
  const y = Math.min(ay, by);
  const width = Math.max(Math.abs(bx - ax), 0.01);
  const height = Math.max(Math.abs(by - ay), 0.01);
  return {
    id,
    type: "arrow",
    x,
    y,
    width,
    height,
    points: [[(ax - x) / width, (ay - y) / height], [(bx - x) / width, (by - y) / height]],
    strokeColor,
    strokeWidth: 3,
  };
}

function line(id, x, y, width, height, points, strokeColor = "#94a3b8") {
  return { id, type: "line", x, y, width, height, points, strokeColor, strokeWidth: 3 };
}

function thesisLine(meta) {
  return meta.thesis
    ? [text("thesis", 0.05, 0.04, meta.thesis, 23, meta.dark ? darkText : lightText)]
    : [];
}

function metaForBand(band, index) {
  const visual = band.visual ?? {};
  const rawNodes = visual.nodes ?? band.nodes ?? [];
  const nodes = rawNodes.map(normalizeNode);
  while (nodes.length < 3) nodes.push({ label: ["Context", "Decision", "Result"][nodes.length], note: "" });
  const family = clean(visual.family, families[index % families.length]);
  if (!allowedFamilies.has(family)) throw new Error(`band ${index}: visual.family must be one of ${[...allowedFamilies].join(", ")}`);
  const dark = visual.surface === "dark" || (!visual.surface && ["orbit", "tension"].includes(family) && index % 2 === 0);
  return {
    family,
    dark,
    thesis: clean(visual.thesis, ""),
    focus: clean(visual.focus, band.heading),
    caption: clean(visual.caption, band.deck),
    explanation: clean(visual.explanation, band.deck),
    callouts: (Array.isArray(visual.callouts) ? visual.callouts : []).map((callout, calloutIndex) => {
      if (!callout || typeof callout !== "object" || Array.isArray(callout)) {
        throw new Error(`band ${index} callout ${calloutIndex + 1}: callout must declare kind and label`);
      }
      if (!Object.prototype.hasOwnProperty.call(callout, "kind")) {
        throw new Error(`band ${index} callout ${calloutIndex + 1}: kind is required`);
      }
      const kind = clean(callout.kind, "");
      if (!kind) throw new Error(`band ${index} callout ${calloutIndex + 1}: kind is required`);
      if (!SEMANTIC_KINDS.has(kind)) throw new Error(`band ${index} callout ${calloutIndex + 1}: unsupported semantic icon kind "${kind}"`);
      const label = clean(callout?.label, "");
      if (!label) throw new Error(`band ${index} callout ${calloutIndex + 1}: label is required`);
      return { kind, label, note: clean(callout?.note ?? callout?.text, "") };
    }),
    evidence: (visual.evidence ?? []).map((item) => clean(item, "")).filter(Boolean),
    tradeoff: clean(visual.tradeoff, ""),
    example: clean(visual.example, ""),
    inspect: clean(visual.inspect, ""),
    annotations: [
      ...normalizeAnnotations(visual.annotation).map((annotation, annotationIndex) => ({
        ...annotation,
        field: `bands[${index}].visual.annotation${Array.isArray(visual.annotation) ? `[${annotationIndex}]` : ""}`,
      })),
      ...normalizeAnnotations(visual.annotations).map((annotation, annotationIndex) => ({
        ...annotation,
        field: `bands[${index}].visual.annotations[${annotationIndex}]`,
      })),
    ],
    image: visual.image ?? null,
    bandHeight: band.height,
    nodes,
    left: clean(visual.left, nodes[0]?.label),
    middle: clean(visual.middle, nodes[1]?.label),
    right: clean(visual.right, nodes[2]?.label),
    decision: clean(visual.decision, nodes[3]?.label ?? "Effective choice"),
    axisX: clean(visual.axisX, "specificity →"),
    axisY: clean(visual.axisY, "blast radius ↑"),
  };
}

function annotationElements(meta, { x = 0.05, y = 0.66, maxWidth } = {}) {
  return meta.annotations.map((annotation, index) => text(
    `annotation-${index + 1}`,
    Number.isFinite(annotation.x) ? annotation.x : x,
    Number.isFinite(annotation.y) ? annotation.y : y + index * 0.04,
    annotation.text,
    18,
    meta.dark ? darkText : lightText,
    "handwritten",
    {
      beautidrawAnnotation: true,
      beautidrawAnnotationField: annotation.field,
      ...(maxWidth ? { beautidrawMaxWidth: maxWidth } : {}),
    },
  ));
}

function semanticIcon(kind, { id, x, y, size, label, strokeColor = "#475569", labelColor = strokeColor }) {
  if (!SEMANTIC_KINDS.has(kind)) throw new Error(`unsupported semantic icon kind "${kind}"`);
  const type = { example: "ellipse", boundary: "diamond", inspect: "line", warning: "rectangle" }[kind];
  const iconId = `${id}-icon`;
  const labelId = `${id}-label`;
  const icon = {
    id: iconId,
    type,
    x,
    y,
    width: size,
    height: type === "line" ? 0.01 : size,
    strokeColor,
    strokeWidth: 3,
    roughness: 0,
    customData: { semanticKind: kind, semanticLabelId: labelId },
  };
  if (type === "line") icon.points = [[0, 0.5], [1, 0.5]];
  const labelText = kind[0].toUpperCase() + kind.slice(1);
  const labelElement = text(
    labelId,
    x + size + 0.012,
    y,
    `${labelText}: ${label}`,
    RAMP.note,
    labelColor,
    "prose",
    { semanticLabelFor: iconId },
  );
  return [icon, labelElement];
}

function semanticType(kind, fallback) {
  // Excalidraw 0.18.1's triangle conversion does not survive restoreElements;
  // keep warnings as a supported filled shape while preserving their semantic
  // kind and warning palette in the serialized scene.
  return { example: "ellipse", boundary: "diamond", inspect: "line", warning: "rectangle" }[kind] ?? fallback;
}

function semanticCalloutShape(id, callout, x, y, width, height, colors, fontSize, fallbackType) {
  const type = semanticType(callout.kind, fallbackType);
  const icon = shape(
    id,
    type,
    x,
    y,
    width,
    height,
    `${callout.label}\n${callout.note}`,
    colors,
    fontSize,
    {
      semanticKind: callout.kind,
      ...(type === "line" ? { semanticLabelId: `${id}-label` } : {}),
    },
  );
  if (type !== "line") return [icon];
  return semanticIcon(callout.kind, {
    id,
    x,
    y,
    size: width,
    label: `${callout.label}${callout.note ? `: ${callout.note}` : ""}`,
    strokeColor: colors.stroke,
    labelColor: colors.text,
  });
}

function finish(meta, elements, extra = {}) {
  const textColor = meta.dark ? darkText : "#475569";
  const depthParts = [
    meta.explanation,
    meta.example ? `Example: ${meta.example}` : "",
    meta.tradeoff ? `Boundary: ${meta.tradeoff}` : "",
    ...meta.evidence.map((item) => `Evidence: ${item}`),
  ].filter(Boolean);
  elements.push(...annotationElements(meta));
  elements.push(text("explanation", 0.05, 0.80, depthParts.join("  •  "), RAMP.note, textColor, "prose", { beautidrawMaxWidth: 0.58 }));
  // Exact-font loading can wrap long commands to two lines; keep the command
  // above the body's bottom edge so converter-derived height, not fallback
  // metrics, decides whether it fits.
  if (meta.inspect) elements.push(text("inspect", 0.66, 0.80, `Inspect: ${meta.inspect}`, RAMP.note, textColor, "mono", { beautidrawMaxWidth: 0.29 }));
  return {
    lane: sequentialFamilies.has(meta.family) || meta.family === "matrix" ? "hybrid" : "composed",
    surfaceColor: meta.dark ? darkSurface : lightSurface,
    elements,
    ...extra,
  };
}

function orbit(meta) {
  const elements = thesisLine(meta);
  // The focal ellipse stays light-filled in both surfaces: it is the one
  // element the satellites' arrows imply, and #dbeafe with dark text keeps
  // its contrast where a dark fill would flatten it.
  const focusColors = { ...colorFor(meta, 0, meta.dark), fill: "#dbeafe", text: lightText };
  elements.push(shape("focus", "ellipse", 0.39, 0.36, 0.22, 0.22, meta.focus, focusColors, 26));
  // Ring top clears the thesis strip (y∈[0.03,0.16] on the left half) and
  // the ring bottom stays at y≤0.72 above the footer — same rules every
  // family obeys.
  const positions = [
    [0.41, 0.16], [0.72, 0.26], [0.72, 0.48],
    [0.41, 0.58], [0.09, 0.48], [0.09, 0.26],
  ];
  positions.slice(0, Math.min(meta.nodes.length, positions.length)).forEach(([x, y], index) => {
    const node = meta.nodes[index];
    const colors = colorFor(meta, index, meta.dark);
    if (meta.dark) colors.fill = colors.dark;
    elements.push(shape(`node-${index + 1}`, "ellipse", x, y, 0.19, 0.14, nodeText(node), colors));
  });
  return finish(meta, elements);
}

function field(meta) {
  const textColor = meta.dark ? darkText : lightText;
  const axisColor = meta.dark ? "#94a3b8" : "#64748b";
  const elements = thesisLine(meta);
  elements.push(line("field-x", 0.08, 0.50, 0.84, 0.01, [[0, 0.5], [1, 0.5]], axisColor));
  elements.push(line("field-y", 0.50, 0.15, 0.01, 0.70, [[0.5, 0], [0.5, 1]], axisColor));
  elements.push(text("field-x-label", 0.72, 0.04, meta.axisX, RAMP.note, textColor));
  elements.push(text("field-y-label", 0.04, 0.10, meta.axisY, RAMP.note, textColor));
  const positions = [[0.10, 0.16], [0.60, 0.16], [0.16, 0.40], [0.60, 0.40], [0.36, 0.26], [0.36, 0.40]];
  positions.slice(0, Math.min(meta.nodes.length, positions.length)).forEach(([x, y], index) => {
    const colors = colorFor(meta, index, meta.dark);
    if (meta.dark) colors.fill = colors.dark;
    const size = index < 2 ? [0.24, 0.16] : [0.18, 0.13];
    elements.push(shape(`field-${index + 1}`, "ellipse", x, y, size[0], size[1], nodeText(meta.nodes[index]), colors, RAMP.note));
  });
  return finish(meta, elements);
}

function spotlight(meta) {
  const elements = thesisLine(meta);
  // Same light focal treatment as orbit: the spotlighted idea must out-read
  // its callouts on either surface.
  const focusColors = { ...colorFor(meta, 0, meta.dark), fill: "#dbeafe", text: lightText };
  elements.push(shape("spotlight", "ellipse", 0.36, 0.28, 0.28, 0.27, meta.focus, focusColors, 29));
  // Bottom callout row rides at 0.46, not 0.53: a three-line bound label
  // expands its container downward past the declared box, and 0.53 + growth
  // grazed the 0.73 footer line on this band height.
  const positions = [[0.06, 0.16], [0.68, 0.16], [0.06, 0.52], [0.68, 0.52]];
  const callouts = meta.callouts.length ? meta.callouts.slice(0, positions.length) : meta.nodes.slice(0, positions.length).map((node) => ({ label: node.label, note: node.note }));
  callouts.forEach((callout, index) => {
    const [x, y] = positions[index];
    const colors = colorFor(meta, index + 1, meta.dark);
    if (meta.dark) colors.fill = colors.dark;
    elements.push(...semanticCalloutShape(
      `callout-${index + 1}`,
      callout,
      x,
      y,
      0.24,
      0.14,
      colors,
      RAMP.note,
      "rectangle",
    ));
  });
  return finish(meta, elements);
}

function constellation(meta) {
  const elements = thesisLine(meta);
  // star-2 sits below the thesis strip: at y=0.12 it grazed the one-line
  // thesis's worst-case rendered height on short bands.
  const positions = [[0.10, 0.18], [0.42, 0.14], [0.68, 0.18], [0.16, 0.46], [0.52, 0.44], [0.76, 0.46]];
  positions.slice(0, Math.min(meta.nodes.length, positions.length)).forEach(([x, y], index) => {
    const colors = colorFor(meta, index, meta.dark);
    if (meta.dark) colors.fill = colors.dark;
    elements.push(shape(`star-${index + 1}`, "ellipse", x, y, 0.18, 0.14, nodeText(meta.nodes[index]), colors, RAMP.note));
  });
  return finish(meta, elements);
}

function evidence(meta) {
  // The claim sits centred at (0.50, 0.42); the source columns' centroids
  // sit at (0.28, 0.42) and (0.72, 0.42). Arrows run from each column's
  // centroid toward the claim — two connectors, within the non-sequential
  // cap of three, and every arrow starts at a shape instead of floating
  // disconnected between the columns.
  const elements = thesisLine(meta);
  const claimColors = { ...colorFor(meta, 0, meta.dark), fill: "#d1fae5", text: lightText };
  elements.push(shape("claim", "diamond", 0.38, 0.31, 0.24, 0.22, meta.focus, claimColors, 26));
  // Bottom source row at 0.56 for the same bound-label-growth clearance as
  // spotlight: the left column sits inside the footer's x-range.
  const positions = [[0.05, 0.16], [0.71, 0.16], [0.05, 0.48], [0.71, 0.48]];
  const sources = meta.nodes.slice(0, 4);
  positions.forEach(([x, y], index) => {
    const colors = colorFor(meta, index + 1, meta.dark);
    if (meta.dark) colors.fill = colors.dark;
    elements.push(shape(`evidence-${index + 1}`, "rectangle", x, y, 0.23, 0.14, nodeText(sources[index]), colors, RAMP.note));
  });
  if (sources.length >= 2) {
    // From the left column's centroid (between its top and bottom sources)
    // toward the claim's upper-left corner region.
    elements.push(arrowBetween("evidence-arrow-left", 0.29, 0.26, 0.395, 0.37, meta.dark ? "#94a3b8" : "#64748b"));
    // Mirror image, from the right column toward the claim's upper-right.
    elements.push(arrowBetween("evidence-arrow-right", 0.71, 0.26, 0.605, 0.37, meta.dark ? "#94a3b8" : "#64748b"));
  }
  return finish(meta, elements);
}

function threshold(meta) {
  const dark = meta.dark;
  const elements = thesisLine(meta);
  const stroke = dark ? "#94a3b8" : "#64748b";
  elements.push(line("threshold-axis", 0.10, 0.53, 0.80, 0.01, [[0, 0.5], [1, 0.5]], stroke));
  const leftColors = colorFor(meta, 0, dark); const rightColors = colorFor(meta, 2, dark); const centerColors = colorFor(meta, 1, dark);
  if (dark) { leftColors.fill = leftColors.dark; rightColors.fill = rightColors.dark; centerColors.fill = centerColors.dark; }
  elements.push(shape("left-zone", "ellipse", 0.08, 0.32, 0.22, 0.18, meta.left, leftColors, RAMP.note));
  elements.push(shape("threshold", "diamond", 0.40, 0.39, 0.20, 0.22, meta.middle, centerColors, 24));
  elements.push(shape("right-zone", "ellipse", 0.70, 0.32, 0.22, 0.18, meta.right, rightColors, RAMP.note));
  elements.push(text("threshold-left", 0.08, 0.62, meta.nodes[0]?.note ?? "", RAMP.note, textColor));
  elements.push(text("threshold-right", 0.70, 0.62, meta.nodes[2]?.note ?? "", RAMP.note, textColor));
  return finish(meta, elements);
}

async function illustration(meta) {
  if (!meta.image?.file) throw new Error("illustration family requires visual.image.file");
  const imagePath = resolve(outDir, meta.image.file);
  const bytes = await readFile(imagePath);
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`${meta.image.file}: illustration assets must be PNG`);
  }
  const pixelWidth = bytes.readUInt32BE(16);
  const pixelHeight = bytes.readUInt32BE(20);
  const imageAspect = pixelWidth / pixelHeight;
  const bodyAspect = (PAGE_WIDTH - 2 * BODY_INSET) / meta.bandHeight;
  let height = 0.76;
  let width = imageAspect * height / bodyAspect;
  if (width > 0.52) {
    width = 0.52;
    height = width * bodyAspect / imageAspect;
  }
  const side = meta.image.side === "right" ? "right" : "left";
  const x = side === "left" ? 0.03 : 0.97 - width;
  const y = (1 - height) / 2;
  const textX = side === "left" ? Math.max(0.56, x + width + 0.05) : 0.05;
  const callouts = meta.callouts.length ? meta.callouts : meta.nodes.slice(0, 2).map((node) => ({ label: node.label, note: node.note }));
  const hasLongCallout = callouts.some((callout) => callout.note.length > 80);
  const calloutStart = 0.14;
  const calloutStep = hasLongCallout ? 0.40 : 0.28;
  const illustrationInspectY = hasLongCallout ? 0.74 : 0.62;
  const illustrationExplanationY = hasLongCallout ? 0.84 : 0.72;
  const textColor = meta.dark ? darkText : lightText;
  const mutedText = meta.dark ? "#cbd5e1" : "#475569";
  const elements = [
    text("thesis", textX, 0.08, meta.focus, 29, textColor, "prose", { beautidrawMaxWidth: 0.43 }),
  ];
  elements.push(...annotationElements(meta, { x: textX, y: 0.55, maxWidth: 0.43 }));
  callouts.slice(0, 2).forEach((callout, index) => {
    const colors = colorFor(meta, index + 1, meta.dark);
    if (meta.dark) colors.fill = colors.dark;
    elements.push(...semanticCalloutShape(
      `callout-${index + 1}`,
      callout,
      textX,
      calloutStart + index * calloutStep,
      0.43,
      0.14,
      colors,
      RAMP.note,
      "rectangle",
    ));
  });
  const depthParts = [
    meta.explanation,
    meta.example ? `Example: ${meta.example}` : "",
    meta.tradeoff ? `Boundary: ${meta.tradeoff}` : "",
    meta.evidence[0] ? `Evidence: ${meta.evidence[0]}` : "",
  ].filter(Boolean);
  elements.push(text("explanation", textX, illustrationExplanationY, depthParts.join("  •  "), RAMP.note, mutedText, "prose", { beautidrawMaxWidth: 0.43 }));
  if (meta.inspect) elements.push(text("inspect", textX, illustrationInspectY, `Inspect: ${meta.inspect}`, RAMP.note, mutedText, "mono", { beautidrawMaxWidth: 0.43 }));
  return {
    lane: "composed",
    surfaceColor: meta.dark ? darkSurface : lightSurface,
    image: {
      file: meta.image.file,
      path: meta.image.path,
      mode: "side",
      use: clean(meta.image.use, meta.caption),
      description: clean(meta.image.description, ""),
      x,
      y,
      width,
      height,
      opacity: 100,
    },
    elements,
  };
}

function pipeline(meta) {
  const elements = thesisLine(meta);
  const nodes = meta.nodes.slice(0, 6);
  const stepWidth = 0.13;
  nodes.forEach((node, index) => {
    const x = 0.03 + index * 0.16;
    const colors = colorFor(meta, index, meta.dark);
    if (meta.dark) colors.fill = colors.dark;
    elements.push(shape(`stage-${index + 1}`, "rectangle", x, 0.36, stepWidth, 0.20, nodeText(node), colors));
    if (index < nodes.length - 1) elements.push(arrowBetween(`stage-arrow-${index + 1}`, x + stepWidth, 0.46, x + 0.16, 0.46, meta.dark ? "#94a3b8" : "#64748b"));
  });
  return finish(meta, elements);
}

function map(meta) {
  const elements = thesisLine(meta);
  // Light focal fill on either surface, matching orbit/spotlight: the hub
  // must out-read its satellites.
  const centerColors = { ...colorFor(meta, 0, meta.dark), fill: "#d1fae5", text: lightText };
  elements.push(shape("hub", "diamond", 0.40, 0.34, 0.20, 0.20, meta.focus, centerColors, 26));
  // Two reserved strips every family honours: the thesis line owns
  // y∈[0.03, 0.16] on the left half (its rendered height varies with band
  // height, so nothing may enter that band at x<0.60), and the footer owns
  // everything below y=0.73 on the left half. Satellites thread between
  // them: side columns, a centre node under the thesis strip, a centre
  // node above the footer.
  const positions = [[0.08, 0.16], [0.70, 0.14], [0.05, 0.44], [0.73, 0.34], [0.42, 0.18], [0.67, 0.56]];
  positions.slice(0, Math.min(meta.nodes.length, positions.length)).forEach(([x, y], index) => {
    const node = meta.nodes[index];
    const colors = colorFor(meta, index + 1, meta.dark);
    if (meta.dark) colors.fill = colors.dark;
    elements.push(shape(`satellite-${index + 1}`, "ellipse", x, y, 0.19, 0.14, nodeText(node), colors));
  });
  return finish(meta, elements);
}

function journey(meta) {
  const elements = thesisLine(meta);
  const axisColor = meta.dark ? "#94a3b8" : "#64748b";
  elements.push(line("journey-axis", 0.07, 0.52, 0.86, 0.01, [[0, 0.5], [1, 0.5]], axisColor));
  const nodes = meta.nodes.slice(0, 6);
  nodes.forEach((node, index) => {
    const x = 0.07 + index * (0.86 / Math.max(nodes.length - 1, 1));
    // Even moments ride at 0.56, not 0.60: the first moment sits in the
    // explanation's x-range, and 0.60 + 0.14 height crosses the 0.73 footer.
    const y = index % 2 ? 0.56 : 0.30;
    const colors = colorFor(meta, index, meta.dark);
    if (meta.dark) colors.fill = colors.dark;
    elements.push(shape(`moment-${index + 1}`, "ellipse", Math.max(0, x - 0.07), y, 0.14, 0.14, nodeText(node), colors, RAMP.note));
    if (index < nodes.length - 1) {
      const nextX = 0.07 + (index + 1) * (0.86 / Math.max(nodes.length - 1, 1));
      elements.push(arrowBetween(`journey-arrow-${index + 1}`, x + 0.07, 0.52, nextX - 0.07, 0.52, axisColor));
    }
  });
  return finish(meta, elements);
}

function tension(meta) {
  const dark = meta.dark;
  const elements = thesisLine(meta);
  const leftColors = colorFor(meta, 0, dark); const rightColors = colorFor(meta, 2, dark);
  if (dark) {
    leftColors.fill = leftColors.dark;
    rightColors.fill = rightColors.dark;
  }
  const decisionColors = colorFor(meta, 1, dark); decisionColors.fill = dark ? decisionColors.dark : decisionColors.fill;
  const bottomColors = colorFor(meta, 3, dark); bottomColors.fill = dark ? bottomColors.dark : bottomColors.fill;
  elements.push(shape("left", "ellipse", 0.07, 0.30, 0.22, 0.19, meta.left, leftColors));
  elements.push(shape("decision", "diamond", 0.39, 0.27, 0.22, 0.24, meta.middle, decisionColors, 26));
  elements.push(shape("right", "ellipse", 0.71, 0.30, 0.22, 0.19, meta.right, rightColors));
  // The outcome rides at 0.58 (ends ≤0.72), not 0.73 — the footer starts
  // exactly there and the outcome box spans the explanation's x-range.
  elements.push(shape("outcome", "rectangle", 0.40, 0.58, 0.20, 0.11, meta.decision, bottomColors));
  elements.push(arrowBetween("left-arrow", 0.29, 0.41, 0.39, 0.40));
  elements.push(arrowBetween("right-arrow", 0.61, 0.41, 0.71, 0.40));
  elements.push(arrowBetween("outcome-arrow", 0.50, 0.52, 0.50, 0.57));
  return finish(meta, elements);
}

function matrix(meta) {
  const elements = thesisLine(meta);
  const axisColor = meta.dark ? "#94a3b8" : "#64748b";
  const labelColor = meta.dark ? darkText : "#475569";
  elements.push(line("x-axis", 0.06, 0.49, 0.88, 0.01, [[0, 0.5], [1, 0.5]], axisColor));
  elements.push(line("y-axis", 0.50, 0.15, 0.01, 0.70, [[0.5, 0], [0.5, 1]], axisColor));
  elements.push(text("axis-x-label", 0.72, 0.04, meta.axisX, RAMP.note, labelColor));
  elements.push(text("axis-y-label", 0.04, 0.04, meta.axisY, RAMP.note, labelColor));
  const nodes = meta.nodes.slice(0, 4);
  const positions = [[0.08, 0.18], [0.58, 0.18], [0.08, 0.51], [0.58, 0.51]];
  nodes.forEach((node, index) => {
    const colors = colorFor(meta, index, meta.dark);
    if (meta.dark) colors.fill = colors.dark;
    elements.push(shape(`quadrant-${index + 1}`, "rectangle", positions[index][0], positions[index][1], 0.34, 0.18, nodeText(node), colors));
  });
  const focusColors = colorFor(meta, 4); focusColors.fill = "#d1fae5"; focusColors.text = lightText;
  elements.push(shape("marker", "ellipse", 0.44, 0.42, 0.12, 0.12, meta.focus, focusColors, RAMP.note));
  return finish(meta, elements);
}

async function buildComposition(band, index) {
  const meta = metaForBand(band, index);
  if (meta.family === "illustration") {
    const source = await resolveAssetWithinRoot(specDir, meta.image.file, {
      label: `band ${index} image file`,
    });
    const stagedRelative = `__build-assets/band-${index}-${basename(meta.image.file)}`;
    const staged = resolve(outDir, stagedRelative);
    await mkdir(dirname(staged), { recursive: true });
    await copyFile(source, staged);
    meta.image = { ...meta.image, file: stagedRelative, path: meta.image.file };
  }
  const builders = { illustration, orbit, field, spotlight, constellation, evidence, matrix, threshold, map, pipeline, journey, tension };
  const composition = await builders[meta.family](meta);
  return { band: index, ...composition };
}

const canvasBands = (spec.bands ?? []).map((band, index) => ({ band, index })).filter(({ band }) => band.pattern === "canvas");
const composition = { bands: await Promise.all(canvasBands.map(({ band, index }) => buildComposition(band, index))) };
await mkdir(outDir, { recursive: true });
const compositionPath = resolve(outDir, "auto-composition-spec.json");
await writeFile(compositionPath, JSON.stringify(composition, null, 2) + "\n");

try {
  if (canvasBands.length) {
    await exec(process.execPath, [
      resolve(ROOT, "scripts/compose.mjs"),
      resolve(outDir, "deck.excalidraw"),
      compositionPath,
      outDir,
      ...(debug ? ["--debug"] : []),
    ], { stdio: "inherit" });
  }
} finally {
  await rm(resolve(outDir, "__build-assets"), { recursive: true, force: true });
}

console.error(`AUTO-COMPOSE OK — ${canvasBands.length} semantic canvas bands rendered via ${[...new Set(composition.bands.map((band) => band.elements.find((element) => element.id === "thesis")?.text ?? ""))].length} visual plans`);
return 0;
}, { argv: process.argv.slice(2), usage, positional: ["specArg", "outArg"] });

process.exitCode = status;
