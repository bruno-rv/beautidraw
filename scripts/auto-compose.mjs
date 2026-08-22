// Turn semantic `visual` declarations in deck-spec.json into deterministic
// composed frames. The model describes the visual thesis; this file owns all
// normalized geometry and chooses a varied composition family.
//
// Usage:
//   node scripts/auto-compose.mjs <deck-spec.json> <outdir>

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BODY_INSET, PAGE_WIDTH } from "./layout.mjs";

const exec = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [, , specArg, outArg] = process.argv;

if (!specArg || !outArg) {
  console.error("usage: node scripts/auto-compose.mjs <deck-spec.json> <outdir>");
  process.exit(1);
}

const spec = JSON.parse(await readFile(resolve(specArg), "utf8"));
const specDir = dirname(resolve(specArg));
const outDir = resolve(outArg);
const families = ["illustration", "orbit", "field", "spotlight", "constellation", "evidence", "matrix", "threshold", "map"];
const sequentialFamilies = new Set(["pipeline", "journey"]);
const allowedFamilies = new Set([...families, "pipeline", "journey", "tension"]);
const lightSurface = "#f8fafc";
const darkSurface = "#0f172a";
const lightText = "#1e293b";
const darkText = "#f8fafc";

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

function wrapText(value, maxChars = 28, maxLines = 3) {
  const words = clean(value, "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (word.includes("\n")) {
      const pieces = word.split("\n");
      for (const piece of pieces) {
        if (current) lines.push(current);
        current = piece;
      }
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines.join("\n");
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[.,;:]?$/, "")}…`;
  return kept.join("\n");
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

function text(id, x, y, value, fontSize, strokeColor) {
  return { id, type: "text", x, y, text: value, fontSize, strokeColor };
}

function shape(id, type, x, y, width, height, value, colors, fontSize = 23) {
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    strokeColor: colors.stroke,
    backgroundColor: colors.fill,
    label: { text: wrapText(value), fontSize, strokeColor: colors.text },
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
    focus: clean(visual.focus, band.heading),
    caption: clean(visual.caption, band.deck),
    explanation: clean(visual.explanation, band.deck),
    callouts: (visual.callouts ?? []).map((callout, calloutIndex) =>
      typeof callout === "string"
        ? { label: `Callout ${calloutIndex + 1}`, note: callout }
        : { label: clean(callout?.label, `Callout ${calloutIndex + 1}`), note: clean(callout?.note ?? callout?.text, "") },
    ),
    evidence: (visual.evidence ?? []).map((item) => clean(item, "")).filter(Boolean),
    tradeoff: clean(visual.tradeoff, ""),
    example: clean(visual.example, ""),
    inspect: clean(visual.inspect, ""),
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

function finish(meta, elements, extra = {}) {
  const textColor = meta.dark ? darkText : "#475569";
  const depthParts = [
    meta.explanation,
    meta.example ? `Example: ${meta.example}` : "",
    meta.tradeoff ? `Boundary: ${meta.tradeoff}` : "",
    ...meta.evidence.slice(0, 2).map((item) => `Evidence: ${item}`),
  ].filter(Boolean);
  elements.push(text("explanation", 0.05, 0.73, wrapText(depthParts.join("  •  "), 105, 6), 18, textColor));
  if (meta.inspect) elements.push(text("inspect", 0.58, 0.93, wrapText(`Inspect: ${meta.inspect}`, 50, 2), 18, textColor));
  return {
    lane: sequentialFamilies.has(meta.family) || meta.family === "matrix" ? "hybrid" : "composed",
    surfaceColor: meta.dark ? darkSurface : lightSurface,
    elements,
    ...extra,
  };
}

function orbit(meta) {
  const elements = [text("thesis", 0.05, 0.04, "The session is the intersection of these levers.", 23, meta.dark ? darkText : lightText)];
  const focusColors = { ...colorFor(meta, 0, meta.dark), fill: meta.dark ? "#dbeafe" : "#dbeafe", text: lightText };
  elements.push(shape("focus", "ellipse", 0.39, 0.36, 0.22, 0.22, meta.focus, focusColors, 26));
  const positions = [
    [0.41, 0.08], [0.73, 0.27], [0.73, 0.64],
    [0.41, 0.76], [0.08, 0.64], [0.08, 0.27],
  ];
  const shapes = ["ellipse", "rectangle", "ellipse", "rectangle", "ellipse", "rectangle"];
  positions.forEach(([x, y], index) => {
    const node = meta.nodes[index % meta.nodes.length];
    const colors = colorFor(meta, index, meta.dark);
    if (meta.dark) colors.fill = colors.dark;
    elements.push(shape(`node-${index + 1}`, shapes[index], x, y, 0.19, 0.14, nodeText(node), colors));
  });
  return finish(meta, elements);
}

function field(meta) {
  const textColor = meta.dark ? darkText : lightText;
  const axisColor = meta.dark ? "#94a3b8" : "#64748b";
  const elements = [text("thesis", 0.05, 0.04, "The field shows where options sit, not a sequence they must follow.", 23, textColor)];
  elements.push(line("field-x", 0.08, 0.50, 0.84, 0.01, [[0, 0.5], [1, 0.5]], axisColor));
  elements.push(line("field-y", 0.50, 0.15, 0.01, 0.70, [[0.5, 0], [0.5, 1]], axisColor));
  elements.push(text("field-x-label", 0.72, 0.83, meta.axisX, 18, textColor));
  elements.push(text("field-y-label", 0.04, 0.10, meta.axisY, 18, textColor));
  const positions = [[0.10, 0.16], [0.60, 0.16], [0.16, 0.46], [0.60, 0.46], [0.36, 0.28], [0.36, 0.48]];
  positions.slice(0, Math.min(meta.nodes.length, positions.length)).forEach(([x, y], index) => {
    const colors = colorFor(meta, index, meta.dark);
    if (meta.dark) colors.fill = colors.dark;
    const type = index % 3 === 0 ? "ellipse" : index % 3 === 1 ? "rectangle" : "diamond";
    const size = index < 2 ? [0.24, 0.16] : [0.18, 0.13];
    elements.push(shape(`field-${index + 1}`, type, x, y, size[0], size[1], nodeText(meta.nodes[index]), colors, index < 2 ? 21 : 19));
  });
  return finish(meta, elements);
}

function spotlight(meta) {
  const elements = [text("thesis", 0.05, 0.04, "One focal idea, surrounded by the reasons it matters.", 23, lightText)];
  const focusColors = colorFor(meta, 0);
  focusColors.fill = "#dbeafe";
  elements.push(shape("spotlight", "ellipse", 0.36, 0.28, 0.28, 0.27, meta.focus, focusColors, 29));
  const positions = [[0.06, 0.16], [0.68, 0.16], [0.06, 0.58], [0.68, 0.58]];
  const callouts = meta.callouts.length ? meta.callouts : meta.nodes.slice(0, 4).map((node) => ({ label: node.label, note: node.note }));
  positions.forEach(([x, y], index) => {
    const callout = callouts[index % callouts.length];
    const colors = colorFor(meta, index + 1);
    elements.push(shape(`callout-${index + 1}`, index % 2 ? "rectangle" : "ellipse", x, y, 0.24, 0.14, `${callout.label}\n${callout.note}`, colors, 20));
  });
  return finish(meta, elements);
}

function constellation(meta) {
  const elements = [text("thesis", 0.05, 0.04, "These ideas belong to one neighborhood; proximity carries the meaning.", 23, lightText)];
  const positions = [[0.10, 0.18], [0.36, 0.12], [0.68, 0.18], [0.22, 0.50], [0.52, 0.46], [0.76, 0.52]];
  positions.slice(0, Math.min(meta.nodes.length, positions.length)).forEach(([x, y], index) => {
    const colors = colorFor(meta, index);
    const shapeType = index === 0 ? "ellipse" : index % 2 ? "diamond" : "rectangle";
    const size = index === 0 ? [0.24, 0.18] : [0.18, 0.14];
    elements.push(shape(`star-${index + 1}`, shapeType, x, y, size[0], size[1], nodeText(meta.nodes[index]), colors, index === 0 ? 23 : 19));
  });
  return finish(meta, elements);
}

function evidence(meta) {
  const elements = [text("thesis", 0.05, 0.04, "A claim becomes trustworthy when several pieces of evidence surround it.", 23, lightText)];
  const claimColors = colorFor(meta, 0);
  claimColors.fill = "#d1fae5";
  elements.push(shape("claim", "diamond", 0.38, 0.31, 0.24, 0.22, meta.focus, claimColors, 26));
  const positions = [[0.05, 0.16], [0.71, 0.16], [0.05, 0.58], [0.71, 0.58]];
  const sources = meta.nodes.slice(0, 4);
  positions.forEach(([x, y], index) => {
    const colors = colorFor(meta, index + 1);
    elements.push(shape(`evidence-${index + 1}`, index % 2 ? "ellipse" : "rectangle", x, y, 0.23, 0.14, nodeText(sources[index]), colors, 20));
  });
  if (sources.length >= 2) {
    elements.push(line("evidence-line-left", 0.28, 0.34, 0.10, 0.03, [[0, 0.5], [1, 0.5]], "#64748b"));
    elements.push(line("evidence-line-right", 0.62, 0.34, 0.10, 0.03, [[0, 0.5], [1, 0.5]], "#64748b"));
  }
  return finish(meta, elements);
}

function threshold(meta) {
  const dark = meta.dark;
  const textColor = dark ? darkText : lightText;
  const elements = [text("thesis", 0.05, 0.04, "The important distinction is a boundary, not a path.", 23, textColor)];
  const stroke = dark ? "#94a3b8" : "#64748b";
  elements.push(line("threshold-axis", 0.10, 0.53, 0.80, 0.01, [[0, 0.5], [1, 0.5]], stroke));
  const leftColors = colorFor(meta, 0, dark); const rightColors = colorFor(meta, 2, dark); const centerColors = colorFor(meta, 1, dark);
  if (dark) { leftColors.fill = leftColors.dark; rightColors.fill = rightColors.dark; centerColors.fill = centerColors.dark; }
  elements.push(shape("left-zone", "ellipse", 0.08, 0.32, 0.22, 0.18, meta.left, leftColors, 21));
  elements.push(shape("threshold", "diamond", 0.40, 0.39, 0.20, 0.22, meta.middle, centerColors, 24));
  elements.push(shape("right-zone", "ellipse", 0.70, 0.32, 0.22, 0.18, meta.right, rightColors, 21));
  elements.push(text("threshold-left", 0.08, 0.62, wrapText(meta.nodes[0]?.note ?? "", 30, 2), 18, textColor));
  elements.push(text("threshold-right", 0.70, 0.62, wrapText(meta.nodes[2]?.note ?? "", 30, 2), 18, textColor));
  return finish(meta, elements);
}

async function illustration(meta) {
  if (!meta.image?.file) throw new Error("illustration family requires visual.image.file");
  const imagePath = resolve(specDir, meta.image.file);
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
  const textColor = meta.dark ? darkText : lightText;
  const mutedText = meta.dark ? "#cbd5e1" : "#475569";
  const elements = [
    text("thesis", textX, 0.08, wrapText(meta.focus, 42, 3), 29, textColor),
  ];
  callouts.slice(0, 2).forEach((callout, index) => {
    const colors = colorFor(meta, index + 1, meta.dark);
    if (meta.dark) colors.fill = colors.dark;
    elements.push(shape(`callout-${index + 1}`, index % 2 ? "ellipse" : "rectangle", textX, 0.25 + index * 0.19, 0.39, 0.14, `${callout.label}\n${callout.note}`, colors, 20));
  });
  const depthParts = [
    meta.explanation,
    meta.example ? `Example: ${meta.example}` : "",
    meta.tradeoff ? `Boundary: ${meta.tradeoff}` : "",
    meta.evidence[0] ? `Evidence: ${meta.evidence[0]}` : "",
  ].filter(Boolean);
  elements.push(text("explanation", textX, 0.60, wrapText(depthParts.join("  •  "), 60, 10), 18, mutedText));
  if (meta.inspect) elements.push(text("inspect", textX, 0.91, wrapText(`Inspect: ${meta.inspect}`, 60, 2), 18, mutedText));
  return {
    lane: "composed",
    surfaceColor: meta.dark ? darkSurface : lightSurface,
    image: {
      file: imagePath,
      mode: "side",
      use: clean(meta.image.use, meta.caption),
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
  const elements = [text("thesis", 0.05, 0.04, "Read left to right: each stage changes the state of the work.", 23, lightText)];
  const nodes = meta.nodes.slice(0, 6);
  const stepWidth = 0.13;
  nodes.forEach((node, index) => {
    const x = 0.03 + index * 0.16;
    const colors = colorFor(meta, index);
    const type = ["rectangle", "ellipse", "diamond"][index % 3];
    elements.push(shape(`stage-${index + 1}`, type, x, 0.36, stepWidth, 0.20, nodeText(node), colors));
    if (index < nodes.length - 1) elements.push(arrowBetween(`stage-arrow-${index + 1}`, x + stepWidth, 0.46, x + 0.16, 0.46));
  });
  return finish(meta, elements);
}

function map(meta) {
  const elements = [text("thesis", 0.05, 0.04, "The focal idea is a hub; the surrounding nodes explain its reach.", 23, meta.dark ? darkText : lightText)];
  const centerColors = colorFor(meta, 0, meta.dark);
  centerColors.fill = meta.dark ? "#d1fae5" : "#d1fae5";
  centerColors.text = lightText;
  elements.push(shape("hub", "diamond", 0.40, 0.36, 0.20, 0.20, meta.focus, centerColors, 26));
  const positions = [[0.08, 0.16], [0.70, 0.16], [0.05, 0.62], [0.73, 0.62], [0.39, 0.08], [0.39, 0.75]];
  positions.forEach(([x, y], index) => {
    const node = meta.nodes[index % meta.nodes.length];
    const colors = colorFor(meta, index + 1, meta.dark);
    if (meta.dark) colors.fill = colors.dark;
    const type = index % 2 ? "ellipse" : "rectangle";
    elements.push(shape(`satellite-${index + 1}`, type, x, y, 0.19, 0.14, nodeText(node), colors));
  });
  return finish(meta, elements);
}

function journey(meta) {
  const elements = [text("thesis", 0.05, 0.04, "The relationship changes as the work moves through the journey.", 23, lightText)];
  elements.push(line("journey-axis", 0.07, 0.52, 0.86, 0.01, [[0, 0.5], [1, 0.5]], "#64748b"));
  const nodes = meta.nodes.slice(0, 6);
  nodes.forEach((node, index) => {
    const x = 0.07 + index * (0.86 / Math.max(nodes.length - 1, 1));
    const y = index % 2 ? 0.60 : 0.30;
    const colors = colorFor(meta, index);
    elements.push(shape(`moment-${index + 1}`, "ellipse", Math.max(0, x - 0.07), y, 0.14, 0.14, nodeText(node), colors, 20));
    if (index < nodes.length - 1) {
      const nextX = 0.07 + (index + 1) * (0.86 / Math.max(nodes.length - 1, 1));
      elements.push(arrowBetween(`journey-arrow-${index + 1}`, x + 0.07, 0.52, nextX - 0.07, 0.52, "#64748b"));
    }
  });
  return finish(meta, elements);
}

function tension(meta) {
  const dark = meta.dark;
  const elements = [text("thesis", 0.05, 0.04, "The decision sits between two forces, then produces an action.", 23, dark ? darkText : lightText)];
  const leftColors = colorFor(meta, 0, dark); const rightColors = colorFor(meta, 2, dark);
  if (dark) {
    leftColors.fill = leftColors.dark;
    rightColors.fill = rightColors.dark;
  }
  const decisionColors = colorFor(meta, 1, dark); decisionColors.fill = dark ? decisionColors.dark : decisionColors.fill;
  const bottomColors = colorFor(meta, 3, dark); bottomColors.fill = dark ? bottomColors.dark : bottomColors.fill;
  elements.push(shape("left", "ellipse", 0.07, 0.34, 0.22, 0.19, meta.left, leftColors));
  elements.push(shape("decision", "diamond", 0.39, 0.31, 0.22, 0.24, meta.middle, decisionColors, 26));
  elements.push(shape("right", "ellipse", 0.71, 0.34, 0.22, 0.19, meta.right, rightColors));
  elements.push(shape("outcome", "rectangle", 0.36, 0.73, 0.28, 0.12, meta.decision, bottomColors));
  elements.push(arrowBetween("left-arrow", 0.29, 0.44, 0.39, 0.44));
  elements.push(arrowBetween("right-arrow", 0.61, 0.44, 0.71, 0.44));
  elements.push(arrowBetween("outcome-arrow", 0.50, 0.55, 0.50, 0.73));
  return finish(meta, elements);
}

function matrix(meta) {
  const elements = [text("thesis", 0.05, 0.04, "Place the options by the two dimensions that actually matter.", 23, lightText)];
  elements.push(line("x-axis", 0.06, 0.49, 0.88, 0.01, [[0, 0.5], [1, 0.5]], "#64748b"));
  elements.push(line("y-axis", 0.50, 0.15, 0.01, 0.70, [[0.5, 0], [0.5, 1]], "#64748b"));
  elements.push(text("axis-x-label", 0.72, 0.83, meta.axisX, 18, "#475569"));
  elements.push(text("axis-y-label", 0.04, 0.15, meta.axisY, 18, "#475569"));
  const nodes = meta.nodes.slice(0, 4);
  const positions = [[0.08, 0.18], [0.58, 0.18], [0.08, 0.51], [0.58, 0.51]];
  nodes.forEach((node, index) => {
    elements.push(shape(`quadrant-${index + 1}`, "rectangle", positions[index][0], positions[index][1], 0.34, 0.18, nodeText(node), colorFor(meta, index)));
  });
  const focusColors = colorFor(meta, 4); focusColors.fill = "#d1fae5"; focusColors.text = lightText;
  elements.push(shape("marker", "ellipse", 0.44, 0.42, 0.12, 0.12, meta.focus, focusColors, 18));
  return finish(meta, elements);
}

async function buildComposition(band, index) {
  const meta = metaForBand(band, index);
  const builders = { illustration, orbit, field, spotlight, constellation, evidence, matrix, threshold, map, pipeline, journey, tension };
  const composition = await builders[meta.family](meta);
  return { band: index, ...composition };
}

const canvasBands = (spec.bands ?? []).map((band, index) => ({ band, index })).filter(({ band }) => band.pattern === "canvas");
const composition = { bands: await Promise.all(canvasBands.map(({ band, index }) => buildComposition(band, index))) };
await mkdir(outDir, { recursive: true });
const compositionPath = resolve(outDir, "auto-composition-spec.json");
await writeFile(compositionPath, JSON.stringify(composition, null, 2) + "\n");

if (canvasBands.length) {
  await exec(process.execPath, [resolve(ROOT, "scripts/compose.mjs"), resolve(outDir, "deck.excalidraw"), compositionPath, outDir], { stdio: "inherit" });
}

console.error(`AUTO-COMPOSE OK — ${canvasBands.length} semantic canvas bands rendered via ${[...new Set(composition.bands.map((band) => band.elements.find((element) => element.id === "thesis")?.text ?? ""))].length} visual plans`);
