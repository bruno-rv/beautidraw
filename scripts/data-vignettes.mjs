// Small, bounded, native data scenes for semantic canvas bands.
//
// The data is intentionally pedagogical: IDs and numbers are toy examples,
// never claims about a real tokenizer or model. The renderer returns the
// normalized composition skeletons consumed by scripts/compose.mjs.

import { RAMP, fontForRole } from "./layout.mjs";

export const DATA_VIGNETTE_KINDS = new Set(["token-sequence", "lookup", "distribution"]);

export const DATA_VIGNETTE_LIMITS = Object.freeze({
  captionChars: 120,
  keyChars: 24,
  pieces: 8,
  pieceChars: 18,
  ids: 18,
  lookupRows: 5,
  vectorDimensions: 4,
  vectorAbs: 1,
  candidates: 6,
  candidateChars: 18,
});

export const DATA_VIGNETTE_VIEWPORT = Object.freeze({ minWidth: 0.68, minHeight: 0.76 });

const SUM_EPSILON = 1e-6;
const TOY_ID = /^toy-[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function addFailure(failures, field, reason) {
  failures.push({ field, reason });
}

function stringFailure(failures, value, field, { max, label = "value", required = true, canonical = false, countTrimmed = true } = {}) {
  if (typeof value !== "string" || (required && value.trim() === "")) {
    addFailure(failures, field, `${label} must be a non-empty string`);
    return false;
  }
  if (value.includes("\n") || value.includes("\r")) {
    addFailure(failures, field, `${label} must stay on one line`);
    return false;
  }
  let valid = true;
  if (canonical && value !== value.trim()) {
    addFailure(failures, field, `${label} must not have leading or trailing whitespace`);
    valid = false;
  }
  const length = countTrimmed ? value.trim().length : value.length;
  if (Number.isFinite(max) && length > max) {
    addFailure(failures, field, `${label} is ${length} characters; maximum is ${max}`);
    return false;
  }
  return valid;
}

function toyIdFailure(failures, value, field) {
  if (!stringFailure(failures, value, field, { max: DATA_VIGNETTE_LIMITS.ids, label: "toy ID", canonical: true })) return false;
  if (!TOY_ID.test(value.trim())) {
    addFailure(failures, field, 'toy ID must use the explicit "toy-" prefix');
    return false;
  }
  return true;
}

function validateCaption(failures, caption) {
  if (!stringFailure(failures, caption, "caption", { max: DATA_VIGNETTE_LIMITS.captionChars, label: "caption" })) return;
  if (!/synthetic illustrative example/i.test(caption)) {
    addFailure(failures, "caption", 'caption must say "synthetic illustrative example"');
  }
  if (!/(?:toy|not\s+(?:a\s+)?real|not\s+actual)/i.test(caption)) {
    addFailure(failures, "caption", "caption must identify toy data or state that it is not real output");
  }
}

function validatePiece(failures, piece, index, ids) {
  const field = `pieces[${index}]`;
  if (!isObject(piece)) {
    addFailure(failures, field, "piece must be an object with text and id");
    return;
  }
  stringFailure(failures, piece.text, `${field}.text`, {
    max: DATA_VIGNETTE_LIMITS.pieceChars,
    label: "piece text",
    countTrimmed: false,
  });
  if (toyIdFailure(failures, piece.id, `${field}.id`)) {
    if (ids.has(piece.id)) addFailure(failures, `${field}.id`, "toy IDs must be unique");
    ids.add(piece.id);
  }
}

function selectedRowValue(data) {
  if (Object.prototype.hasOwnProperty.call(data, "selected")) return data.selected;
  if (typeof data.selectedRow === "string") return data.selectedRow;
  if (isObject(data.selectedRow)) return data.selectedRow.id ?? data.selectedRow.key;
  return undefined;
}

function rowId(row) {
  return row?.id ?? row?.key;
}

function validateVector(failures, vector, field, expectedDimensions) {
  if (!Array.isArray(vector) || vector.length < 2 || vector.length > DATA_VIGNETTE_LIMITS.vectorDimensions) {
    addFailure(failures, field, `vector must have 2-${DATA_VIGNETTE_LIMITS.vectorDimensions} numbers`);
    return;
  }
  if (expectedDimensions !== undefined && vector.length !== expectedDimensions) {
    addFailure(failures, field, `vector must use the same ${expectedDimensions} dimensions as the other rows`);
  }
  vector.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      addFailure(failures, `${field}[${index}]`, "vector values must be finite numbers");
    } else if (Math.abs(value) > DATA_VIGNETTE_LIMITS.vectorAbs) {
      addFailure(failures, `${field}[${index}]`, `vector values must stay between -${DATA_VIGNETTE_LIMITS.vectorAbs} and ${DATA_VIGNETTE_LIMITS.vectorAbs}`);
    }
  });
}

