import { access, readFile, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, relative, resolve, dirname } from "node:path";

import { CliError } from "./cli.mjs";
import { DATA_VIGNETTE_VIEWPORT, validateDataVignette } from "./data-vignettes.mjs";
import { BODY_INSET, BOUND_TEXT_PADDING, PAGE_WIDTH, RAMP, planDeck } from "./layout.mjs";
import { buildOutline } from "./outline.mjs";

export const CONTENT_BUDGETS = Object.freeze({
  thesisChars: 120,
  footerChars: 560,
  inspectChars: 84,
  explanationWords: 140,
  calloutLabelChars: 72,
  calloutNoteChars: 180,
});

const MAX_HEADING_CHARS = 2000;
const SEMANTIC_KINDS = new Set(["example", "boundary", "inspect", "warning"]);
export const AUTO_COMPOSE_FAMILIES = Object.freeze([
  "illustration", "orbit", "field", "spotlight", "constellation", "evidence", "matrix", "threshold", "map",
]);
export const FAMILY_CAPACITIES = Object.freeze({
  illustration: Object.freeze({ nodes: 2, callouts: 2 }),
  orbit: Object.freeze({ nodes: 6, callouts: 2 }),
  field: Object.freeze({ nodes: 6, callouts: 2 }),
  spotlight: Object.freeze({ nodes: 4, callouts: 4 }),
  constellation: Object.freeze({ nodes: 6, callouts: 2 }),
  evidence: Object.freeze({ nodes: 4, callouts: 2 }),
  matrix: Object.freeze({ nodes: 4, callouts: 2 }),
  threshold: Object.freeze({ nodes: 3, callouts: 2 }),
  map: Object.freeze({ nodes: 6, callouts: 2 }),
  pipeline: Object.freeze({ nodes: 6, callouts: 2 }),
  journey: Object.freeze({ nodes: 6, callouts: 2 }),
  tension: Object.freeze({ nodes: 4, callouts: 2 }),
});
const PNG_SIGNATURE = "89504e470d0a1a0a";
const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

const words = (value) => String(value ?? "").trim().split(/\s+/).filter(Boolean).length;
const chars = (value) => String(value ?? "").trim().length;
const DATA_EDITORIAL_START = 0.84;
const DATA_EDITORIAL_LINE_HEIGHT_PX = 35;
const DATA_BOUNDARY_START = 0.76;
const DATA_BOUNDARY_LINE_HEIGHT_PX = 32;
const DATA_BOUND_TEXT_MARGIN_PX = 2 * BOUND_TEXT_PADDING + 1;
// Safe Nunito advances measured from the pinned font corpus at 26px and
// rounded upward by glyphWidth(). Keeping every printable ASCII glyph in the
// table prevents a repeated wide glyph (for example 250 "m"s) from passing an
// average-width estimate. Unknown/non-ASCII glyphs take a conservative 1.05em
// fallback; this is a preflight safety bound, not a runtime font-coverage claim.
const DATA_SAFE_ASCII_WIDTHS = new Map([
  ["'", 0.226], ["!,.\u003a;", 0.233], ["i", 0.237], ["j", 0.241], [" ", 0.261],
  ["I", 0.262], ["|", 0.270], ["/\\", 0.290], ["l", 0.301], ["[]", 0.324],
  ["()", 0.326], ["J", 0.331], ["f", 0.340], ["t", 0.358], ["`{}", 0.361],
  ["r", 0.365], ["\"", 0.405], ["-", 0.427], ["?", 0.447], ["*", 0.451],
  ["c", 0.465], ["z", 0.466], ["s", 0.483], ["_", 0.500], ["k", 0.508],
  ["y", 0.517], ["v", 0.518], ["x", 0.530], ["a", 0.533], ["e", 0.534],
  ["L", 0.548], ["F", 0.551], ["o", 0.560], ["u", 0.565], ["hn", 0.572],
  ["E", 0.586], ["bdpq", 0.587], ["g", 0.590], ["Z", 0.593],
  ["#$+0123456789<=>^~", 0.600], ["Y", 0.601], ["T", 0.607], ["S", 0.618],
  ["K", 0.634], ["P", 0.637], ["X", 0.655], ["R", 0.673], ["C", 0.675],
  ["B", 0.679], ["V", 0.694], ["&", 0.701], ["G", 0.729], ["U", 0.731],
  ["A", 0.733], ["N", 0.741], ["D", 0.747], ["H", 0.764], ["OQ", 0.771],
  ["w", 0.844], ["M", 0.858], ["m", 0.861], ["%", 0.933], ["@", 0.947], ["W", 1.104],
]);
// The converter's own measured advances are the safety table used below.
// Keep the ASCII coverage explicit so every printable glyph is bounded.
const DATA_CONVERTER_ASCII_WIDTHS = [
  ["'", 0.180], ["|", 0.200], [" ,.", 0.250], ["/:;\\ijlt", 0.278],
  ["!()-I[]`fr", 0.333], ["Js", 0.389], ["\"", 0.408], ["?acez", 0.444],
  ["^", 0.469], ["{}", 0.480], ["0123456789#$*_bdghknopquvxy", 0.500], ["~", 0.541],
  ["FPS", 0.556], ["+<=>", 0.564], ["ELTZ", 0.611], ["BCR", 0.667],
  ["ADGHKNOQUVXYw", 0.722], ["&m", 0.778], ["%", 0.833], ["M", 0.889],
  ["@", 0.921], ["W", 0.944],
];
for (const [glyphs, width] of DATA_CONVERTER_ASCII_WIDTHS) {
  for (const glyph of glyphs) DATA_SAFE_ASCII_WIDTHS.set(glyph, width);
}
// Values are rounded to the converter's measured precision; retain the pinned
// advances instead of adding an arbitrary average-width margin that would
// reject the existing three-line examples.
const DATA_GLYPH_SAFETY = 0.005;
const DATA_EDITORIAL_RECOVERY = "Shorten the data illustration copy, split it across bands, or grow the canvas height and rerun.";
const cleanText = (value, fallback = "") => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

