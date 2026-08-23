import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, relative, resolve, dirname } from "node:path";

import { CliError } from "./cli.mjs";
import { planDeck } from "./layout.mjs";

export const CONTENT_BUDGETS = Object.freeze({
  thesisChars: 120,
  footerChars: 560,
  inspectChars: 84,
  explanationWords: 140,
  calloutLabelChars: 72,
  calloutNoteChars: 180,
});

const MAX_HEADING_CHARS = 2000;
const PNG_SIGNATURE = "89504e470d0a1a0a";

const words = (value) => String(value ?? "").trim().split(/\s+/).filter(Boolean).length;
const chars = (value) => String(value ?? "").trim().length;

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

export function collectDeckPreflightFailures(spec, { specPath, specDir } = {}) {
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

  try {
    planDeck(spec);
  } catch (error) {
    failures.push(failure("spec", error.message ?? String(error), { specPath }));
  }

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
      if (band.pattern === "canvas") {
        failures.push(failure(`bands[${index}].visual`, `canvas band ${index + 1} requires a visual declaration`, { specPath }));
      }
      continue;
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
    const footerParts = chars(visual.explanation) + (visual.example ? chars(visual.example) + 9 : 0) + (visual.tradeoff ? chars(visual.tradeoff) + 11 : 0) + Math.min((visual.evidence ?? []).length, 1) * ((visual.evidence ?? [])[0] ? chars(visual.evidence[0]) + 10 : 0);
    if (footerParts > CONTENT_BUDGETS.footerChars) {
      failures.push(failure(`bands[${index}].visual`, `visual footer content is ${footerParts} characters; rendered column holds approximately ${CONTENT_BUDGETS.footerChars}`, { specPath }));
    }
    if (visual.callouts !== undefined && !Array.isArray(visual.callouts)) {
      failures.push(failure(`bands[${index}].visual.callouts`, `visual.callouts must be an array`, { specPath }));
    }
    for (const [calloutIndex, callout] of (Array.isArray(visual.callouts) ? visual.callouts : []).entries()) {
      const label = typeof callout === "string" ? "" : callout?.label;
      const note = typeof callout === "string" ? callout : callout?.note ?? callout?.text;
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
    const file = resolve(root, image.file);
    const rel = relative(root, file);
    if (isAbsolute(image.file) || rel === ".." || rel.startsWith(`..${"/"}`)) continue;
    try {
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
        if (offset === 8 && (chunkType !== "IHDR" || chunkLength !== 13)) {
          malformed = true;
          break;
        }
        if (chunkType === "IHDR") sawIhdr = true;
        if (chunkType === "IEND") {
          if (chunkLength !== 0 || chunkEnd !== bytes.length) malformed = true;
          sawIend = true;
          break;
        }
        offset = chunkEnd;
      }
      if (malformed || !sawIhdr || !sawIend) {
        failures.push(failure(field, `${field} PNG is truncated or has invalid chunk boundaries`, { specPath }));
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

export async function preflightDeck({ specPath, spec } = {}) {
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
  failures.push(...collectDeckPreflightFailures(loaded, { specPath, specDir }));
  failures.push(...(await collectAssetFailures(loaded, { specPath, specDir })));
  return { ok: failures.length === 0, failures, spec: loaded };
}