function validateLookup(failures, data) {
  if (!stringFailure(failures, data.key, "key", { max: DATA_VIGNETTE_LIMITS.keyChars, label: "lookup key", canonical: true })) return;
  if (!Array.isArray(data.rows) || data.rows.length < 2 || data.rows.length > DATA_VIGNETTE_LIMITS.lookupRows) {
    addFailure(failures, "rows", `rows must contain 2-${DATA_VIGNETTE_LIMITS.lookupRows} entries`);
    return;
  }
  const ids = new Set();
  let dimensions;
  for (const [index, row] of data.rows.entries()) {
    const field = `rows[${index}]`;
    if (!isObject(row)) {
      addFailure(failures, field, "row must be an object with id, label, and vector");
      continue;
    }
    const id = rowId(row);
    if (toyIdFailure(failures, id, `${field}.id`)) {
      if (ids.has(id)) addFailure(failures, `${field}.id`, "row toy IDs must be unique");
      ids.add(id);
    }
    stringFailure(failures, row.label, `${field}.label`, {
      max: DATA_VIGNETTE_LIMITS.candidateChars,
      label: "row label",
      canonical: true,
    });
    if (Array.isArray(row.vector) && dimensions === undefined) dimensions = row.vector.length;
    validateVector(failures, row.vector, `${field}.vector`, dimensions);
  }
  const selected = selectedRowValue(data);
  if (!toyIdFailure(failures, selected, "selected")) return;
  if (!ids.has(selected)) addFailure(failures, "selected", "selected row must identify one of rows");
}

function validateDistribution(failures, data) {
  if (!Array.isArray(data.candidates) || data.candidates.length < 2 || data.candidates.length > DATA_VIGNETTE_LIMITS.candidates) {
    addFailure(failures, "candidates", `candidates must contain 2-${DATA_VIGNETTE_LIMITS.candidates} entries`);
    return;
  }
  const labels = new Set();
  let sum = 0;
  let positiveAlternatives = 0;
  for (const [index, candidate] of data.candidates.entries()) {
    const field = `candidates[${index}]`;
    if (!isObject(candidate)) {
      addFailure(failures, field, "candidate must be an object with label and probability");
      continue;
    }
    if (stringFailure(failures, candidate.label, `${field}.label`, {
      max: DATA_VIGNETTE_LIMITS.candidateChars,
      label: "candidate label",
      canonical: true,
    })) {
      if (labels.has(candidate.label)) addFailure(failures, `${field}.label`, "candidate labels must be unique");
      labels.add(candidate.label);
    }
    if (!Number.isFinite(candidate.probability)) {
      addFailure(failures, `${field}.probability`, "probability must be a finite number");
      continue;
    }
    if (candidate.probability <= 0 || candidate.probability > 1) {
      addFailure(failures, `${field}.probability`, "probability must be greater than 0 and at most 1");
    }
    sum += candidate.probability;
  }
  if (Math.abs(sum - 1) > SUM_EPSILON) {
    addFailure(failures, "candidates", `probabilities must sum to 1 (measured ${sum})`);
  }
  if (!stringFailure(failures, data.selected, "selected", { max: DATA_VIGNETTE_LIMITS.candidateChars, label: "selected candidate", canonical: true })) return;
  if (!labels.has(data.selected)) addFailure(failures, "selected", "selected candidate must identify one of candidates");
  for (const candidate of data.candidates) {
    if (candidate?.label !== data.selected && Number.isFinite(candidate?.probability) && candidate.probability > 0) positiveAlternatives += 1;
  }
  if (positiveAlternatives === 0) addFailure(failures, "candidates", "distribution must retain at least one alternative candidate");
}