function dataIllustrationCalloutParts(band) {
  const visual = isObject(band.visual) ? band.visual : {};
  const callouts = Array.isArray(visual.callouts) ? visual.callouts : [];
  const source = callouts.length
    ? callouts
    : (Array.isArray(visual.nodes) ? visual.nodes : Array.isArray(band.nodes) ? band.nodes : []).slice(0, 2);
  return source.map((node) => {
    const label = isObject(node) ? cleanText(node.label) : cleanText(node);
    const note = isObject(node) ? cleanText(node.note ?? node.text) : "";
    return note ? `Callout — ${label}: ${note}` : "";
  }).filter(Boolean);
}

function glyphWidth(char, fontSize) {
  const directWidth = DATA_SAFE_ASCII_WIDTHS.get(char);
  if (directWidth !== undefined) return (directWidth + DATA_GLYPH_SAFETY) * fontSize;
  for (const [glyphs, width] of DATA_SAFE_ASCII_WIDTHS) {
    if (glyphs.includes(char)) return (width + DATA_GLYPH_SAFETY) * fontSize;
  }
  return 1.05 * fontSize;
}

function estimateWrappedLines(value, width, fontSize) {
  return String(value ?? "").split("\n").reduce((total, hardLine) => {
    if (hardLine === "") return total + 1;
    let lineUnits = 0;
    let lineCount = 1;
    let pendingSpaceUnits = 0;
    for (const token of hardLine.match(/\s+|[^\s]+/gu) ?? []) {
      if (/^\s+$/u.test(token)) {
        pendingSpaceUnits = [...token].reduce((sum, char) => sum + glyphWidth(char, fontSize), 0);
        continue;
      }
      const tokenUnits = [...token].reduce((sum, char) => sum + glyphWidth(char, fontSize), 0);
      if (tokenUnits > width) {
        if (lineUnits > 0) {
          lineCount += 1;
          lineUnits = 0;
        }
        for (const char of token) {
          const units = glyphWidth(char, fontSize);
          if (lineUnits > 0 && lineUnits + units > width) {
            lineCount += 1;
            lineUnits = 0;
          }
          lineUnits += units;
        }
      } else {
        const neededUnits = tokenUnits + (lineUnits > 0 ? pendingSpaceUnits : 0);
        if (lineUnits > 0 && lineUnits + neededUnits > width) {
          lineCount += 1;
          lineUnits = tokenUnits;
        } else {
          lineUnits += neededUnits;
        }
      }
      pendingSpaceUnits = 0;
    }
    return total + lineCount;
  }, 0);
}

