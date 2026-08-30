// Accessible, ordered Markdown output for a semantic deck.
//
// The canvas is the editing surface, not a screen-reader surface. This module
// deliberately keeps the output pure and source-relative so it can be written
// during the staged build without depending on Excalidraw or a browser.

import { isAbsolute, normalize, sep } from "node:path";

export const SEMANTIC_KINDS = new Set(["example", "boundary", "inspect", "warning"]);

const URL_RE = /https?:\/\/[^\s)]+/gi;
const PATH_RE = /(?:^|[\s(])((?:\.{0,2}\/)?(?:[A-Za-z0-9_.~-]+\/)+[A-Za-z0-9_.~:-]+|\/[A-Za-z0-9_.~:-]+(?:\/[A-Za-z0-9_.~:-]+)*)/g;
const FILE_URL_RE = /\bfile:\/\//i;
const WINDOWS_PATH_RE = /\b[A-Za-z]:[\\/][^\s`<>\])},;!?]+/;
const UNC_PATH_RE = /\\{2,}[^\\/\s]+[\\/]+[^\\/\s]+(?:[\\/]+[^\\/\s]+)*/;
const POSIX_PATH_RE = /(?<![A-Za-z0-9_.~-])\/[A-Za-z0-9_.~-]+(?:\/[A-Za-z0-9_.~:-]+)*/g;
const HOME_PATH_RE = /(?:^|[\s(])~(?:[^/\s]*)\/[A-Za-z0-9_.~:-]+(?:\/[A-Za-z0-9_.~:-]+)*/;
const SLASH_COMMANDS = new Set([
  "compact", "context", "deploy", "hooks", "memory", "name", "review-invoice", "status", "tasks",
  // Claude Code CLI command vocabulary (single-segment names, not filesystem paths):
  "add-dir", "agents", "artifacts", "auto-mode-setup", "autocompact", "autofix-pr", "advisor", "background",
  "batch", "branch", "bug", "btw", "cd", "chrome", "claude-api", "clear", "code-review", "color", "config",
  "copy", "cost", "dataviz", "debug", "deep-research", "desktop", "diff", "doctor", "effort", "exit", "export",
  "fast", "feedback", "fewer-permission-prompts", "focus", "fork", "goal", "heapdump", "help", "ide", "import",
  "insights", "install-github-app", "install-slack-app", "invoice", "keybindings", "list-agents", "login",
  "logout", "loop", "mobile", "mcp", "model", "passes", "plan", "plugin", "powerup", "pr-comments", "privacy-settings",
  "radio", "rate-limit-options", "recap", "release-notes", "reload-plugins", "reload-skills", "remote-control",
  "remote-env", "rename", "research", "resume", "rewind", "rules", "run", "run-skill-generator", "sandbox",
  "schedule", "scroll-speed", "security-review", "settings", "setup-bedrock", "setup-vertex", "simplify",
  "skills", "stickers", "stop", "stats", "statusline", "subtask", "team-onboarding", "teleport", "terminal-setup",
  "theme", "tui", "ultraplan", "ultrareview", "upgrade", "usage", "usage-credits", "verify", "vim", "voice",
  "web", "web-setup", "workflows", "init", "permissions", "review", "design-login", "design-sync",
]);

function hasAbsolutePath(value) {
  const source = String(value ?? "");
  if (FILE_URL_RE.test(source) || WINDOWS_PATH_RE.test(source) || UNC_PATH_RE.test(source) || HOME_PATH_RE.test(source)) return true;
  // Strip ordinary web URLs before checking slash-prefixed tokens: a URL path
  // is not a local filesystem path, while a file:// URL is explicitly unsafe.
  const withoutWebUrls = source.replace(/https?:\/\/[^\s)]+/gi, "");
  POSIX_PATH_RE.lastIndex = 0;
  for (const match of withoutWebUrls.matchAll(POSIX_PATH_RE)) {
    if (match.index > 0 && withoutWebUrls[match.index - 1] === "~") continue;
    const candidate = match[0].replace(/[.,;:!?)}\]]+$/, "");
    const segments = candidate.slice(1).split("/");
    if (segments.length === 1 && SLASH_COMMANDS.has(segments[0].toLowerCase())) continue;
    return true;
  }
  return false;
}

function text(value, where) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${where} must be a non-empty string`);
  }
  return value.trim();
}

