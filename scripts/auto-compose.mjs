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
import { renderDataVignette } from "./data-vignettes.mjs";

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
const lightSurface = "#ffffff";
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

function colorFor(meta, index, dark = false) {
  const token = meta.nodes[index]?.tone ?? accentOrder[index % accentOrder.length];
  const chosen = palette[token] ?? palette.blue;
  return { ...chosen, text: dark ? darkText : lightText };
}

function text(id, x, y, value, fontSize, strokeColor, role = "prose", customData = {}, textAlign = "left") {
  return {
    id,
    type: "text",
    x,
    y,
    text: value,
    fontSize,
    fontFamily: fontForRole(role).family,
    role,
    textAlign,
    strokeColor,
    customData: { ...customData, beautidrawRole: role, beautidrawMeasuredText: true },
  };
}

function mark(id, type, x, y, width, height, colors, customData = {}) {
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    strokeColor: colors.stroke,
    strokeWidth: customData.semanticKind ? 3 : 2,
    roughness: 0,
    backgroundColor: colors.fill ?? "transparent",
    customData: { ...customData },
    ...(type === "line" || type === "arrow" ? { points: [[0, 0.5], [1, 0.5]] } : {}),
  };
}

function nodeBlock(id, node, meta, { x, y, width, index, marker = "ellipse", labelSize = RAMP.label, markerSide = "left", flowLane = null } = {}) {
  const colors = colorFor(meta, index, meta.dark);
  const markerSize = marker === "line" ? 0.028 : 0.022;
  const markerY = y + (marker === "line" ? 0.018 : 0.006);
  const markerX = markerSide === "right" ? x + width - markerSize : x;
  const textX = markerSide === "right" ? markerX - 0.012 : x + markerSize + 0.018;
  const textWidth = Math.max(0.08, width - markerSize - 0.018);
  const muted = meta.dark ? "#cbd5e1" : "#475569";
  const flowData = flowLane ? { beautidrawTextFlowLane: flowLane } : {};
  const elements = [mark(`${id}-mark`, marker, markerX, markerY, markerSize, marker === "line" ? 0.006 : markerSize, colors, flowData)];
  elements.push(text(`${id}-label`, textX, y, node.label, labelSize, colors.text, "prose", {
    beautidrawMaxWidth: textWidth,
    ...flowData,
  }, markerSide === "right" ? "right" : "left"));
  if (node.note) {
    elements.push(text(`${id}-note`, textX, y + 0.075, node.note, RAMP.note, muted, "prose", {
      beautidrawMaxWidth: textWidth,
      beautidrawBelowTextId: `${id}-label`,
      beautidrawBelowTextGap: 0.018,
      ...flowData,
    }, markerSide === "right" ? "right" : "left"));
  }
  return elements;
}

function nodeAnchor(x, y, width, markerSide = "left") {
  return [markerSide === "right" ? x + width - 0.011 : x + 0.011, y + 0.017];
}