const DATA_TOKEN_RECOVERY = "Shorten the token label, reduce token items, or split the data vignette across frames; native cells stay single-line without truncation or font shrinking.";
const DATA_FIXED_CELL_RECOVERY = "Shorten the label or use manual composition/split the data vignette across frames; fixed native cells stay single-line without truncation or font shrinking.";
const DATA_OUTLINE_RECOVERY = "Keep authored data values portable for the outline; use a deck-relative image path or encode the example value.";

function collectDataOutlinePathFailure(spec, band, index, { specPath }) {
  try {
    buildOutline({ ...spec, bands: [band] });
  } catch (error) {
    if (/outline contains an absolute source path/i.test(error?.message ?? "")) {
      return failure(
        `bands[${index}].visual.data`,
        "data values contain an absolute or machine-local path that would make outline.md non-portable",
        { specPath, recovery: DATA_OUTLINE_RECOVERY },
      );
    }
  }
  return null;
}

function collectDataNativeCapacityFailures(band, index, { bodyWidth, specPath }) {
  const data = band.visual?.data;
  if (!data || !isObject(data)) return [];
  const viewportWidth = bodyWidth * DATA_VIGNETTE_VIEWPORT.minWidth;
  const failures = [];
  const check = (field, value, width, fixedCell = false) => {
    const text = String(value ?? "");
    const lines = estimateWrappedLines(text, Math.max(1, width - 2 * BOUND_TEXT_PADDING), RAMP.note);
    if (lines <= 1) return;
    failures.push(failure(
      `bands[${index}].visual.data.${field}`,
      `native data label requires ${lines} lines in a ${width.toFixed(1)}px single-line cell; ${fixedCell ? "shorten the label or use manual composition/split the vignette" : "shorten it, reduce items, or split the vignette"}`,
      { specPath, recovery: fixedCell ? DATA_FIXED_CELL_RECOVERY : DATA_TOKEN_RECOVERY },
    ));
  };
  if (data.kind === "token-sequence") {
    const columns = data.pieces.length > 4 ? Math.ceil(data.pieces.length / 2) : data.pieces.length;
    const gap = Math.min(0.018, 0.12 / columns);
    const cellWidth = viewportWidth * ((0.94 - gap * (columns - 1)) / columns);
    data.pieces.forEach((piece, pieceIndex) => {
      const visible = String(piece.text ?? "").replace(/^[ \t]+|[ \t]+$/g, (whitespace) => "␠".repeat(whitespace.length));
      check(`pieces[${pieceIndex}].text`, visible, cellWidth);
      check(`pieces[${pieceIndex}].id`, piece.id, cellWidth);
    });
  } else if (data.kind === "lookup") {
    check("key", `Lookup key: ${data.key}`, viewportWidth * 0.62, true);
    data.rows.forEach((row, rowIndex) => {
      check(`rows[${rowIndex}].id`, row.id, viewportWidth * 0.20, true);
      check(`rows[${rowIndex}].label`, row.label, viewportWidth * 0.20, true);
    });
  } else if (data.kind === "distribution") {
    data.candidates.forEach((candidate, candidateIndex) => {
      check(`candidates[${candidateIndex}].label`, candidate.label, viewportWidth * 0.24, true);
    });
  }
  return failures;
}