export function validateDataVignette(data) {
  const failures = [];
  if (!isObject(data)) {
    addFailure(failures, "data", "visual.data must be an object");
    return failures;
  }
  if (!DATA_VIGNETTE_KINDS.has(data.kind)) {
    addFailure(failures, "kind", `kind must be one of ${[...DATA_VIGNETTE_KINDS].join(", ")}`);
    return failures;
  }
  validateCaption(failures, data.caption);
  if (data.kind === "token-sequence") {
    if (!Array.isArray(data.pieces) || data.pieces.length < 2 || data.pieces.length > DATA_VIGNETTE_LIMITS.pieces) {
      addFailure(failures, "pieces", `pieces must contain 2-${DATA_VIGNETTE_LIMITS.pieces} entries`);
    } else {
      const ids = new Set();
      data.pieces.forEach((piece, index) => validatePiece(failures, piece, index, ids));
    }
  } else if (data.kind === "lookup") {
    validateLookup(failures, data);
  } else {
    validateDistribution(failures, data);
  }
  return failures;
}

function normalizedData(data) {
  if (data.kind === "token-sequence") {
    return { ...data, pieces: data.pieces.map((piece) => ({ text: piece.text, id: piece.id })) };
  }
  if (data.kind === "lookup") {
    const selected = selectedRowValue(data).trim();
    return {
      ...data,
      key: data.key,
      selected,
      rows: data.rows.map((row) => ({ id: rowId(row), label: row.label, vector: [...row.vector] })),
    };
  }
  return {
    ...data,
    selected: data.selected,
    candidates: data.candidates.map((candidate) => ({ label: candidate.label, probability: candidate.probability })),
  };
}

function ensureValid(data) {
  const failures = validateDataVignette(data);
  if (failures.length) {
    throw new Error(`data vignette validation failed: ${failures.map(({ field, reason }) => `${field}: ${reason}`).join("; ")}`);
  }
  return normalizedData(data);
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return String(value);
  return new Intl.NumberFormat("en-US", {
    useGrouping: false,
    maximumSignificantDigits: 17,
  }).format(value);
}

export function formatProbabilityLabel(probability) {
  if (!Number.isFinite(probability) || probability <= 0) return "0%";
  const percentage = probability * 100;
  if (percentage < 0.01) return `${percentage.toExponential(2)}%`;
  if (percentage >= 99.995) return `${formatNumber(percentage)}%`;
  const decimals = percentage >= 10 ? 2 : percentage >= 1 ? 3 : 4;
  return `${percentage.toFixed(decimals)}%`;
}

function markdownText(value) {
  return String(value).replace(/[\\`*_#[\]()>|]/g, "\\$&");
}

function codeToken(value) {
  return `\`${String(value).replace(/[\r\n`]/g, "") }\``;
}

function visibleToken(value) {
  return value.replace(/^[ \t]+|[ \t]+$/g, (whitespace) => "␠".repeat(whitespace.length));
}

export function dataVignetteOutline(data) {
  const normalized = ensureValid(data);
  const lines = [
    `**Data vignette:** ${markdownText(normalized.kind)}`,
    `- **Caption:** ${markdownText(normalized.caption)}`,
  ];
  if (normalized.kind === "token-sequence") {
    lines.push("- **Pieces and toy IDs:**");
    for (const piece of normalized.pieces) lines.push(`  - ${codeToken(JSON.stringify(piece.text))} → ${codeToken(piece.id)}`);
  } else if (normalized.kind === "lookup") {
    lines.push(`- **Lookup key:** ${codeToken(normalized.key)}`);
    lines.push("- **Rows:**");
    for (const row of normalized.rows) lines.push(`  - ${codeToken(row.id)} — ${markdownText(row.label)} → ${codeToken(`[${row.vector.map(formatNumber).join(", ")}]`)}`);
    const selected = normalized.rows.find((row) => row.id === normalized.selected);
    lines.push(`- **Selected row:** ${codeToken(normalized.selected)} — ${markdownText(selected.label)} → ${codeToken(`[${selected.vector.map(formatNumber).join(", ")}]`)}`);
  } else {
    lines.push("- **Candidates and probabilities:**");
    for (const candidate of normalized.candidates) {
      lines.push(`  - ${markdownText(candidate.label)} — ${codeToken(formatNumber(candidate.probability))} probability (${codeToken(formatProbabilityLabel(candidate.probability))})`);
    }
    const selected = normalized.candidates.find((candidate) => candidate.label === normalized.selected);
    lines.push(`- **Selected candidate:** ${markdownText(selected.label)} — ${codeToken(formatNumber(selected.probability))}`);
  }
  return lines.join("\n");
}

