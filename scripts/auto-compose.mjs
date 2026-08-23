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
import { CliError, runCli } from "./cli.mjs";
import { preflightDeck, readJsonInput } from "./preflight.mjs";

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
  // Authorial newlines are structure — a node's label and its note are two
  // thoughts, not one phrase. Wrap each authored line independently, then
  // apply maxLines across the combined result.
  const segments = clean(value, "").split("\n");
  const lines = [];
  for (const segment of segments) {
    const words = segment.split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
  }
  if (lines.length <= maxLines) return lines.join("\n");
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[.,;:]?$/, "")}…`;
  return kept.join("\n");
}

// Same greedy wrap, never ellipsizes. Reserved: inspection commands must
// survive rendering typeable, and the audit enforces that at the gate by
// capping visual.inspect to what the composer's two rendered lines hold
// (~14 words). Keeping the two-line cap here is deliberate — an unbounded
// command block overflows the frame bottom on shorter canvas bands.

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

// Wrap width derived from the shape's OWN box: normalized width × body
// width ÷ ~0.5×fontSize px-per-character (the prose face's measured average),
// minus slack for Excalidraw's bound-text padding. The old fixed 28-character
// default both fused label+note lines and ellipsized callout notes that
// visibly fit their boxes.
const BODY_W = PAGE_WIDTH - 2 * BODY_INSET;

function fitChars(width, fontSize) {
  return Math.max(12, Math.floor((width * BODY_W) / (fontSize * 0.5)) - 6);
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
    label: { text: wrapText(value, fitChars(width, fontSize)), fontSize, strokeColor: colors.text },
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

// The model may write `visual.thesis`: a one-line statement of what the
// audience should see. The composer renders it as the frame's opening line;
// without one it skips the line entirely rather than filling the space with
// boilerplate that carries zero information about THIS deck's content.
// One rendered line, hard cap: every family places its first shapes at or
// below y≈0.16 on the left half, and a wrapped second line would collide
// with them (field's y-axis label sits near that line). 120 characters is
// the largest single line the body width carries at fontSize 23 with margin;
// the audit holds visual.thesis to ≤18 words (~120 characters) so the two
// caps agree and neither ever ellipsizes.
function thesisLine(meta) {
  return meta.thesis
    ? [text("thesis", 0.05, 0.04, wrapText(meta.thesis, 120, 1), 23, meta.dark ? darkText : lightText)]
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
    callouts: (Array.isArray(visual.callouts) ? visual.callouts : []).map((callout, calloutIndex) =>
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
  // One evidence item, not two: the footer is a summary, and the second
  // citation was the line that pushed most bands past the six-line budget
  // into ellipsis. The spec keeps both; the frame shows the strongest.
  const depthParts = [
    meta.explanation,
    meta.example ? `Example: ${meta.example}` : "",
    meta.tradeoff ? `Boundary: ${meta.tradeoff}` : "",
    ...meta.evidence.slice(0, 1).map((item) => `Evidence: ${item}`),
  ].filter(Boolean);
  // Six lines × ~105 characters — the footprint every family's shape zones
  // are laid out around, and the capacity the audit's 560-character footer
  // gate is tuned to. Truncation past this is blocked at the gate, so an
  // ellipsis here means the spec was never audited.
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
  const elements = thesisLine(meta);
  // The focal ellipse stays light-filled in both surfaces: it is the one
  // element the satellites' arrows imply, and #dbeafe with dark text keeps
  // its contrast where a dark fill would flatten it.
  const focusColors = { ...colorFor(meta, 0, meta.dark), fill: "#dbeafe", text: lightText };
  elements.push(shape("focus", "ellipse", 0.39, 0.31, 0.22, 0.22, meta.focus, focusColors, 26));
  // Ring top clears the thesis strip (y∈[0.03,0.16] on the left half) and
  // the ring bottom stays at y≤0.72 above the footer — same rules every
  // family obeys.
  const positions = [
    [0.41, 0.16], [0.72, 0.26], [0.72, 0.48],
    [0.41, 0.58], [0.09, 0.48], [0.09, 0.26],
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
  const elements = thesisLine(meta);
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
  const elements = thesisLine(meta);
  // Same light focal treatment as orbit: the spotlighted idea must out-read
  // its callouts on either surface.
  const focusColors = { ...colorFor(meta, 0, meta.dark), fill: "#dbeafe", text: lightText };
  elements.push(shape("spotlight", "ellipse", 0.36, 0.28, 0.28, 0.27, meta.focus, focusColors, 29));
  // Bottom callout row rides at 0.53, not 0.58: a three-line bound label
  // expands its container downward past the declared box, and 0.58 + growth
  // grazed the 0.73 footer line on this band height.
  const positions = [[0.06, 0.16], [0.68, 0.16], [0.06, 0.53], [0.68, 0.53]];
  const callouts = meta.callouts.length ? meta.callouts : meta.nodes.slice(0, 4).map((node) => ({ label: node.label, note: node.note }));
  positions.forEach(([x, y], index) => {
    const callout = callouts[index % callouts.length];
    const colors = colorFor(meta, index + 1, meta.dark);
    if (meta.dark) colors.fill = colors.dark;
    elements.push(shape(`callout-${index + 1}`, index % 2 ? "rectangle" : "ellipse", x, y, 0.24, 0.14, `${callout.label}\n${callout.note}`, colors, 20));
  });
  return finish(meta, elements);
}

function constellation(meta) {
  const elements = thesisLine(meta);
  // star-2 sits below the thesis strip: at y=0.12 it grazed the one-line
  // thesis's worst-case rendered height on short bands.
  const positions = [[0.10, 0.18], [0.38, 0.16], [0.68, 0.18], [0.22, 0.50], [0.52, 0.46], [0.76, 0.52]];
  positions.slice(0, Math.min(meta.nodes.length, positions.length)).forEach(([x, y], index) => {
    const colors = colorFor(meta, index, meta.dark);
    if (meta.dark) colors.fill = colors.dark;
    const shapeType = index === 0 ? "ellipse" : index % 2 ? "diamond" : "rectangle";
    const size = index === 0 ? [0.24, 0.18] : [0.18, 0.14];
    elements.push(shape(`star-${index + 1}`, shapeType, x, y, size[0], size[1], nodeText(meta.nodes[index]), colors, index === 0 ? 23 : 19));
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
  const positions = [[0.05, 0.16], [0.71, 0.16], [0.05, 0.56], [0.71, 0.56]];
  const sources = meta.nodes.slice(0, 4);
  positions.forEach(([x, y], index) => {
    const colors = colorFor(meta, index + 1, meta.dark);
    if (meta.dark) colors.fill = colors.dark;
    elements.push(shape(`evidence-${index + 1}`, index % 2 ? "ellipse" : "rectangle", x, y, 0.23, 0.14, nodeText(sources[index]), colors, 20));
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
  // Ten lines is the illustration family's own proven footprint (the image
  // occupies the left half, so the text column has room no other family has).
  // The audit's ~90-word cap keeps this under the truncation line.
  elements.push(text("explanation", textX, 0.60, wrapText(depthParts.join("  •  "), 60, 10), 18, mutedText));
  if (meta.inspect) elements.push(text("inspect", textX, 0.91, wrapText(`Inspect: ${meta.inspect}`, 60, 2), 18, mutedText));
  return {
    lane: "composed",
    surfaceColor: meta.dark ? darkSurface : lightSurface,
    image: {
      file: imagePath,
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
    const type = ["rectangle", "ellipse", "diamond"][index % 3];
    elements.push(shape(`stage-${index + 1}`, type, x, 0.36, stepWidth, 0.20, nodeText(node), colors));
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
  const positions = [[0.08, 0.16], [0.70, 0.14], [0.05, 0.44], [0.73, 0.42], [0.42, 0.18], [0.67, 0.57]];
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
    elements.push(shape(`moment-${index + 1}`, "ellipse", Math.max(0, x - 0.07), y, 0.14, 0.14, nodeText(node), colors, 20));
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
  elements.push(text("axis-x-label", 0.72, 0.83, meta.axisX, 18, labelColor));
  elements.push(text("axis-y-label", 0.04, 0.15, meta.axisY, 18, labelColor));
  const nodes = meta.nodes.slice(0, 4);
  const positions = [[0.08, 0.18], [0.58, 0.18], [0.08, 0.51], [0.58, 0.51]];
  nodes.forEach((node, index) => {
    const colors = colorFor(meta, index, meta.dark);
    if (meta.dark) colors.fill = colors.dark;
    elements.push(shape(`quadrant-${index + 1}`, "rectangle", positions[index][0], positions[index][1], 0.34, 0.18, nodeText(node), colors));
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
  await exec(process.execPath, [
    resolve(ROOT, "scripts/compose.mjs"),
    resolve(outDir, "deck.excalidraw"),
    compositionPath,
    outDir,
    ...(debug ? ["--debug"] : []),
  ], { stdio: "inherit" });
}

console.error(`AUTO-COMPOSE OK — ${canvasBands.length} semantic canvas bands rendered via ${[...new Set(composition.bands.map((band) => band.elements.find((element) => element.id === "thesis")?.text ?? ""))].length} visual plans`);
return 0;
}, { argv: process.argv.slice(2), usage, positional: ["specArg", "outArg"] });

process.exitCode = status;
