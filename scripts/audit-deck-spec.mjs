// Presentation-quality gate for Beautidraw deck specs.
//
// Usage:
//   node scripts/audit-deck-spec.mjs <deck-spec.json> [manual-composition-spec.json]
//
// The layout engine proves geometry. This gate proves that a substantial deck
// is not just a stack of deterministic card patterns with short labels. Normal
// decks use semantic `visual` declarations; the optional second argument is
// only for legacy/manual image compositions.

import { dirname, resolve } from "node:path";
import { collectDeckPreflightFailures, readJsonInput } from "./preflight.mjs";
import { formatDiagnostic } from "./cli.mjs";

const [, , specArg, compositionArg] = process.argv;
if (!specArg || specArg === "--help" || specArg === "-h") {
  console.error("usage: node scripts/audit-deck-spec.mjs <deck-spec.json> [composition-spec.json]");
  console.error("       presentation-quality gate: composition budget, band depth, family variety.");
  process.exit(specArg === "--help" || specArg === "-h" ? 0 : 1);
}

async function readJsonOrExit(path, what) {
  try {
    return await readJsonInput(path, { label: what });
  } catch (e) {
    console.error(formatDiagnostic(e));
    process.exit(1);
  }
}

const spec = await readJsonOrExit(specArg, "deck spec");
if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
  console.error("AUDIT ABORTED — deck spec must be a JSON object");
  process.exit(1);
}
const semanticFailures = collectDeckPreflightFailures(spec, {
  specPath: specArg,
  specDir: dirname(resolve(specArg)),
});
if (semanticFailures.length) {
  console.error("PRESENTATION AUDIT FAILED");
  for (const failure of semanticFailures) console.error(`- ${failure.field}: ${failure.reason}`);
  process.exit(1);
}
const composition = compositionArg ? await readJsonOrExit(compositionArg, "composition spec") : null;