function viewport(options = {}) {
  const values = {
    idPrefix: options.idPrefix ?? "data-vignette",
    x: options.x ?? 0,
    y: options.y ?? 0,
    width: options.width ?? 1,
    height: options.height ?? 1,
    dark: options.dark === true,
  };
  if (typeof values.idPrefix !== "string" || !/^[a-z0-9-]+$/.test(values.idPrefix)) {
    throw new Error("data vignette idPrefix must use lowercase letters, digits, and hyphens");
  }
  for (const key of ["x", "y", "width", "height"]) {
    if (!Number.isFinite(values[key])) throw new Error(`data vignette ${key} must be finite`);
  }
  if (values.x < 0 || values.y < 0 || values.width <= 0 || values.height <= 0 || values.x + values.width > 1 || values.y + values.height > 1) {
    throw new Error("data vignette viewport must stay within normalized 0..1 bounds");
  }
  if (values.width < DATA_VIGNETTE_VIEWPORT.minWidth || values.height < DATA_VIGNETTE_VIEWPORT.minHeight) {
    throw new Error(`data vignette viewport must be at least ${DATA_VIGNETTE_VIEWPORT.minWidth} wide and ${DATA_VIGNETTE_VIEWPORT.minHeight} high`);
  }
  return values;
}

function theme(dark) {
  return {
    text: dark ? "#f8fafc" : "#1e293b",
    muted: dark ? "#cbd5e1" : "#475569",
    border: dark ? "#94a3b8" : "#64748b",
    surface: dark ? "#0f172a" : "#ffffff",
    selectedFill: dark ? "#78350f" : "#fef3c7",
    selectedStroke: dark ? "#f59e0b" : "#b45309",
    accentFill: dark ? "#064e3b" : "#d1fae5",
    accentStroke: dark ? "#34d399" : "#047857",
    secondaryFill: dark ? "#1e3a5f" : "#dbeafe",
    secondaryStroke: dark ? "#93c5fd" : "#1e3a5f",
    neutralFill: dark ? "#1e293b" : "#f1f5f9",
  };
}

function idFor(prefix, suffix) {
  return `${prefix}-${suffix}`;
}

function absolute(area, rx, ry, rw = 0, rh = 0) {
  return {
    x: area.x + area.width * rx,
    y: area.y + area.height * ry,
    width: area.width * rw,
    height: area.height * rh,
  };
}

function textElement(area, id, rx, ry, value, color, role = "prose", maxWidth = 1) {
  const font = fontForRole(role);
  const { x, y } = absolute(area, rx, ry);
  return {
    id: idFor(area.idPrefix, id),
    type: "text",
    x,
    y,
    text: value,
    fontSize: role === "handwritten" ? 18 : RAMP.note,
    fontFamily: font.family,
    role,
    strokeColor: color,
    customData: {
      beautidrawRole: role,
      beautidrawMeasuredText: true,
      beautidrawMaxWidth: area.width * maxWidth,
      beautidrawCompositionKind: "data-vignette-text",
    },
  };
}

function box(area, id, rx, ry, rw, rh, label, {
  role = "prose",
  fill,
  stroke,
  textColor,
  textAlign = "center",
  strokeWidth = 2,
  customData = {},
} = {}) {
  const font = fontForRole(role);
  const bounds = absolute(area, rx, ry, rw, rh);
  return {
    id: idFor(area.idPrefix, id),
    type: "rectangle",
    ...bounds,
    strokeColor: stroke,
    backgroundColor: fill,
    fillStyle: "solid",
    strokeWidth,
    roughness: 0,
    role,
    customData: {
      ...customData,
      beautidrawRole: role,
      beautidrawAutoSize: true,
      beautidrawCompositionKind: "data-vignette",
    },
    label: {
      text: label,
      fontSize: RAMP.note,
      fontFamily: font.family,
      role,
      strokeColor: textColor,
      roughness: 0,
      textAlign,
    },
  };
}

function line(area, id, rx, ry, rw, rh, points, strokeColor) {
  const bounds = absolute(area, rx, ry, rw, rh);
  return {
    id: idFor(area.idPrefix, id),
    type: "line",
    ...bounds,
    points,
    strokeColor,
    strokeWidth: 2,
    roughness: 0,
  };
}