function renderedFooterParts(band, index) {
  const visual = isObject(band.visual) ? band.visual : {};
  const family = cleanText(visual.family, AUTO_COMPOSE_FAMILIES[index % AUTO_COMPOSE_FAMILIES.length]);
  const parts = [
    cleanText(visual.explanation, band.deck),
    visual.example ? `Example — ${cleanText(visual.example)}` : "",
    visual.tradeoff ? `Boundary — ${cleanText(visual.tradeoff)}` : "",
    ...(Array.isArray(visual.evidence) ? visual.evidence : []).map((item) => `Evidence — ${cleanText(item)}`),
  ];
  if (family === "illustration" && visual.data) {
    parts.push(...dataIllustrationCalloutParts(band));
  } else if (!["illustration", "spotlight"].includes(family)) {
    const callouts = Array.isArray(visual.callouts) ? visual.callouts : [];
    parts.push(...callouts.map((callout) => {
      const label = isObject(callout) ? cleanText(callout.label) : cleanText(callout);
      const note = isObject(callout) ? cleanText(callout.note ?? callout.text) : cleanText(callout);
      return `Callout — ${label}${note ? `: ${note}` : ""}`;
    }));
  }
  return parts.filter(Boolean);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function failure(field, reason, { specPath, recovery } = {}) {
  return {
    stage: "preflight",
    field,
    input: specPath,
    reason,
    recovery: recovery ?? "Fix the reported field and run the command again.",
  };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isWithin(root, candidate) {
  const remainder = relative(root, candidate);
  return remainder === "" || (!remainder.startsWith("..") && !isAbsolute(remainder));
}

export function collectFamilyCapacityFailures(spec, { specPath, mode = "automatic" } = {}) {
  if (mode !== "automatic") return [];
  const failures = [];
  for (const [index, band] of (Array.isArray(spec?.bands) ? spec.bands : []).entries()) {
    if (!isObject(band) || band.pattern !== "canvas") continue;
    const visual = isObject(band.visual) ? band.visual : {};
    const authoredFamily = typeof visual.family === "string" ? visual.family.trim() : "";
    const family = authoredFamily || AUTO_COMPOSE_FAMILIES[index % AUTO_COMPOSE_FAMILIES.length];
    const capacity = FAMILY_CAPACITIES[family];
    if (!capacity) continue;
    const nodes = Array.isArray(visual.nodes)
      ? visual.nodes
      : Array.isArray(band.nodes) ? band.nodes : [];
    const callouts = Array.isArray(visual.callouts) ? visual.callouts : [];
    const nodeCapacityApplies = !["illustration", "spotlight"].includes(family) || callouts.length === 0;
    if (nodeCapacityApplies && nodes.length > capacity.nodes) {
      failures.push(failure(
        `bands[${index}].visual.nodes`,
        `${family} family supports up to ${capacity.nodes} authored nodes; split across frames or choose a family with more capacity`,
        { specPath },
      ));
    }
    if (capacity.callouts !== undefined && callouts.length > capacity.callouts) {
      failures.push(failure(
        `bands[${index}].visual.callouts`,
        `${family} family supports up to ${capacity.callouts} authored callouts; split across frames or choose a family with more capacity`,
        { specPath },
      ));
    }
  }
  return failures;
}

// Resolve before every asset read/copy. Lexical containment alone lets a
// symlink in the deck root point outside it; realpath containment closes that
// direct and indirect escape while still allowing an ordinary in-root file
// (and an in-root symlink whose target remains in-root).
export async function resolveAssetWithinRoot(root, candidate, { label = "asset" } = {}) {
  if (typeof candidate !== "string" || candidate.trim() === "") {
    throw new Error(`${label} path is required`);
  }
  if (isAbsolute(candidate) || /^[A-Za-z]:[\\/]/.test(candidate) || candidate.split(/[\\/]/).includes("..")) {
    throw new Error(`${label} must be a deck-relative path`);
  }
  const rootReal = await realpath(resolve(root));
  const lexical = resolve(rootReal, candidate);
  const assetReal = await realpath(lexical);
  if (!isWithin(rootReal, assetReal)) {
    throw new Error(`${label} resolves outside the deck root via a symlink`);
  }
  return assetReal;
}

export async function readJsonInput(path, { label = "JSON input" } = {}) {
  try {
    const text = await readFile(resolve(path), "utf8");
    try {
      return JSON.parse(text);
    } catch (cause) {
      throw new CliError({
        command: "beautidraw",
        stage: "preflight",
        input: path,
        reason: `${label} is not valid JSON`,
        recovery: `Fix the JSON syntax in the supplied ${label.toLowerCase()} path.`,
        cause,
      });
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError({
      command: "beautidraw",
      stage: "preflight",
      input: path,
      reason: `${label} could not be read`,
      recovery: `Pass an existing ${label.toLowerCase()} path.`,
      cause: error,
    });
  }
}

export function collectDeckPreflightFailures(spec, { specPath, specDir, mode = "automatic" } = {}) {
  const failures = [];
  if (!isObject(spec)) {
    failures.push(failure("spec", "deck spec must be a JSON object", { specPath }));
    return failures;
  }
  if (!Array.isArray(spec.bands)) {
    failures.push(failure("bands", "bands must be an array", { specPath }));
    return failures;
  }
  if (spec.bands.length === 0) {
    failures.push(failure("bands", "bands must be a non-empty array", { specPath }));
    return failures;
  }

  for (const [index, band] of spec.bands.entries()) {
    if (!isObject(band)) {
      failures.push(failure(`bands[${index}]`, `bands[${index}] must be an object`, { specPath }));
    }
  }
  if (failures.length) return failures;

  let plannedDeck;
  try {
    plannedDeck = planDeck(spec);
  } catch (error) {
    failures.push(failure("spec", error.message ?? String(error), { specPath }));
  }
  failures.push(...collectFamilyCapacityFailures(spec, { specPath, mode }));

  const titleChars = chars(spec.title);
  if (titleChars > MAX_HEADING_CHARS) {
    failures.push(failure("title", `title is ${titleChars} characters; maximum is ${MAX_HEADING_CHARS}`, { specPath }));
  }
  const subtitleChars = chars(spec.subtitle);
  if (subtitleChars > MAX_HEADING_CHARS) {
    failures.push(failure("subtitle", `subtitle is ${subtitleChars} characters; maximum is ${MAX_HEADING_CHARS}`, { specPath }));
  }
  const footerChars = chars(spec.footer);
  if (footerChars > CONTENT_BUDGETS.footerChars) {
    failures.push(failure("footer", `footer is ${footerChars} characters; keep it to ${CONTENT_BUDGETS.footerChars}`, { specPath }));
  }

  for (const [index, band] of spec.bands.entries()) {
    const headingChars = chars(band.heading);
    if (headingChars > MAX_HEADING_CHARS) {
      failures.push(failure(`bands[${index}].heading`, `heading is ${headingChars} characters; maximum is ${MAX_HEADING_CHARS}`, { specPath }));
    }
    const deckChars = chars(band.deck);
    if (deckChars > MAX_HEADING_CHARS) {
      failures.push(failure(`bands[${index}].deck`, `deck is ${deckChars} characters; maximum is ${MAX_HEADING_CHARS}`, { specPath }));
    }

    const visual = band.visual;
    if (visual !== undefined && !isObject(visual)) {
      failures.push(failure(`bands[${index}].visual`, `bands[${index}].visual must be an object`, { specPath }));
      continue;
    }
    if (!visual) {
      if (mode === "automatic" && band.pattern === "canvas") {
        failures.push(failure(`bands[${index}].visual`, `canvas band ${index + 1} requires a visual declaration`, { specPath }));
      }
      continue;
    }

    if (visual.evidence !== undefined && !Array.isArray(visual.evidence)) {
      failures.push(failure(`bands[${index}].visual.evidence`, `bands[${index}].visual.evidence must be an array`, { specPath }));
    }
    if (visual.nodes !== undefined && !Array.isArray(visual.nodes)) {
      failures.push(failure(`bands[${index}].visual.nodes`, `bands[${index}].visual.nodes must be an array`, { specPath }));
    }
    let dataValidationPassed = false;
    if (visual.data !== undefined) {
      if (band.pattern !== "canvas" || visual.family !== "illustration") {
        failures.push(failure(
          `bands[${index}].visual.data`,
          `visual.data requires a canvas band with visual.family "illustration"`,
          { specPath },
        ));
      }
      const dataFailures = validateDataVignette(visual.data);
      dataValidationPassed = dataFailures.length === 0;
      for (const dataFailure of dataFailures) {
        const field = dataFailure.field === "data"
          ? `bands[${index}].visual.data`
          : `bands[${index}].visual.data.${dataFailure.field}`;
        failures.push(failure(field, dataFailure.reason, { specPath }));
      }
      if (dataValidationPassed) {
        const outlinePathFailure = collectDataOutlinePathFailure(spec, band, index, { specPath });
        if (outlinePathFailure) failures.push(outlinePathFailure);
      }
    }

    const image = visual.image;
    if (visual.family === "illustration" && (!isObject(image) || typeof image.file !== "string" || image.file.trim() === "")) {
      failures.push(failure(`bands[${index}].visual.image.file`, `bands[${index}].visual.image.file is required for illustration visuals`, { specPath }));
    }
    if (image !== undefined && !isObject(image)) {
      failures.push(failure(`bands[${index}].visual.image`, `bands[${index}].visual.image must be an object`, { specPath }));
    } else if (isObject(image)) {
      for (const key of ["use", "description"]) {
        if (typeof image[key] !== "string" || image[key].trim() === "") {
          failures.push(failure(`bands[${index}].visual.image.${key}`, `bands[${index}].visual.image.${key} is required and must be distinct`, { specPath }));
        }
      }
      if (
        typeof image.use === "string" && image.use.trim() !== "" &&
        typeof image.description === "string" && image.description.trim() !== "" &&
        image.use.trim() === image.description.trim()
      ) {
        failures.push(failure(`bands[${index}].visual.image.description`, `bands[${index}].visual.image.description must be distinct from use`, { specPath }));
      }
      if (typeof image.file === "string" && image.file.trim() !== "") {
        const root = resolve(specDir ?? (specPath ? dirname(resolve(specPath)) : process.cwd()));
        const resolved = resolve(root, image.file);
        const rel = relative(root, resolved);
        if (isAbsolute(image.file) || rel === ".." || rel.startsWith(`..${"/"}`)) {
          failures.push(failure(`bands[${index}].visual.image.file`, `image file must stay within the deck directory`, { specPath }));
        }
      }
    }

    const thesisChars = chars(visual.thesis);
    if (thesisChars > CONTENT_BUDGETS.thesisChars) {
      failures.push(failure(`bands[${index}].visual.thesis`, `visual.thesis is ${thesisChars} characters; it renders as one line of at most ${CONTENT_BUDGETS.thesisChars}`, { specPath }));
    }
    const inspectChars = chars(visual.inspect);
    if (inspectChars > CONTENT_BUDGETS.inspectChars) {
      failures.push(failure(`bands[${index}].visual.inspect`, `visual.inspect is ${inspectChars} characters; keep it to ${CONTENT_BUDGETS.inspectChars}`, { specPath }));
    }
    const explanationWords = words(visual.explanation);
    if (explanationWords > CONTENT_BUDGETS.explanationWords) {
      failures.push(failure(`bands[${index}].visual.explanation`, `visual.explanation is ${explanationWords} words; the renderer truncates past approximately 130`, { specPath }));
    }
    const footerParts = chars(renderedFooterParts(band, index).join("  •  "));
    if (footerParts > CONTENT_BUDGETS.footerChars) {
      failures.push(failure(`bands[${index}].visual`, `visual footer content is ${footerParts} characters; rendered column holds approximately ${CONTENT_BUDGETS.footerChars}`, { specPath }));
    }
    if (mode === "automatic" && visual.family === "illustration" && visual.data && dataValidationPassed) {
      const dataExplanationParts = [
        cleanText(visual.explanation, band.deck),
        visual.example ? `Example — ${cleanText(visual.example)}` : "",
      ].filter(Boolean).join("  •  ");
      const dataBoundaryParts = [
        visual.tradeoff ? `Boundary — ${cleanText(visual.tradeoff)}` : "",
        ...(Array.isArray(visual.evidence) ? visual.evidence : []).map((item) => `Evidence — ${cleanText(item)}`),
        ...dataIllustrationCalloutParts(band),
      ].filter(Boolean).join("  •  ");
      const plannedBand = plannedDeck?.bands?.[index];
      const bodyWidth = PAGE_WIDTH - 2 * BODY_INSET;
      const bodyHeight = Math.max(1, Number(plannedBand?.height) || 1);
      failures.push(...collectDataNativeCapacityFailures(band, index, { bodyWidth, specPath }));
      const explanationLines = estimateWrappedLines(dataExplanationParts, bodyWidth * 0.46, 26);
      const explanationAvailableHeight = bodyHeight * (1 - DATA_EDITORIAL_START);
      const explanationRequiredHeight = explanationLines * DATA_EDITORIAL_LINE_HEIGHT_PX + DATA_BOUND_TEXT_MARGIN_PX;
      if (dataExplanationParts && explanationRequiredHeight > explanationAvailableHeight) {
        failures.push(failure(
          `bands[${index}].visual`,
          `data illustration explanation needs ${explanationLines} wrapped lines (${explanationRequiredHeight}px) but only ${explanationAvailableHeight}px remains in the ${bodyHeight}px body`,
          { specPath, recovery: DATA_EDITORIAL_RECOVERY },
        ));
      }
      const inspectY = visual.inspect ? Math.min(0.95, Math.max(0.82, 1 - 36 / bodyHeight)) : 1;
      const boundaryLines = estimateWrappedLines(dataBoundaryParts, bodyWidth * 0.44, 23);
      const boundaryAvailableHeight = bodyHeight * Math.max(0, inspectY - DATA_BOUNDARY_START);
      const boundaryRequiredHeight = boundaryLines * DATA_BOUNDARY_LINE_HEIGHT_PX + DATA_BOUND_TEXT_MARGIN_PX;
      if (dataBoundaryParts && boundaryRequiredHeight > boundaryAvailableHeight) {
        failures.push(failure(
          `bands[${index}].visual`,
          `data illustration boundary needs ${boundaryLines} wrapped lines (${boundaryRequiredHeight}px) but only ${boundaryAvailableHeight}px remains in the ${bodyHeight}px body`,
          { specPath, recovery: DATA_EDITORIAL_RECOVERY },
        ));
      }
      if (visual.inspect) {
        const inspectText = `Inspect — ${cleanText(visual.inspect)}`;
        const inspectLines = estimateWrappedLines(inspectText, bodyWidth * 0.44, 23);
        const inspectAvailableHeight = bodyHeight * Math.max(0, 1 - inspectY);
        const inspectRequiredHeight = inspectLines * DATA_BOUNDARY_LINE_HEIGHT_PX;
        if (inspectRequiredHeight > inspectAvailableHeight) {
          failures.push(failure(
            `bands[${index}].visual.inspect`,
            `data illustration inspect needs ${inspectLines} wrapped lines (${inspectRequiredHeight}px) but only ${inspectAvailableHeight}px remains in the ${bodyHeight}px body`,
            { specPath, recovery: DATA_EDITORIAL_RECOVERY },
          ));
        }
      }
    }
    if (visual.callouts !== undefined && !Array.isArray(visual.callouts)) {
      failures.push(failure(`bands[${index}].visual.callouts`, `visual.callouts must be an array`, { specPath }));
    }
    for (const [calloutIndex, callout] of (Array.isArray(visual.callouts) ? visual.callouts : []).entries()) {
      const label = typeof callout === "string" ? "" : callout?.label;
      const note = typeof callout === "string" ? callout : callout?.note ?? callout?.text;
      if (callout && typeof callout === "object" && !Array.isArray(callout) && Object.prototype.hasOwnProperty.call(callout, "kind")) {
        if (typeof callout.kind !== "string" || callout.kind.trim() === "") {
          failures.push(failure(`bands[${index}].visual.callouts[${calloutIndex}].kind`, "callout kind must be a non-empty string when provided", { specPath }));
        } else if (!SEMANTIC_KINDS.has(callout.kind.trim())) {
          failures.push(failure(`bands[${index}].visual.callouts[${calloutIndex}].kind`, `unsupported semantic icon kind "${callout.kind.trim()}"`, { specPath }));
        }
      }
      const labelLength = chars(label);
      const noteLength = chars(note);
      if (labelLength > CONTENT_BUDGETS.calloutLabelChars) {
        failures.push(failure(`bands[${index}].visual.callouts[${calloutIndex}].label`, `callout label is ${labelLength} characters; keep it to ${CONTENT_BUDGETS.calloutLabelChars}`, { specPath }));
      }
      if (noteLength > CONTENT_BUDGETS.calloutNoteChars) {
        failures.push(failure(`bands[${index}].visual.callouts[${calloutIndex}].note`, `callout note is ${noteLength} characters; keep it to ${CONTENT_BUDGETS.calloutNoteChars}`, { specPath }));
      }
    }
  }
  return failures;
}

async function collectAssetFailures(spec, { specPath, specDir } = {}) {
  const failures = [];
  const root = resolve(specDir ?? (specPath ? dirname(resolve(specPath)) : process.cwd()));
  const bands = Array.isArray(spec?.bands) ? spec.bands : [];
  for (const [index, band] of bands.entries()) {
    const image = band?.visual?.image;
    if (!image || typeof image.file !== "string" || image.file.trim() === "") continue;
    const field = `bands[${index}].visual.image.file`;
    try {
      const file = await resolveAssetWithinRoot(root, image.file, { label: field });
      await access(file, constants.R_OK);
      const bytes = await readFile(file);
      if (bytes.length < 33 || bytes.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) {
        failures.push(failure(field, `${field} must be a readable PNG with an IHDR header`, { specPath }));
        continue;
      }
      const ihdrLength = bytes.readUInt32BE(8);
      const ihdrType = bytes.subarray(12, 16).toString("ascii");
      if (ihdrLength !== 13 || ihdrType !== "IHDR") {
        failures.push(failure(field, `${field} PNG is truncated or missing its IHDR header`, { specPath }));
        continue;
      }
      let offset = 8;
      let sawIhdr = false;
      let sawIend = false;
      let sawIdat = false;
      let malformed = false;
      while (offset < bytes.length) {
        if (bytes.length - offset < 12) {
          malformed = true;
          break;
        }
        const chunkLength = bytes.readUInt32BE(offset);
        const chunkType = bytes.subarray(offset + 4, offset + 8).toString("ascii");
        const chunkEnd = offset + 12 + chunkLength;
        if (chunkEnd > bytes.length) {
          malformed = true;
          break;
        }
        if (!/^[A-Za-z]{4}$/.test(chunkType)) {
          malformed = true;
          break;
        }
        const crcOffset = offset + 8 + chunkLength;
        if (crc32(bytes.subarray(offset + 4, crcOffset)) !== bytes.readUInt32BE(crcOffset)) {
          malformed = true;
          break;
        }
        if (offset === 8 && (chunkType !== "IHDR" || chunkLength !== 13)) {
          malformed = true;
          break;
        }
        if (chunkType === "IHDR") sawIhdr = true;
        if (chunkType === "IDAT" && chunkLength > 0) sawIdat = true;
        if (chunkType === "IEND") {
          if (chunkLength !== 0 || chunkEnd !== bytes.length) malformed = true;
          sawIend = true;
          break;
        }
        offset = chunkEnd;
      }
      if (malformed || !sawIhdr || !sawIend || !sawIdat) {
        const reason = !sawIdat && sawIend
          ? `${field} PNG must include at least one non-empty IDAT chunk`
          : `${field} PNG is truncated or has invalid chunk boundaries or CRCs`;
        failures.push(failure(field, reason, { specPath }));
        continue;
      }
      const width = bytes.readUInt32BE(16);
      const height = bytes.readUInt32BE(20);
      if (width <= 0 || height <= 0) {
        failures.push(failure(field, `${field} PNG dimensions must be positive (measured ${width}x${height})`, { specPath }));
      }
    } catch (cause) {
      failures.push(failure(field, `${field} is not readable`, { specPath, recovery: "Provide a readable PNG at the deck-relative image path." }));
    }
  }
  return failures;
}

export async function preflightDeck({ specPath, spec, mode = "automatic" } = {}) {
  let loaded = spec;
  const failures = [];
  if (loaded === undefined) {
    if (!specPath) {
      failures.push(failure("spec", "deck spec path is required", { specPath }));
      return { ok: false, failures };
    }
    try {
      loaded = await readJsonInput(specPath, { label: "deck spec" });
    } catch (error) {
      failures.push(error instanceof CliError ? { ...error, stage: error.stage ?? "preflight" } : failure("spec", String(error), { specPath }));
      return { ok: false, failures };
    }
  }
  const specDir = specPath ? dirname(resolve(specPath)) : process.cwd();
  failures.push(...collectDeckPreflightFailures(loaded, { specPath, specDir, mode }));
  failures.push(...(await collectAssetFailures(loaded, { specPath, specDir })));
  return { ok: failures.length === 0, failures, spec: loaded };
}