function sequenceNode(id, node, meta, { x, y, width, index, marker = "ellipse", labelSize = RAMP.note } = {}) {
  return nodeBlock(id, node, meta, { x, y, width, index, marker, labelSize });
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

function routedArrow(id, points, strokeColor = "#94a3b8") {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const width = Math.max(Math.max(...xs) - x, 0.01);
  const height = Math.max(Math.max(...ys) - y, 0.01);
  return {
    id,
    type: "arrow",
    x,
    y,
    width,
    height,
    points: points.map(([px, py]) => [(px - x) / width, (py - y) / height]),
    strokeColor,
    strokeWidth: 3,
  };
}

function routedLine(id, points, strokeColor = "#94a3b8") {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const width = Math.max(Math.max(...xs) - x, 0.01);
  const height = Math.max(Math.max(...ys) - y, 0.01);
  return {
    id,
    type: "line",
    x,
    y,
    width,
    height,
    points: points.map(([px, py]) => [(px - x) / width, (py - y) / height]),
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
  const nodeCount = rawNodes.length;
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
    data: visual.data ?? null,
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
    nodeCount,
    nodes,
    left: clean(visual.left, nodes[0]?.label),
    middle: clean(visual.middle, nodes[1]?.label),
    right: clean(visual.right, nodes[2]?.label),
    decision: clean(visual.decision, nodes[3]?.label ?? "Effective choice"),
    decisionAuthored: typeof visual.decision === "string" && visual.decision.trim() !== "",
    axisX: clean(visual.axisX, "specificity →"),
    axisY: clean(visual.axisY, "blast radius ↑"),
    axisXAuthored: typeof visual.axisX === "string" && visual.axisX.trim() !== "",
    axisYAuthored: typeof visual.axisY === "string" && visual.axisY.trim() !== "",
    thesisAuthored: typeof visual.thesis === "string" && visual.thesis.trim() !== "",
    focusAuthored: typeof visual.focus === "string" && visual.focus.trim() !== "",
    explanationAuthored: typeof visual.explanation === "string" && visual.explanation.trim() !== "",
    exampleAuthored: typeof visual.example === "string" && visual.example.trim() !== "",
    tradeoffAuthored: typeof visual.tradeoff === "string" && visual.tradeoff.trim() !== "",
    inspectAuthored: typeof visual.inspect === "string" && visual.inspect.trim() !== "",
    leftAuthored: typeof visual.left === "string" && visual.left.trim() !== "",
    middleAuthored: typeof visual.middle === "string" && visual.middle.trim() !== "",
    rightAuthored: typeof visual.right === "string" && visual.right.trim() !== "",
    zoneFieldsAuthored: [visual.left, visual.middle, visual.right].some((value) => typeof value === "string" && value.trim() !== ""),
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

function normalizedCoverageText(value) {
  return String(value ?? "").replace(/-\s+/g, "-").replace(/\s+/g, " ").trim();
}

function assertAuthoredVisibleContent(meta, elements, bandIndex) {
  const visible = elements.filter((element) => element.type === "text").map((element) => normalizedCoverageText(element.text)).join(" ");
  const requireText = (field, value) => {
    if (typeof value === "string" && value.trim() && !visible.includes(normalizedCoverageText(value))) {
      throw new Error(`band ${bandIndex}: authored ${field} is missing from composed visible text`);
    }
  };
  if (meta.thesisAuthored) requireText("visual.thesis", meta.thesis);
  if (meta.focusAuthored) requireText("visual.focus", meta.focus);
  if (meta.explanationAuthored) requireText("visual.explanation", meta.explanation);
  if (meta.exampleAuthored) requireText("visual.example", meta.example);
  if (meta.tradeoffAuthored) requireText("visual.tradeoff", meta.tradeoff);
  if (meta.inspectAuthored) requireText("visual.inspect", meta.inspect);
  for (const item of meta.evidence) requireText("visual.evidence", item);
  for (const callout of meta.callouts) {
    requireText("visual.callouts.label", callout.label);
    if (callout.note) requireText("visual.callouts.note", callout.note);
  }
  for (const annotation of meta.annotations) requireText("visual.annotation", annotation.text);
  if (["threshold", "matrix"].includes(meta.family)) {
    if (meta.leftAuthored) requireText("visual.left", meta.left);
    if (meta.middleAuthored) requireText("visual.middle", meta.middle);
    if (meta.rightAuthored) requireText("visual.right", meta.right);
  }
  if (["field", "matrix", "threshold", "map"].includes(meta.family)) {
    if (meta.axisXAuthored) requireText("visual.axisX", meta.axisX);
    if (meta.axisYAuthored) requireText("visual.axisY", meta.axisY);
  }

  const nodeDriven = new Set(["orbit", "field", "constellation", "evidence", "matrix", "threshold", "map", "pipeline", "journey", "tension"]);
  const fallbackCount = meta.callouts.length === 0 && ["illustration", "spotlight"].includes(meta.family)
    ? Math.min(meta.nodeCount, meta.family === "illustration" ? 2 : 4)
    : 0;
  const nodeCount = nodeDriven.has(meta.family) ? meta.nodeCount : fallbackCount;
  for (const node of meta.nodes.slice(0, nodeCount)) {
    requireText("visual.nodes.label", node.label);
    if (node.note) requireText("visual.nodes.note", node.note);
  }
}

function footerInspectY(meta) {
  const bandHeight = Math.max(1, Number(meta.bandHeight) || 1);
  return Math.min(0.95, Math.max(0.82, 1 - 36 / bandHeight));
}

function semanticIcon(kind, {
  id,
  x,
  y,
  size,
  label,
  strokeColor = "#475569",
  labelColor = strokeColor,
  fontSize = RAMP.note,
  maxWidth = 0.34,
  fill = "transparent",
}) {
  if (!SEMANTIC_KINDS.has(kind)) throw new Error(`unsupported semantic icon kind "${kind}"`);
  const type = { example: "ellipse", boundary: "diamond", inspect: "line", warning: "rectangle" }[kind];
  const iconId = `${id}-icon`;
  const labelId = `${id}-label`;
  const icon = mark(iconId, type, x, y, size, type === "line" ? 0.01 : size, {
    stroke: strokeColor,
    fill,
  }, { semanticKind: kind, semanticLabelId: labelId });
  const labelText = kind[0].toUpperCase() + kind.slice(1);
  const labelElement = text(
    labelId,
    x + size + 0.012,
    y,
    `${labelText}: ${label}`,
    fontSize,
    labelColor,
    "prose",
    { semanticLabelFor: iconId, beautidrawMaxWidth: maxWidth },
  );
  return [icon, labelElement];
}

function semanticCalloutShape(id, callout, x, y, width, _height, colors, fontSize) {
  const iconSize = Math.min(width, 0.022);
  const elements = semanticIcon(callout.kind, {
    id,
    x,
    y,
    size: iconSize,
    label: callout.label,
    strokeColor: colors.stroke,
    labelColor: colors.text,
    fontSize,
    maxWidth: Math.max(0.08, width - 0.034),
    fill: "transparent",
  });
  if (callout.note) elements.push(text(`${id}-note`, x + iconSize + 0.012, y + 0.075, callout.note, RAMP.note, colors.text, "prose", {
    beautidrawMaxWidth: Math.max(0.08, width - 0.034),
    beautidrawBelowTextId: `${id}-label`,
    beautidrawBelowTextGap: 0.018,
  }));
  return elements;
}

function dataElements(data, viewport) {
  const elements = renderDataVignette(data, { idPrefix: "data", ...viewport })
    .filter((element) => !(data.kind === "distribution" && /data-candidate-\d+-baseline$/.test(element.id)));
  const shift = viewport.height * 0.06;
  const lift = 0;
  return elements.map((element) => {
    const id = element.id;
    const move = data.kind === "lookup"
      ? /data-(?:row-\d+|selected-arrow|result-|lookup-note)/.test(id)
      : data.kind === "distribution"
        ? /data-candidate-\d+|data-selected-note/.test(id)
        : /data-(?:piece-guide|piece-|id-|alignment-note)/.test(id);
    const note = /data-(?:lookup-note|selected-note|alignment-note)$/.test(id);
    const noteAdjustment = id === "data-lookup-note"
      ? -viewport.height * 0.08
      : id === "data-selected-note"
        ? viewport.height * 0.05
        : 0;
    return move ? { ...element, y: element.y + (note ? 0 : shift) + noteAdjustment + lift } : { ...element, y: element.y + lift };
  });
}

function finish(meta, elements, extra = {}) {
  const textColor = meta.dark ? darkText : "#475569";
  elements.push(...annotationElements(meta, { y: 0.57 }));
  const editorialParts = [
    meta.explanation,
    meta.example ? `Example — ${meta.example}` : "",
    meta.tradeoff ? `Boundary — ${meta.tradeoff}` : "",
    ...meta.evidence.map((item) => `Evidence — ${item}`),
    ...(!["illustration", "spotlight"].includes(meta.family)
      ? meta.callouts.map((callout) => `Callout — ${callout.label}${callout.note ? `: ${callout.note}` : ""}`)
      : []),
  ].filter(Boolean);
  const editorialY = new Set(["tension", "matrix", "journey", "map", "evidence"]).has(meta.family) ? 0.74 : 0.68;
  if (editorialParts.length) elements.push(text("explanation", 0.05, editorialY, editorialParts.join("  •  "), 28, textColor, "prose", { beautidrawMaxWidth: 0.90 }));
  if (meta.inspect) elements.push(text("inspect", 0.05, footerInspectY(meta), `Inspect: ${meta.inspect}`, 23, textColor, "mono", { beautidrawMaxWidth: 0.90 }));
  return {
    lane: sequentialFamilies.has(meta.family) || meta.family === "matrix" ? "hybrid" : "composed",
    surfaceColor: meta.dark ? darkSurface : lightSurface,
    elements,
    ...extra,
  };
}

// Concept-first family renderers. Labels and notes stay open and are measured
// independently; marks and connectors carry the topology instead of a prose
// container carrying both content and geometry.
function conceptOrbit(meta) {
  const elements = thesisLine(meta);
  const stroke = meta.dark ? "#94a3b8" : "#64748b";
  const hub = { x: 0.46, y: 0.40 };
  elements.push(mark("focus-mark", "ellipse", hub.x, hub.y, 0.07, 0.07, {
    stroke: meta.dark ? "#f8fafc" : "#1e3a5f", fill: "transparent",
  }));
  elements.push(text("focus-label", 0.38, 0.30, meta.focus, RAMP.label, meta.dark ? darkText : lightText, "prose", { beautidrawMaxWidth: 0.24 }));
  const positions = [[0.05, 0.20], [0.69, 0.20], [0.05, 0.42], [0.69, 0.42], [0.20, 0.55], [0.58, 0.55]];
  const anchors = positions.slice(0, Math.min(meta.nodeCount, positions.length)).map(([x, y]) => nodeAnchor(x, y, 0.25, x < 0.5 ? "right" : "left"));
  const maxPairs = anchors.length / 2;
  for (let index = 0; index < Math.min(anchors.length, maxPairs * 2); index += 2) {
    const pair = anchors.slice(index + 1, index + 2);
    elements.push(routedLine(`orbit-link-${index / 2 + 1}`, [anchors[index], [anchors[index][0], 0.46], [hub.x + 0.035, 0.46], ...(pair.length ? [[pair[0][0], 0.46], pair[0]] : [])], stroke));
  }
  positions.slice(0, Math.min(meta.nodeCount, positions.length)).forEach(([x, y], index) => {
    elements.push(...nodeBlock(`node-${index + 1}`, meta.nodes[index], meta, { x, y, width: 0.25, index, markerSide: x < 0.5 ? "right" : "left" }));
  });
  return finish(meta, elements);
}

function conceptField(meta) {
  const textColor = meta.dark ? darkText : lightText;
  const axisColor = meta.dark ? "#94a3b8" : "#64748b";
  const elements = thesisLine(meta);
  elements.push(line("field-x", 0.08, 0.49, 0.84, 0.01, [[0, 0.5], [1, 0.5]], axisColor));
  elements.push(line("field-y", 0.50, 0.17, 0.01, 0.46, [[0.5, 0], [0.5, 1]], axisColor));
  elements.push(text("field-x-label", 0.69, 0.08, meta.axisX, RAMP.note, textColor, "prose", { beautidrawMaxWidth: 0.23 }));
  elements.push(text("field-y-label", 0.05, 0.11, meta.axisY, RAMP.note, textColor, "prose", { beautidrawMaxWidth: 0.22 }));
  elements.push(text("field-focus", 0.36, 0.12, meta.focus, RAMP.note, textColor, "prose", { beautidrawMaxWidth: 0.28 }));
  const positions = [[0.08, 0.20], [0.59, 0.20], [0.10, 0.36], [0.60, 0.36], [0.20, 0.55], [0.61, 0.55]];
  positions.slice(0, Math.min(meta.nodeCount, positions.length)).forEach(([x, y], index) => {
    elements.push(...nodeBlock(`field-${index + 1}`, meta.nodes[index], meta, {
      x, y, width: 0.28, index, flowLane: x < 0.5 ? "field-left" : "field-right",
    }));
  });
  return finish(meta, elements);
}

function conceptSpotlight(meta) {
  const elements = thesisLine(meta);
  const textColor = meta.dark ? darkText : lightText;
  const stroke = meta.dark ? "#94a3b8" : "#64748b";
  elements.push(mark("spotlight-mark", "diamond", 0.475, 0.42, 0.05, 0.05, {
    stroke: meta.dark ? "#f8fafc" : "#047857", fill: "transparent",
  }));
  elements.push(text("spotlight-focus", 0.30, 0.34, meta.focus, 30, textColor, "prose", { beautidrawMaxWidth: 0.40 }));
  const positions = [[0.05, 0.14], [0.66, 0.14], [0.05, 0.44], [0.66, 0.44]];
  const callouts = meta.callouts.length
    ? meta.callouts.slice(0, positions.length)
    : meta.nodes.slice(0, Math.min(meta.nodeCount, positions.length)).map((node) => ({ kind: "example", label: node.label, note: node.note }));
  const connectorBudget = 3;
  callouts.forEach((callout, index) => {
    const [x, y] = positions[index];
    const colors = colorFor(meta, index + 1, meta.dark);
    elements.push(...semanticCalloutShape(`callout-${index + 1}`, callout, x, y, 0.29, 0.04, colors, RAMP.note));
    if (index < connectorBudget) {
      const start = [x + 0.011, y + 0.011];
      elements.push(routedArrow(`spotlight-arrow-${index + 1}`, [start, [start[0], 0.445], [0.50, 0.445]], stroke));
    }
  });
  return finish(meta, elements);
}

function conceptConstellation(meta) {
  const elements = thesisLine(meta);
  const stroke = meta.dark ? "#94a3b8" : "#64748b";
  elements.push(text("constellation-focus", 0.36, meta.thesis ? 0.12 : 0.04, meta.focus, RAMP.note, meta.dark ? darkText : lightText, "prose", { beautidrawMaxWidth: 0.30 }));
  const positions = [[0.08, 0.21], [0.38, 0.17], [0.68, 0.21], [0.14, 0.50], [0.48, 0.45], [0.76, 0.51]];
  const nodes = meta.nodes.slice(0, Math.min(meta.nodeCount, positions.length));
  const anchors = positions.slice(0, nodes.length).map(([x, y]) => nodeAnchor(x, y, 0.24, x < 0.5 ? "right" : "left"));
  const routes = [];
  if (anchors.length >= 2) {
    routes.push([anchors[0], [anchors[0][0], 0.10], [anchors[1][0], 0.10], anchors[1]]);
    if (anchors.length === 3) routes.push([anchors[1], anchors[2]]);
  }
  if (anchors.length >= 4) {
    const junction = anchors[4] ?? anchors[3];
    if (anchors.length === 4) {
      routes.push([anchors[1], anchors[2], [0.95, 0.10], [0.95, anchors[3][1]], anchors[3]]);
    } else {
      routes.push([anchors[1], anchors[2], [anchors[2][0], 0.10], [0.95, 0.10], [0.95, 0.40], [junction[0], 0.40]]);
      const bottom = [anchors[3], [anchors[3][0], 0.40], [junction[0], 0.40], junction];
      if (anchors[5]) bottom.push([anchors[5][0], 0.40], anchors[5]);
      routes.push(bottom);
    }
  }
  routes.slice(0, 3).forEach((points, index) => elements.push(routedLine(`constellation-link-${index + 1}`, points, stroke)));
  nodes.forEach((node, index) => elements.push(...nodeBlock(`star-${index + 1}`, node, meta, {
    x: positions[index][0], y: positions[index][1], width: 0.24, index, markerSide: positions[index][0] < 0.5 ? "right" : "left",
  })));
  return finish(meta, elements);
}

function conceptEvidence(meta) {
  const elements = thesisLine(meta);
  const stroke = meta.dark ? "#94a3b8" : "#64748b";
  const positions = [[0.05, 0.18], [0.69, 0.18], [0.05, 0.48], [0.69, 0.48]];
  const nodes = meta.nodes.slice(0, Math.min(meta.nodeCount, positions.length));
  const anchors = positions.slice(0, nodes.length).map(([x, y]) => [x + 0.013, y + 0.018]);
  if (anchors.length > 0) elements.push(routedLine("evidence-link-1", [anchors[0], [anchors[0][0], 0.39], [0.49, 0.39]], stroke));
  if (anchors.length > 1) elements.push(routedLine("evidence-link-2", [anchors[1], [anchors[1][0], 0.39], [0.53, 0.39]], stroke));
  if (anchors.length === 3) elements.push(routedLine("evidence-link-3", [anchors[2], [anchors[2][0], 0.67], [0.49, 0.67], [0.49, 0.39]], stroke));
  if (anchors.length === 4) elements.push(routedLine("evidence-link-3", [anchors[2], [anchors[2][0], 0.67], [anchors[3][0], 0.67], anchors[3]], stroke));
  elements.push(mark("claim-mark", "diamond", 0.49, 0.37, 0.04, 0.04, {
    stroke: meta.dark ? "#f8fafc" : "#047857", fill: "transparent",
  }));
  elements.push(text("claim", 0.34, 0.27, meta.focus, 30, meta.dark ? darkText : lightText, "prose", { beautidrawMaxWidth: 0.32 }));
  nodes.forEach((source, index) => {
    const [x, y] = positions[index];
    elements.push(...nodeBlock(`evidence-${index + 1}`, source, meta, { x, y, width: 0.25, index }));
  });
  return finish(meta, elements);
}

function conceptThreshold(meta) {
  const stroke = meta.dark ? "#94a3b8" : "#64748b";
  const textColor = meta.dark ? darkText : lightText;
  const elements = thesisLine(meta);
  elements.push(line("threshold-axis", 0.50, 0.20, 0.01, 0.05, [[0.5, 0], [0.5, 1]], stroke));
  elements.push(line("threshold-axis-bottom", 0.50, 0.53, 0.01, 0.05, [[0.5, 0], [0.5, 1]], stroke));
  if (meta.axisXAuthored) elements.push(text("threshold-axis-left", 0.09, 0.10, meta.axisX, RAMP.note, textColor, "prose", { beautidrawMaxWidth: 0.30 }));
  if (meta.axisYAuthored) elements.push(text("threshold-axis-right", 0.61, 0.10, meta.axisY, RAMP.note, textColor, "prose", { beautidrawMaxWidth: 0.30 }));
  elements.push(text("threshold-focus", 0.36, 0.16, meta.focus, RAMP.note, textColor, "prose", { beautidrawMaxWidth: 0.30 }));
  const zones = [
    ["left-zone", meta.left, 0.08, 0.30, "rectangle"],
    ["threshold", meta.middle, 0.39, 0.20, "diamond"],
    ["right-zone", meta.right, 0.61, 0.30, "rectangle"],
  ];
  zones.forEach(([id, label, x, width], index) => {
    elements.push(text(`${id}-heading`, x, 0.255, label, RAMP.note, textColor, "prose", { beautidrawMaxWidth: width }));
    if (index >= meta.nodeCount) return;
    elements.push(...nodeBlock(id, meta.nodes[index], meta, {
      x, y: index === 1 ? 0.34 : 0.32, width, index,
      marker: index === 1 ? "diamond" : "rectangle",
      ...(index === 1 ? { labelSize: RAMP.note } : {}),
    }));
  });
  return finish(meta, elements);
}

async function conceptIllustration(meta) {
  if (!meta.image?.file) throw new Error("illustration family requires visual.image.file");
  const imagePath = resolve(outDir, meta.image.file);
  const bytes = await readFile(imagePath);
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error(`${meta.image.file}: illustration assets must be PNG`);
  const pixelWidth = bytes.readUInt32BE(16);
  const pixelHeight = bytes.readUInt32BE(20);
  const imageAspect = pixelWidth / pixelHeight;
  const bodyAspect = (PAGE_WIDTH - 2 * BODY_INSET) / meta.bandHeight;
  const dataMode = Boolean(meta.data);
  const dataViewportWidth = 0.68;
  const dataViewportGutter = 0.03;
  const dataViewportMargin = 0.03;
  const maxDataImageWidth = 1 - (2 * dataViewportMargin) - dataViewportGutter - dataViewportWidth;
  let height = dataMode ? 0.36 : 0.50;
  let width = imageAspect * height / bodyAspect;
  const maxWidth = dataMode ? maxDataImageWidth : 0.52;
  if (width > maxWidth) { width = maxWidth; height = width * bodyAspect / imageAspect; }
  const side = meta.image.side === "right" ? "right" : "left";
  const x = side === "left" ? 0.03 : 0.97 - width;
  const y = (1 - height) / 2;
  const textX = side === "left" ? (dataMode ? Math.max(0.30, x + width + 0.03) : Math.max(0.56, x + width + 0.02)) : 0.05;
  const textWidth = Math.min(dataMode ? dataViewportWidth : 0.40, 0.97 - textX);
  const textColor = meta.dark ? darkText : lightText;
  const mutedText = meta.dark ? "#cbd5e1" : "#475569";
  const callouts = meta.callouts.length
    ? meta.callouts
    : meta.nodes.slice(0, Math.min(meta.nodeCount, 2)).map((node) => ({ kind: "example", label: node.label, note: node.note }));
  const dataViewport = dataMode ? {
    x: side === "left" ? textX : dataViewportMargin,
    y: 0.07,
    width: dataViewportWidth,
    height: 0.76,
    dark: meta.dark,
  } : null;
  const elements = [];
  if (!dataMode) {
    if (meta.thesis) elements.push(text("thesis", textX, 0.06, meta.thesis, 29, textColor, "prose", { beautidrawMaxWidth: textWidth }));
    elements.push(text("focus", textX, meta.thesis ? 0.18 : 0.08, meta.focus, RAMP.label, textColor, "prose", { beautidrawMaxWidth: textWidth }));
  }
  if (dataMode) {
    const header = [meta.thesis, meta.focus].filter(Boolean).join("  •  ");
    if (header) elements.push(text("data-header", side === "left" ? 0.03 : 0.73, 0.03, header, 26, textColor, "prose", { beautidrawMaxWidth: 0.24 }));
  }
  if (!dataMode) elements.push(...annotationElements(meta, { x: textX, y: 0.52, maxWidth: textWidth }));
  else elements.push(...annotationElements(meta, { x: side === "left" ? 0.03 : 0.73, y: 0.22, maxWidth: 0.24 }));
  if (!dataMode) callouts.slice(0, 2).forEach((callout, index) => {
    elements.push(...semanticCalloutShape(`callout-${index + 1}`, callout, textX, 0.28 + index * 0.18, textWidth, 0.04, colorFor(meta, index + 1, meta.dark), RAMP.note));
  });
  if (dataViewport) elements.push(...dataElements(meta.data, dataViewport));
  const depthParts = [meta.explanation, meta.example ? `Example — ${meta.example}` : "", meta.tradeoff ? `Boundary — ${meta.tradeoff}` : "", ...meta.evidence.map((item) => `Evidence — ${item}`)].filter(Boolean);
  const longDepth = depthParts.join(" ").length > 210;
  if (dataMode) {
    const explanationParts = [meta.explanation, meta.example ? `Example — ${meta.example}` : ""].filter(Boolean).join("  •  ");
    const boundaryParts = [
      meta.tradeoff ? `Boundary — ${meta.tradeoff}` : "",
      ...meta.evidence.map((item) => `Evidence — ${item}`),
      ...callouts.map((callout) => `Callout — ${callout.label}${callout.note ? `: ${callout.note}` : ""}`),
    ].filter(Boolean).join("  •  ");
    if (explanationParts) elements.push(text("explanation", 0.03, 0.84, explanationParts, 26, mutedText, "prose", { beautidrawMaxWidth: 0.46 }));
    if (boundaryParts) elements.push(text("boundary", 0.52, 0.76, boundaryParts, 23, mutedText, "prose", { beautidrawMaxWidth: 0.44 }));
    if (meta.inspect) elements.push(text("inspect", 0.52, footerInspectY(meta), `Inspect — ${meta.inspect}`, 23, mutedText, "mono", { beautidrawMaxWidth: 0.44 }));
  } else {
    const editorialParts = [
      meta.explanation,
      meta.example ? `Example — ${meta.example}` : "",
      meta.tradeoff ? `Boundary — ${meta.tradeoff}` : "",
      ...meta.evidence.map((item) => `Evidence — ${item}`),
    ].filter(Boolean);
    if (editorialParts.length) elements.push(text("explanation", 0.05, 0.76, editorialParts.join("  •  "), 28, mutedText, "prose", { beautidrawMaxWidth: 0.90 }));
  if (meta.inspect) elements.push(text("inspect", 0.05, footerInspectY(meta), `Inspect: ${meta.inspect}`, 23, mutedText, "mono", { beautidrawMaxWidth: 0.90 }));
  }
  return { lane: "composed", surfaceColor: meta.dark ? darkSurface : lightSurface, image: {
    file: meta.image.file, path: meta.image.path, mode: "side", use: clean(meta.image.use, meta.caption),
    description: clean(meta.image.description, ""), x, y, width, height, opacity: 100,
    ...(dataMode ? { anchorBelow: "data-header", side } : {}),
  }, elements };
}

function conceptPipeline(meta) {
  const elements = thesisLine(meta);
  elements.push(text("pipeline-focus", 0.05, 0.13, meta.focus, RAMP.note, meta.dark ? darkText : lightText, "prose", { beautidrawMaxWidth: 0.90 }));
  const nodes = meta.nodes.slice(0, Math.min(meta.nodeCount, 6));
  const stepWidth = nodes.length > 5 ? 0.145 : 0.17;
  const stepGap = nodes.length > 5 ? 0.165 : 0.20;
  nodes.forEach((node, index) => {
    const x = 0.03 + index * stepGap;
    elements.push(...sequenceNode(`stage-${index + 1}`, node, meta, { x, y: 0.29, width: stepWidth, index, marker: "rectangle", labelSize: RAMP.note }));
    if (index < nodes.length - 1) elements.push(arrowBetween(`stage-arrow-${index + 1}`, x + 0.09, 0.246, x + stepGap + 0.05, 0.246, meta.dark ? "#94a3b8" : "#64748b"));
  });
  return finish(meta, elements);
}

function conceptMap(meta) {
  const elements = thesisLine(meta);
  const stroke = meta.dark ? "#94a3b8" : "#64748b";
  const hub = { x: 0.46, y: 0.38, width: 0.06, height: 0.06 };
  const hubRail = [hub.x + hub.width / 2, hub.y + hub.height];
  elements.push(mark("hub-mark", "diamond", hub.x, hub.y, hub.width, hub.height, {
    stroke: meta.dark ? "#f8fafc" : "#047857", fill: "transparent",
  }));
  if (meta.axisXAuthored) elements.push(text("map-axis-x", 0.05, 0.10, meta.axisX, RAMP.note, meta.dark ? darkText : lightText, "prose", { beautidrawMaxWidth: 0.28 }));
  if (meta.axisYAuthored) elements.push(text("map-axis-y", 0.68, 0.10, meta.axisY, RAMP.note, meta.dark ? darkText : lightText, "prose", { beautidrawMaxWidth: 0.27 }));
  elements.push(text("hub-label", 0.37, 0.30, meta.focus, RAMP.label, meta.dark ? darkText : lightText, "prose", { beautidrawMaxWidth: 0.25 }));
  const positions = [[0.04, 0.19], [0.68, 0.19], [0.04, 0.48], [0.68, 0.48], [0.35, 0.58], [0.35, 0.16]];
  const anchors = positions.slice(0, Math.min(meta.nodeCount, positions.length)).map(([x, y]) => nodeAnchor(x, y, 0.28, x < 0.5 ? "right" : "left"));
  for (let index = 0; index < anchors.length; index += 2) {
    const pair = anchors.slice(index + 1, index + 2);
    elements.push(routedLine(`map-link-${index / 2 + 1}`, [anchors[index], [anchors[index][0], hubRail[1]], hubRail, ...(pair.length ? [[pair[0][0], hubRail[1]], pair[0]] : [])], stroke));
  }
  positions.slice(0, Math.min(meta.nodeCount, positions.length)).forEach(([x, y], index) => {
    elements.push(...nodeBlock(`satellite-${index + 1}`, meta.nodes[index], meta, { x, y, width: 0.28, index, markerSide: x < 0.5 ? "right" : "left" }));
  });
  return finish(meta, elements);
}

function conceptJourney(meta) {
  const elements = thesisLine(meta);
  const axisColor = meta.dark ? "#94a3b8" : "#64748b";
  elements.push(text("journey-focus", 0.36, 0.12, meta.focus, RAMP.note, meta.dark ? darkText : lightText, "prose", { beautidrawMaxWidth: 0.30 }));
  elements.push(line("journey-axis", 0.07, 0.44, 0.86, 0.01, [[0, 0.5], [1, 0.5]], axisColor));
  const nodes = meta.nodes.slice(0, Math.min(meta.nodeCount, 6));
  nodes.forEach((node, index) => {
    const x = 0.08 + index * (0.84 / Math.max(nodes.length - 1, 1));
    const y = index % 2 ? 0.50 : 0.20;
    elements.push(mark(`moment-${index + 1}-axis-mark`, "ellipse", x - 0.014, 0.425, 0.028, 0.028, colorFor(meta, index, meta.dark)));
    elements.push(...sequenceNode(`moment-${index + 1}`, node, meta, { x: Math.max(0.01, x - 0.11), y, width: 0.22, index, marker: "rectangle", labelSize: RAMP.note }));
    if (index < nodes.length - 1) {
      const nextX = 0.08 + (index + 1) * (0.84 / Math.max(nodes.length - 1, 1));
      elements.push(arrowBetween(`journey-arrow-${index + 1}`, x + 0.014, 0.439, nextX - 0.014, 0.439, axisColor));
    }
  });
  return finish(meta, elements);
}

function conceptTension(meta) {
  const elements = thesisLine(meta);
  const stroke = meta.dark ? "#94a3b8" : "#64748b";
  elements.push(text("tension-focus", 0.36, 0.12, meta.focus, RAMP.note, meta.dark ? darkText : lightText, "prose", { beautidrawMaxWidth: 0.30 }));
  elements.push(line("tension-boundary", 0.50, 0.22, 0.01, 0.10, [[0.5, 0], [0.5, 1]], stroke));
  elements.push(line("tension-boundary-bottom", 0.50, 0.57, 0.01, 0.07, [[0.5, 0], [0.5, 1]], stroke));
  elements.push(...nodeBlock("left", meta.nodes[0], meta, { x: 0.07, y: 0.30, width: 0.31, index: 0, marker: "rectangle" }));
  elements.push(...nodeBlock("decision", meta.nodes[1], meta, { x: 0.39, y: 0.30, width: 0.20, index: 1, marker: "diamond", labelSize: RAMP.note }));
  elements.push(...nodeBlock("right", meta.nodes[2], meta, { x: 0.61, y: 0.30, width: 0.31, index: 2, marker: "rectangle" }));
  elements.push(mark("outcome-mark", "ellipse", 0.49, 0.57, 0.04, 0.04, colorFor(meta, 3, meta.dark)));
  elements.push(text("outcome", 0.35, 0.62, meta.decision, RAMP.label, meta.dark ? darkText : lightText, "prose", { beautidrawMaxWidth: 0.30 }));
  if (meta.nodeCount > 3 && meta.decisionAuthored) {
    elements.push(text("outcome-source", 0.68, 0.50, meta.nodes[3].label, RAMP.note, meta.dark ? darkText : lightText, "prose", { beautidrawMaxWidth: 0.24 }));
    if (meta.nodes[3].note) elements.push(text("outcome-source-note", 0.68, 0.65, meta.nodes[3].note, RAMP.note, meta.dark ? "#cbd5e1" : "#475569", "prose", {
      beautidrawMaxWidth: 0.24,
      beautidrawBelowTextId: "outcome-source",
      beautidrawBelowTextGap: 0.018,
    }));
  } else if (meta.nodes[3]?.note) {
    elements.push(text("outcome-note", 0.35, 0.68, meta.nodes[3].note, RAMP.note, meta.dark ? "#cbd5e1" : "#475569", "prose", {
      beautidrawMaxWidth: 0.30,
      beautidrawBelowTextId: "outcome",
      beautidrawBelowTextGap: 0.018,
    }));
  }
  return finish(meta, elements);
}

function conceptMatrix(meta) {
  const elements = thesisLine(meta);
  const axisColor = meta.dark ? "#94a3b8" : "#64748b";
  const labelColor = meta.dark ? darkText : "#475569";
  elements.push(line("x-axis", 0.06, 0.49, 0.88, 0.01, [[0, 0.5], [1, 0.5]], axisColor));
  elements.push(line("y-axis", 0.50, 0.15, 0.01, 0.55, [[0.5, 0], [0.5, 1]], axisColor));
  elements.push(text("axis-x-label", 0.69, 0.08, meta.axisX, RAMP.note, labelColor, "prose", { beautidrawMaxWidth: 0.24 }));
  elements.push(text("axis-y-label", 0.04, 0.08, meta.axisY, RAMP.note, labelColor, "prose", { beautidrawMaxWidth: 0.24 }));
  const positions = meta.zoneFieldsAuthored
    ? [[0.08, 0.26], [0.59, 0.26], [0.08, 0.57], [0.59, 0.57]]
    : [[0.08, 0.19], [0.59, 0.19], [0.08, 0.55], [0.59, 0.55]];
  if (meta.zoneFieldsAuthored) {
    for (const [id, label, x, width] of [
      ["matrix-left-heading", meta.left, 0.08, 0.25],
      ["matrix-middle-heading", meta.middle, 0.38, 0.24],
      ["matrix-right-heading", meta.right, 0.68, 0.25],
    ]) elements.push(text(id, x, 0.16, label, RAMP.note, labelColor, "prose", { beautidrawMaxWidth: width }));
  }
  meta.nodes.slice(0, Math.min(meta.nodeCount, 4)).forEach((node, index) => elements.push(...nodeBlock(`quadrant-${index + 1}`, node, meta, {
    x: positions[index][0], y: positions[index][1], width: 0.30, index,
  })));
  elements.push(mark("marker", "ellipse", 0.49, 0.43, 0.04, 0.04, { stroke: "#047857", fill: "transparent" }));
  elements.push(text("marker-label", 0.54, 0.39, meta.focus, RAMP.note, labelColor, "prose", { beautidrawMaxWidth: 0.27 }));
  return finish(meta, elements);
}

const conceptBuilders = {
  illustration: conceptIllustration,
  orbit: conceptOrbit,
  field: conceptField,
  spotlight: conceptSpotlight,
  constellation: conceptConstellation,
  evidence: conceptEvidence,
  matrix: conceptMatrix,
  threshold: conceptThreshold,
  map: conceptMap,
  pipeline: conceptPipeline,
  journey: conceptJourney,
  tension: conceptTension,
};

async function buildComposition(band, index) {
  const meta = metaForBand(band, index);
  if (meta.data && meta.family !== "illustration") {
    throw new Error(`band ${index}: visual.data is supported only with the illustration family; choose family illustration or remove visual.data`);
  }
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
  const composition = await conceptBuilders[meta.family](meta);
  assertAuthoredVisibleContent(meta, composition.elements, index);
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