function arrow(area, id, startX, startY, endX, endY, strokeColor) {
  const minX = Math.min(startX, endX);
  const minY = Math.min(startY, endY);
  const width = Math.max(Math.abs(endX - startX), 0.004);
  const height = Math.max(Math.abs(endY - startY), 0.004);
  const bounds = absolute(area, minX, minY, width, height);
  return {
    id: idFor(area.idPrefix, id),
    type: "arrow",
    ...bounds,
    points: [
      [(startX - minX) / width, (startY - minY) / height],
      [(endX - minX) / width, (endY - minY) / height],
    ],
    strokeColor,
    strokeWidth: 2,
    roughness: 0,
    endArrowhead: "arrow",
  };
}

function tokenSequence(data, area, colors) {
  const elements = [
    textElement(area, "caption", 0.02, 0.03, data.caption, colors.text, "prose", 0.96),
    textElement(area, "piece-guide", 0.02, 0.18, "Toy token pieces → aligned toy IDs (␠ marks a boundary space)", colors.muted, "prose", 0.96),
  ];
  const gap = Math.min(0.018, 0.12 / data.pieces.length);
  const totalWidth = 0.94;
  const pieceWidth = (totalWidth - gap * (data.pieces.length - 1)) / data.pieces.length;
  data.pieces.forEach((piece, index) => {
    const x = 0.03 + index * (pieceWidth + gap);
    const fill = index % 2 ? colors.accentFill : colors.secondaryFill;
    const stroke = index % 2 ? colors.accentStroke : colors.secondaryStroke;
    elements.push(box(area, `piece-${index + 1}`, x, 0.30, pieceWidth, 0.15, visibleToken(piece.text), {
      fill,
      stroke,
      textColor: colors.text,
      customData: { beautidrawDataValue: piece.text },
    }));
    elements.push(line(area, `piece-link-${index + 1}`, x + pieceWidth / 2 - 0.002, 0.45, 0.004, 0.06, [[0.5, 0], [0.5, 1]], colors.border));
    elements.push(box(area, `id-${index + 1}`, x, 0.52, pieceWidth, 0.12, piece.id, {
      role: "mono",
      fill: colors.surface,
      stroke: colors.border,
      textColor: colors.text,
    }));
  });
  elements.push(textElement(area, "alignment-note", 0.02, 0.72, "Each toy ID is an address for the piece directly above it.", colors.muted, "prose", 0.96));
  return elements;
}

function lookup(data, area, colors) {
  const elements = [
    textElement(area, "caption", 0.02, 0.03, data.caption, colors.text, "prose", 0.96),
    textElement(area, "lookup-key", 0.02, 0.18, `Lookup key: ${data.key}`, colors.muted, "mono", 0.62),
  ];
  const idX = 0.02;
  const idWidth = 0.20;
  const labelX = 0.24;
  const labelWidth = 0.20;
  const vectorX = 0.46;
  const vectorWidth = 0.28;
  const outputX = 0.78;
  const outputWidth = 0.19;
  const rowTop = 0.37;
  const rowGap = 0.012;
  const rowHeight = Math.min(0.07, 0.40 / data.rows.length);
  elements.push(box(area, "id-heading", idX, 0.27, idWidth, 0.075, "Toy ID", {
    fill: colors.neutralFill,
    stroke: colors.border,
    textColor: colors.text,
  }));
  elements.push(box(area, "label-heading", labelX, 0.27, labelWidth, 0.075, "Piece", {
    fill: colors.neutralFill,
    stroke: colors.border,
    textColor: colors.text,
  }));
  elements.push(box(area, "vector-heading", vectorX, 0.27, vectorWidth, 0.075, "Toy vector", {
    fill: colors.neutralFill,
    stroke: colors.border,
    textColor: colors.text,
  }));
  let selectedY = rowTop;
  data.rows.forEach((row, index) => {
    const y = rowTop + index * (rowHeight + rowGap);
    const selected = row.id === data.selected;
    if (selected) selectedY = y;
    const fill = selected ? colors.selectedFill : colors.surface;
    const stroke = selected ? colors.selectedStroke : colors.border;
    elements.push(box(area, `row-${index + 1}-id`, idX, y, idWidth, rowHeight, row.id, {
      role: "mono",
      fill,
      stroke,
      textColor: colors.text,
      strokeWidth: selected ? 3 : 2,
    }));
    elements.push(box(area, `row-${index + 1}-label`, labelX, y, labelWidth, rowHeight, row.label, {
      fill,
      stroke,
      textColor: colors.text,
      strokeWidth: selected ? 3 : 2,
    }));
    elements.push(box(area, `row-${index + 1}-vector`, vectorX, y, vectorWidth, rowHeight, `[${row.vector.map(formatNumber).join(", ")}]`, {
      role: "mono",
      fill,
      stroke,
      textColor: colors.text,
      strokeWidth: selected ? 3 : 2,
    }));
  });
  const outputY = Math.min(0.69, Math.max(0.42, selectedY - 0.02));
  const selectedRow = data.rows.find((row) => row.id === data.selected);
  elements.push(arrow(area, "selected-arrow", vectorX + vectorWidth, selectedY + rowHeight / 2, outputX, outputY + 0.08, colors.selectedStroke));
  elements.push(box(area, "result-heading", outputX, outputY, outputWidth, 0.09, "Resulting vector", {
    fill: colors.accentFill,
    stroke: colors.accentStroke,
    textColor: colors.text,
    strokeWidth: 3,
  }));
  elements.push(box(area, "result-vector", outputX, outputY + 0.10, outputWidth, 0.14, `[${selectedRow.vector.map(formatNumber).join(", ")}]`, {
    role: "mono",
    fill: colors.surface,
    stroke: colors.accentStroke,
    textColor: colors.text,
    strokeWidth: 3,
  }));
  elements.push(textElement(area, "lookup-note", 0.02, 0.91, "The selected row is copied as the toy input vector.", colors.muted, "prose", 0.65));
  return elements;
}