function portablePath(value, where) {
  const path = text(value, where);
  if (isAbsolute(path) || path.startsWith("/") || /^~(?:[^/\s]*)\//.test(path) || /^[A-Za-z]:[\\/]/.test(path) || path.split(/[\\/]/).includes("..")) {
    throw new Error(`${where} must be a portable deck-relative path`);
  }
  const normalized = normalize(path);
  if (normalized === "." || normalized.startsWith(`..${sep}`) || normalized === "..") {
    throw new Error(`${where} must be a portable deck-relative path`);
  }
  return path;
}

function escapeMarkdown(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/([*_#[\]()>|])/g, "\\$1");
}

function formatHeading(value, where) {
  return escapeMarkdown(normalizeHeading(value, where).replace(/`/g, ""));
}

function codeToken(token) {
  // Delimiters are always ours. Strip authored delimiters/newlines before
  // creating a code span so a value cannot inject a fence or a heading.
  const value = String(token).replace(/[`\r\n]/g, "").trim();
  if (!value) return value;
  return `\`${value}\``;
}

function formatInline(value, { inspection = false } = {}) {
  let source = String(value ?? "").replace(/\r?\n/g, " ").trim();
  if (!source) return "";

  const placeholders = [];
  const protect = (replacement) => {
    const marker = `\u0000${placeholders.length}\u0000`;
    placeholders.push(replacement);
    return marker;
  };

  // Author-provided backticks are delimiters, not trusted structure. Remove
  // them and regenerate only the code spans this formatter owns below.
  source = source.replace(/`/g, "");
  source = source.replace(URL_RE, (url) => {
    const cleanUrl = url.replace(/[.,;:!?]+$/, "");
    const trailing = url.slice(cleanUrl.length);
    const label = inspection ? "Inspect source" : cleanUrl;
    return `${protect(`[${label}](${cleanUrl})`)}${trailing}`;
  });
  source = escapeMarkdown(source);
  source = source.replace(PATH_RE, (match, path) => {
    const prefix = match.slice(0, match.indexOf(path));
    const punctuation = path.match(/[.,;:!?]+$/)?.[0] ?? "";
    const cleanPath = punctuation ? path.slice(0, -punctuation.length) : path;
    return `${prefix}${codeToken(cleanPath)}${punctuation}`;
  });
  source = source.replace(/\u0000(\d+)\u0000/g, (_, index) => placeholders[Number(index)]);
  return source;
}

function normalizeCallout(callout, index) {
  if (typeof callout === "string") {
    return { kind: "example", label: `Callout ${index + 1}`, note: text(callout, `callout ${index + 1}`) };
  }
  if (!callout || typeof callout !== "object" || Array.isArray(callout)) {
    throw new Error(`callout ${index + 1} must be an object with kind and label`);
  }
  const kind = Object.prototype.hasOwnProperty.call(callout, "kind")
    ? text(callout.kind, `callout ${index + 1} kind`)
    : "example";
  if (!SEMANTIC_KINDS.has(kind)) throw new Error(`unsupported semantic icon kind "${kind}"`);
  const label = text(callout.label, `callout ${index + 1} label`);
  const note = callout.note ?? callout.text ?? "";
  return { kind, label, note: note === "" ? "" : text(note, `callout ${index + 1} note`) };
}

function normalizeAnnotation(annotation, index) {
  if (typeof annotation === "string") {
    return { text: text(annotation, `annotation ${index + 1}`) };
  }
  if (!annotation || typeof annotation !== "object" || Array.isArray(annotation)) {
    throw new Error(`annotation ${index + 1} must be a string or an object with text`);
  }
  const value = annotation.text;
  return {
    ...annotation,
    text: text(value, `annotation ${index + 1} text`),
  };
}

export function normalizeAnnotations(value) {
  if (value == null) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.map(normalizeAnnotation);
}

function annotationsFor(visual = {}) {
  return [
    ...normalizeAnnotations(visual.annotation),
    ...normalizeAnnotations(visual.annotations),
  ];
}

export function validateSemanticVisuals(visual = {}) {
  if (!visual || typeof visual !== "object" || Array.isArray(visual)) {
    throw new Error("visual must be an object");
  }
  if (visual.callouts !== undefined) {
    if (!Array.isArray(visual.callouts)) throw new Error("visual.callouts must be an array");
    visual.callouts.map(normalizeCallout);
  }
  annotationsFor(visual);
  if (visual.image !== undefined) {
    if (!visual.image || typeof visual.image !== "object" || Array.isArray(visual.image)) {
      throw new Error("visual.image must be an object");
    }
    portablePath(visual.image.file, "visual.image.file");
    const use = text(visual.image.use, "visual.image.use");
    const description = text(visual.image.description, "visual.image.description");
    if (use === description) throw new Error("visual.image.description must be distinct from use");
  }
  return true;
}

function imageManifestEntry(manifest, imagePath) {
  const assets = Array.isArray(manifest?.images)
    ? manifest.images
    : Array.isArray(manifest?.assets)
      ? manifest.assets
      : [];
  const entry = assets.find((asset) => (asset.path ?? asset.file) === imagePath) ?? null;
  if (entry) portablePath(entry.path ?? entry.file, "composition manifest image path");
  return entry;
}

function frameNameFor(spec, frameNames, index) {
  return frameNames[index] ?? `${String(index + 1).padStart(2, "0")} ${normalizeHeading(spec.bands[index]?.heading ?? `Frame ${index + 1}`, `frame ${index + 1}`)}`;
}

function normalizeHeading(value, where) {
  return text(value, where).replace(/\s+/g, " ").replace(/^#+\s*/, "");
}

function renderNodes(nodes = []) {
  return nodes.map((node) => {
    if (typeof node === "string") return `- ${formatInline(node)}`;
    const label = formatInline(node?.label ?? "");
    const note = node?.note ? ` — ${formatInline(node.note)}` : "";
    const at = node?.at ? `At: ${formatInline(node.at)} — ` : "";
    const items = Array.isArray(node?.items) ? node.items.map((item) => `  - ${formatInline(item)}`).join("\n") : "";
    const children = Array.isArray(node?.children) ? node.children.map((child) => `  - ${formatInline(child?.label ?? child)}`).join("\n") : "";
    return [`- ${at}${label}${note}`, items, children].filter(Boolean).join("\n");
  }).join("\n");
}

function renderInspection(value) {
  const source = text(value, "visual.inspect");
  if (URL_RE.test(source)) {
    URL_RE.lastIndex = 0;
    return formatInline(source, { inspection: true });
  }
  URL_RE.lastIndex = 0;
  return formatInline(source);
}

export function buildOverview(spec) {
  if (!spec || typeof spec !== "object" || !Array.isArray(spec.bands)) {
    throw new Error("spec.bands must be an array to build the overview");
  }
  return {
    title: spec.title,
    subtitle: spec.subtitle,
    frames: spec.bands.map((band, index) => ({
      name: `${String(index + 1).padStart(2, "0")} ${normalizeHeading(band.heading, `band ${index + 1} heading`)}`,
    })),
    navigation: "Use Excalidraw frame navigation for reading; use outline.md on smaller screens.",
  };
}

export function buildOutline(spec, { frameNames = [], compositionManifest = {} } = {}) {
  const title = normalizeHeading(spec?.title, "title");
  const subtitle = formatInline(spec?.subtitle);
  const footer = text(spec?.footer, "footer");
  if (!Array.isArray(spec?.bands) || spec.bands.length === 0) throw new Error("bands must be a non-empty array");
  const overview = buildOverview(spec);
  const lines = [
    `# ${formatHeading(title, "title")}`,
    "",
    subtitle,
    "",
    "## Overview",
    "",
    overview.navigation,
    "",
    ...overview.frames.map(({ name }) => `- ${codeToken(name)}`),
  ];

  spec.bands.forEach((band, index) => {
    const name = frameNameFor(spec, frameNames, index);
    lines.push("", `## ${formatHeading(name, `frame ${index + 1}`)}`, "", formatInline(band.deck ?? ""));
    if (band.pattern !== "canvas") {
      if (band.relation) lines.push("", `**Relation:** ${formatInline(band.relation)}`);
      if (band.nodes?.length) lines.push("", renderNodes(band.nodes));
      return;
    }
    const visual = band.visual ?? {};
    validateSemanticVisuals(visual);
    if (visual.family) lines.push("", `**Visual family:** ${formatInline(visual.family)}`);
    if (visual.surface) lines.push("", `**Surface:** ${formatInline(visual.surface)}`);
    if (visual.thesis) lines.push("", `**Thesis:** ${formatInline(visual.thesis)}`);
    if (visual.focus) lines.push("", `**Focus:** ${formatInline(visual.focus)}`);
    if (visual.caption) lines.push("", `**Caption:** ${formatInline(visual.caption)}`);
    if (visual.nodes?.length) lines.push("", "**Nodes:**", renderNodes(visual.nodes));
    if (visual.axisX) lines.push("", `**Axis X:** ${formatInline(visual.axisX)}`);
    if (visual.axisY) lines.push("", `**Axis Y:** ${formatInline(visual.axisY)}`);
    for (const [field, label] of [["left", "Left"], ["middle", "Middle"], ["right", "Right"], ["decision", "Decision"]]) {
      if (visual[field]) lines.push("", `**${label}:** ${formatInline(visual[field])}`);
    }
    if (visual.explanation) lines.push("", `**Mechanism:** ${formatInline(visual.explanation)}`);
    if (visual.example) lines.push("", `**Example:** ${formatInline(visual.example)}`);
    if (visual.tradeoff) lines.push("", `**Boundary:** ${formatInline(visual.tradeoff)}`);
    if (visual.evidence?.length) lines.push("", "**Evidence:**", renderNodes(visual.evidence));
    if (visual.inspect) lines.push("", `**Inspection:** ${renderInspection(visual.inspect)}`);
    if (visual.callouts?.length) {
      lines.push("", "**Semantic callouts:**");
      for (const [calloutIndex, raw] of visual.callouts.entries()) {
        const callout = normalizeCallout(raw, calloutIndex);
        const kindLabel = callout.kind[0].toUpperCase() + callout.kind.slice(1);
        lines.push(`- **${kindLabel}: ${formatInline(callout.label)}**${callout.note ? ` — ${formatInline(callout.note)}` : ""}`);
      }
    }
    const annotations = annotationsFor(visual);
    if (annotations.length) {
      lines.push("", "**Annotations:**");
      for (const annotation of annotations) lines.push(`- ${formatInline(annotation.text)}`);
    }
    if (visual.image) {
      const imagePath = portablePath(visual.image.file, `bands[${index}].visual.image.file`);
      const manifestImage = imageManifestEntry(compositionManifest, imagePath);
      const description = text(visual.image.description, `bands[${index}].visual.image.description`);
      lines.push(
        "",
        `Image: ${formatInline(description)}`,
        `- Use: ${formatInline(visual.image.use)}`,
        `- Path: ${codeToken(manifestImage?.path ?? imagePath)}`,
      );
    }
  });

  lines.push("", `_${formatInline(footer)}_`, "");
  const markdown = lines.join("\n");
  if (hasAbsolutePath(markdown)) {
    throw new Error("outline contains an absolute source path");
  }
  return markdown;
}

export { normalizeCallout };