const failures = [];
const rawBands = Array.isArray(spec.bands) ? spec.bands : [];
rawBands.forEach((band, index) => {
  if (!band || typeof band !== "object" || Array.isArray(band)) {
    failures.push(`band ${index + 1} must be an object`);
  }
});
if (failures.length) {
  console.error("PRESENTATION AUDIT FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const bands = rawBands;
const structured = bands.filter((band) => band.pattern !== "canvas");
const canvas = bands.filter((band) => band.pattern === "canvas");
const words = (value) => String(value ?? "").trim().split(/\s+/).filter(Boolean).length;
const visualFamilies = new Set([
  "illustration", "orbit", "field", "spotlight", "constellation", "evidence", "matrix", "threshold", "map",
  "pipeline", "journey", "tension",
]);
const sequentialFamilies = new Set(["pipeline", "journey"]);
const flowRelations = new Set(["causal", "dependency", "temporal"]);

if (!bands.length) failures.push("bands must be a non-empty array");
if (bands.length >= 8) {
  const maxStructured = Math.floor(bands.length / 2);
  const minCanvas = Math.ceil(bands.length / 3);
  if (structured.length > maxStructured) {
    failures.push(
      `${structured.length}/${bands.length} bands use structured card patterns; ` +
        `substantial decks may use at most ${maxStructured}. Move the rest to canvas/composed/hybrid frames.`,
    );
  }
  if (canvas.length < minCanvas) {
    failures.push(
      `${canvas.length}/${bands.length} bands use canvas compositions; ` +
        `substantial decks need at least ${minCanvas} content-specific scenes or diagrams.`,
    );
  }

  let run = 0;
  let maxRun = 0;
  for (const band of bands) {
    if (band.pattern === "canvas") run = 0;
    else run += 1;
    maxRun = Math.max(maxRun, run);
  }
  if (maxRun > 2) {
    failures.push(`structured bands appear ${maxRun} times consecutively; break the rhythm with a composed frame`);
  }

  const patternCounts = new Map();
  for (const band of structured) patternCounts.set(band.pattern, (patternCounts.get(band.pattern) ?? 0) + 1);
  for (const [pattern, count] of patternCounts) {
    if (count > 2) failures.push(`pattern "${pattern}" appears ${count} times; use it at most twice in a substantial deck`);
  }

  const sequentialVisualCount = bands.filter((band) => sequentialFamilies.has(band.visual?.family)).length;
  if (sequentialVisualCount > 2) {
    failures.push(`${sequentialVisualCount}/${bands.length} canvas visuals are sequential; use spatial or field families for the rest`);
  }

  // Family variety, mirroring the structured rule: colour changes do not count
  // as variation (SKILL.md's own rejection criteria), so neither does repeating
  // the same composed family with different content. Raster illustrations are
  // exempt — SKILL.md requires at least two of them in a 10+ band deck.
  const composedFamilies = new Map();
  for (const band of bands) {
    const family = band.visual?.family;
    if (family && family !== "illustration") {
      composedFamilies.set(family, (composedFamilies.get(family) ?? 0) + 1);
    }
  }
  for (const [family, count] of composedFamilies) {
    if (count > 2) {
      failures.push(`composed visual "${family}" appears ${count} times; use it at most twice in a substantial deck`);
    }
  }

  // Capacity gates for the composer's fixed text footprints, measured in
  // characters because that is what wraps: every canvas family renders
  // explanation + "Example:" + "Boundary:" inside its footer column — six
  // ~100-character lines for most families, ten ~57-character lines in the
  // illustration family's text column — the thesis renders as one
  // ~120-character line, and the inspect command renders inside two
  // ~46-character lines after its "Inspect: " prefix (~84 characters of
  // command). The renderer ellipsizes past those budgets; a deck that
  // silently drops its own mechanism, boundary, or ships an untypeable
  // command is worse than one that fails here.
  const CAPS = { footer: 560, thesis: 120, inspect: 84 };
  for (const [index, band] of bands.entries()) {
    const visual = band.visual;
    if (!visual) continue;
    const chars = (value) => String(value ?? "").trim().length;
    if (chars(visual.thesis) > CAPS.thesis) {
      failures.push(
        `canvas band ${index + 1}: visual.thesis is ${chars(visual.thesis)} characters; it renders as ONE line of at most ${CAPS.thesis}`,
      );
    }
    const footerChars =
      chars(visual.explanation) +
      (visual.example ? chars(visual.example) + 9 : 0) +
      (visual.tradeoff ? chars(visual.tradeoff) + 11 : 0) +
      Math.min((visual.evidence ?? []).length, 1) * ((visual.evidence ?? [])[0] ? chars(visual.evidence[0]) + 10 : 0);
    if (footerChars > CAPS.footer) {
      failures.push(
        `canvas band ${index + 1}: explanation + example + boundary total ${footerChars} characters; the rendered column holds ~${CAPS.footer} — split the mechanism across bands instead`,
      );
    }
    const inspectChars = chars(visual.inspect);
    if (inspectChars > CAPS.inspect) {
      failures.push(
        `canvas band ${index + 1}: visual.inspect is ${inspectChars} characters; keep it to ${CAPS.inspect} so the rendered "Inspect:" command stays typeable`,
      );
    }
  }
  if (bands.length >= 10) {
    const illustrationCount = bands.filter((band) => band.visual?.family === "illustration").length;
    if (illustrationCount < 2) failures.push(`substantial decks need at least 2 raster illustration frames; found ${illustrationCount}`);
  }
}

const compositionByBand = new Map((composition?.bands ?? []).map((entry) => [entry.band, entry]));
for (const [index, band] of bands.entries()) {
  if (band.pattern === "flow" && !flowRelations.has(band.relation)) {
    failures.push(`flow band ${index + 1} requires relation: causal, dependency, or temporal; use a non-flow visual for precedence or hierarchy`);
  }
  if (band.pattern !== "canvas") continue;
  const entry = compositionByBand.get(index);
  const visual = band.visual;
  if (!entry && !visual) {
    failures.push(`canvas band ${index + 1} needs a semantic visual declaration or a composition entry`);
    continue;
  }
  if (visual && !visualFamilies.has(visual.family)) {
    failures.push(`canvas band ${index + 1}: visual.family must be one of ${[...visualFamilies].join(", ")}`);
  }
  if (visual) {
    // The composer wraps the explanation at six lines (~105 characters each,
    // ~945 characters total) and ellipsizes past that; a rendered deck that
    // silently drops its own mechanism is worse than one that fails here. 140
    // words ≈ the composer's capacity with margin.
    if (words(visual.explanation) > 140) {
      failures.push(
        `canvas band ${index + 1}: visual.explanation is ${words(visual.explanation)} words; the renderer truncates past ~130 — split the mechanism across bands instead`,
      );
    }
    const depthWords = words(visual.explanation) + words(visual.tradeoff) + words(visual.example) + words(visual.inspect) + (visual.evidence ?? []).reduce((sum, item) => sum + words(item), 0) + (visual.callouts ?? []).reduce((sum, item) => sum + words(item.label) + words(item.note ?? item.text), 0);
    if (depthWords < 35) failures.push(`canvas band ${index + 1} needs at least 35 words of mechanism, example, evidence, boundary, and inspection support`);
    if (words(visual.explanation) < 10) failures.push(`canvas band ${index + 1} needs a mechanism-level explanation`);
    if (words(visual.example) < 5) failures.push(`canvas band ${index + 1} needs a concrete example`);
    if (words(visual.tradeoff) < 5) failures.push(`canvas band ${index + 1} needs a boundary or exception`);
    if (words(visual.inspect) < 2) failures.push(`canvas band ${index + 1} needs an inspection command or check`);
    if (visual.family === "illustration" && !visual.image?.file) failures.push(`canvas band ${index + 1}: illustration family requires visual.image.file`);
  }
  if (entry) {
    const elements = entry.elements ?? [];
    const nonRectangles = elements.filter((element) => !["rectangle", "text"].includes(element.type));
    if (nonRectangles.length < 2 && !entry.image) {
      failures.push(`canvas band ${index + 1} needs a visual relationship (arrows, lines, ellipses, or a scene), not only labels`);
    }
    const connectors = elements.filter((element) => element.type === "arrow" || element.type === "line").length;
    const family = visual?.family;
    const maxConnectors = sequentialFamilies.has(family) ? 7 : 3;
    if (connectors > maxConnectors) {
      failures.push(`canvas band ${index + 1} (${family ?? "unknown"}) emits ${connectors} connectors; max ${maxConnectors} for a non-sequential visual`);
    }
    if (family === "illustration" && !entry.image) failures.push(`canvas band ${index + 1}: generated illustration composition is missing its raster asset`);
  }
}

const density = bands.map((band, bandIndex) => {
  let count = words(band.heading) + words(band.deck);
  for (const node of band.nodes ?? []) {
    count += words(node.label) + words(node.note);
    for (const item of node.items ?? []) count += words(item);
    for (const child of node.children ?? []) count += words(child.label);
  }
  if (band.pattern === "canvas") {
    const entry = compositionByBand.get(bandIndex);
    for (const element of entry?.elements ?? []) {
      count += words(element.text) + words(element.label?.text);
    }
    count += words(entry?.image?.use);
    const visual = band.visual;
    count += words(visual?.family) + words(visual?.focus) + words(visual?.caption);
    count += words(visual?.left) + words(visual?.middle) + words(visual?.right) + words(visual?.decision);
    count += words(visual?.explanation) + words(visual?.example) + words(visual?.tradeoff) + words(visual?.inspect);
    count += (visual?.evidence ?? []).reduce((sum, item) => sum + words(item), 0);
    count += (visual?.callouts ?? []).reduce((sum, item) => sum + words(item.label) + words(item.note ?? item.text), 0);
    for (const node of visual?.nodes ?? []) count += words(node.label) + words(node.note);
  }
  return count;
});
if (bands.length >= 8 && density.length && density.reduce((sum, value) => sum + value, 0) / density.length < 42) {
  failures.push("average band support is too thin; develop the mechanism, example, boundary, or consequence before composing");
}
for (const [index, band] of bands.entries()) {
  if (band.pattern !== "canvas" && density[index] < 45) failures.push(`structured band ${index + 1} is too thin at ${density[index]} words; add exact mechanisms, examples, and exceptions`);
}

if (failures.length) {
  console.error("PRESENTATION AUDIT FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.error(
  `PRESENTATION AUDIT OK — ${bands.length} bands, ${structured.length} structured, ${canvas.length} canvas, ` +
    `${density.length ? Math.round(density.reduce((sum, value) => sum + value, 0) / density.length) : 0} average support words`,
);