function distribution(data, area, colors) {
  const elements = [
    textElement(area, "caption", 0.02, 0.03, data.caption, colors.text, "prose", 0.96),
    textElement(area, "probability-heading", 0.02, 0.18, "Toy probability bars · retained alternatives", colors.muted, "prose", 0.96),
  ];
  const labelX = 0.02;
  const labelWidth = 0.24;
  const barX = 0.30;
  const barWidth = 0.55;
  const valueX = 0.88;
  const valueWidth = 0.10;
  const rowTop = 0.27;
  const rowGap = 0.008;
  const rowHeight = Math.min(0.085, 0.54 / data.candidates.length);
  data.candidates.forEach((candidate, index) => {
    const y = rowTop + index * (rowHeight + rowGap);
    const selected = candidate.label === data.selected;
    const fill = selected ? colors.selectedFill : colors.surface;
    const stroke = selected ? colors.selectedStroke : colors.border;
    elements.push(box(area, `candidate-${index + 1}-label`, labelX, y, labelWidth, rowHeight, candidate.label, {
      fill,
      stroke,
      textColor: colors.text,
      strokeWidth: selected ? 3 : 2,
    }));
    elements.push(line(area, `candidate-${index + 1}-baseline`, barX, y + rowHeight / 2 - 0.002, barWidth, 0.004, [[0, 0.5], [1, 0.5]], colors.border));
    elements.push({
      ...absolute(area, barX, y + 0.025, barWidth * candidate.probability, Math.max(0.022, rowHeight - 0.05)),
      id: idFor(area.idPrefix, `candidate-${index + 1}-bar`),
      type: "rectangle",
      strokeColor: selected ? colors.selectedStroke : (index % 2 ? colors.accentStroke : colors.secondaryStroke),
      backgroundColor: selected ? colors.selectedFill : (index % 2 ? colors.accentFill : colors.secondaryFill),
      fillStyle: "solid",
      strokeWidth: selected ? 3 : 2,
      roughness: 0,
      customData: { beautidrawCompositionKind: "data-vignette-bar" },
    });
    elements.push(box(area, `candidate-${index + 1}-value`, valueX, y, valueWidth, rowHeight, formatProbabilityLabel(candidate.probability), {
      role: "mono",
      fill,
      stroke,
      textColor: colors.text,
      strokeWidth: selected ? 3 : 2,
      customData: { beautidrawDataValue: candidate.probability },
    }));
  });
  const noteY = Math.min(0.86, rowTop + data.candidates.length * (rowHeight + rowGap) + 0.03);
  elements.push(textElement(area, "selected-note", 0.02, noteY, `Selected candidate: ${data.selected} · illustrative draw`, colors.muted, "prose", 0.96));
  return elements;
}

export function renderDataVignette(data, options = {}) {
  const normalized = ensureValid(data);
  const area = viewport(options);
  const colors = theme(area.dark);
  if (normalized.kind === "token-sequence") return tokenSequence(normalized, area, colors);
  if (normalized.kind === "lookup") return lookup(normalized, area, colors);
  return distribution(normalized, area, colors);
}
