// Pure(ish) geometry for the beautidraw layout engine.
//
// Two kinds of exports live here:
//   - Pure, spec-only helpers (constants, PALETTE, planDeck, collectFontRequirements) —
//     these touch neither `window` nor `document` and are safe to `import` from Node
//     (generate.mjs uses them to build the font corpus and validate the spec BEFORE
//     booting the harness).
//   - `layoutDeck(spec, api)` — needs `api.convertToExcalidrawElements`, so it only
//     runs inside the browser page (dynamically imported there by generate.mjs).
//
// See scripts/LAYOUT-CONTRACT.md for the rules this file exists to satisfy.

// ---------------------------------------------------------------------------
// Constants (LAYOUT-CONTRACT.md "Constants")
// ---------------------------------------------------------------------------

export const PAGE_X = 0;
export const PAGE_WIDTH = 2280;
export const BAND_HEIGHT_CAP = 1211;
export const MARGIN = 80; // page side margin for chrome
export const G = 48; // base gutter
export const GUTTER_COL = 56; // between columns
export const BAND_GAP = 96; // vertical gap between bands
export const BOUND_TEXT_PADDING = 5; // per side, Excalidraw's own
export const RAMP = { title: 48, heading: 38, hero: 30, label: 23, note: 18 };
export const FONT = { prose: 6, mono: 3 }; // Nunito, Cascadia — spike F3
export const FONT_NAME = { prose: "Nunito", mono: "Cascadia" };

// z_actual / z_scene machinery, used for the legibility gate and
// recorded in diagnostics.
export const USABLE_W = 1600;
export const USABLE_H = 850;
export const EXPORT_PAD = 10;
export const FRAME_LABEL_BAND = 20.5;

// Judgment call (not in the contract): a small inset so body content doesn't
// span PAGE_X..PAGE_X+PAGE_WIDTH exactly. A/B'd both ways by rendering the
// smoke spec's flow band at BODY_INSET=0 and BODY_INSET=24 and viewing the
// PNGs: at 0 every k=1 rectangle's left/right edge sits flush on the page
// edge (the same edge the frame itself spans), which reads as content
// touching the frame boundary with no breathing room; 24px gives visible
// margin and looks like the reference artifact. wrapWidth() itself stays
// byte-for-byte the contract's formula; this is applied separately, to the
// body's available width, before wrapWidth ever sees it.
export const BODY_INSET = 24;

export function wrapWidth(k) {
  return (PAGE_WIDTH - (k - 1) * GUTTER_COL) / k;
}

// The width budget every body column search runs against — PAGE_WIDTH minus
// BODY_INSET on each side. wrapWidth(k) is still exactly the contract's
// formula; only the width fed into it is inset.
function bodyWrapWidth(k) {
  const available = PAGE_WIDTH - 2 * BODY_INSET;
  return (available - (k - 1) * GUTTER_COL) / k;
}

export const PALETTE = {
  blue: { stroke: "#1e3a5f", fill: "#dbeafe" },
  green: { stroke: "#047857", fill: "#d1fae5" },
  amber: { stroke: "#b45309", fill: "#fef3c7" },
  red: { stroke: "#b91c1c", fill: "#fee2e2" },
  violet: { stroke: "#5b21b6", fill: "#ede9fe" },
  slate: { stroke: "#1e293b", fill: "#f1f5f9" },
};

const CHROME_COLOR = "#1e1e1e";
const FRAME_STROKE = "#94a3b8";

// Interior band spacing — judgment calls, not pinned by the contract.
const FRAME_PAD_TOP = G;
const HEADING_DECK_GAP = 16;
const DECK_BODY_GAP = G;
const FRAME_PAD_BOTTOM = G;
const ROW_GAP = G; // vertical gap between stacked rows/units
const CARD_GAP = 12; // gap between stacked cards within one unit
const ARROW_CLEARANCE = 6; // gap between an arrow tip and the shape it binds to

// Composition fix: the label card and its note card, within one flow/
// row-of-stages unit, get a gap of exactly 0 instead of CARD_GAP. Widths
// already match (both are the unit's full card width), so a 0 gap makes the
// note box's top edge literally BE the label box's bottom edge — one shared
// stroke, reading as a single card with a header band, instead of two
// same-width bars separated by a sliver of whitespace that groups nothing.
// checkNoOverlap (generate.mjs) uses strict `>` on the overlap area, so two
// AABBs that only touch along an edge (zero-area intersection) are not
// flagged — this is a legitimate touching-not-overlapping layout, not a
// validator loophole. comparison/tree/checklist keep CARD_GAP: their stacked
// cards are visually distinct rows (bullet lists, child nodes), not a
// label/note pair meant to read as one card. `timeline` cards ARE a
// label/note pair at column width — structurally the same shape as
// row-of-stages — so they take CARD_HEADER_GAP too.
const CARD_HEADER_GAP = 0;

// Composition fix (visual, not geometric): flow cards are narrow and centred
// on the page axis, not full-page-width. A page-wide label strip plus a
// page-wide note strip reads as two disconnected bars per step (twelve boxes
// for six steps), and the chain-of-custody arrow gets lost against all that
// width. Narrow + centred reads as a single vertical chain, matching the
// label-box-on-top/note-box-beneath idiom already used at column width in
// row-of-stages (see band-01). Width is a fixed, documented formula — not a
// text measurement — so it stays governed by the same
// convertToExcalidrawElements-only rule as everything else.
//
// 1100 wide × ~36 tall (single-line label/note) is a ~30:1 bar even with the
// header-gap merge above — two words adrift in a strip. At 760 (PAGE_WIDTH/3)
// the merged card measures out (hr-ai deck, band-02) at 760 × 77 (42 label +
// 35 note), ~10:1 — the fix here is the narrower width plus the header-gap
// merge giving the card a two-band body, not text wrapping: read back against
// the hr-ai deck-spec, every label/note in this width stays single-line, even
// the 72-character MediaHub note. A caller with longer text could still wrap
// at this width — convertToExcalidrawElements decides that, not this file —
// but it isn't what fixes the aspect ratio here. The formula stays
// PAGE_WIDTH-derived, not a measured value, for the same reason the 1100
// figure was.
const FLOW_CARD_WIDTH = Math.min(760, PAGE_WIDTH / 3);

const PATTERNS = new Set([
  "flow",
  "row-of-stages",
  "comparison",
  "timeline",
  "tree",
  "checklist",
]);

// ---------------------------------------------------------------------------
// planDeck — the single source of truth for role→text→size assignment and
// spec validation. Pure. Used by both collectFontRequirements (Node, before
// the harness boots) and layoutDeck (in-page). Throws named, located errors —
// never silently drops or truncates (LAYOUT-CONTRACT.md).
// ---------------------------------------------------------------------------

function reqText(value, where) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${where}: label is empty or whitespace-only`);
  }
  return value;
}

function planBandNodes(band, bandIndex) {
  const nodes = band.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error(`band ${bandIndex} (${band.pattern}): nodes must be a non-empty array`);
  }
  switch (band.pattern) {
    case "flow":
    case "row-of-stages":
      return nodes.map((n, i) => ({
        index: i,
        label: reqText(n.label, `band ${bandIndex} node ${i} label`),
        note: n.note != null ? reqText(n.note, `band ${bandIndex} node ${i} note`) : null,
      }));
    case "comparison":
      return nodes.map((n, i) => ({
        index: i,
        label: reqText(n.label, `band ${bandIndex} node ${i} label`),
        tone: n.tone ?? null,
        items: (n.items ?? []).map((it, k) =>
          reqText(it, `band ${bandIndex} node ${i} item ${k}`),
        ),
      }));
    case "timeline":
      return nodes.map((n, i) => ({
        index: i,
        at: reqText(n.at, `band ${bandIndex} node ${i} at`),
        label: reqText(n.label, `band ${bandIndex} node ${i} label`),
        note: n.note != null ? reqText(n.note, `band ${bandIndex} node ${i} note`) : null,
      }));
    case "tree":
      return nodes.map((n, i) => ({
        index: i,
        label: reqText(n.label, `band ${bandIndex} node ${i} label`),
        children: (n.children ?? []).map((c, j) => ({
          index: j,
          label: reqText(c.label, `band ${bandIndex} node ${i} child ${j} label`),
        })),
      }));
    case "checklist":
      return nodes.map((n, i) => ({
        index: i,
        label: reqText(n.label, `band ${bandIndex} node ${i} label`),
        note: n.note != null ? reqText(n.note, `band ${bandIndex} node ${i} note`) : null,
      }));
    default:
      throw new Error(
        `band ${bandIndex}: unknown pattern "${band.pattern}" (expected one of ${[...PATTERNS].join(", ")})`,
      );
  }
}

export function planDeck(spec) {
  if (!spec || typeof spec !== "object") throw new Error("spec: must be an object");
  if (!Array.isArray(spec.bands) || spec.bands.length === 0) {
    throw new Error("spec.bands: must be a non-empty array");
  }
  return {
    title: { text: reqText(spec.title, "title"), size: RAMP.title },
    subtitle: { text: reqText(spec.subtitle, "subtitle"), size: RAMP.label },
    footer: { text: reqText(spec.footer, "footer"), size: RAMP.note },
    bands: spec.bands.map((band, i) => {
      if (!PALETTE[band.accent]) {
        throw new Error(
          `band ${i}: unknown accent "${band.accent}" (expected one of ${Object.keys(PALETTE).join(", ")})`,
        );
      }
      if (!PATTERNS.has(band.pattern)) {
        throw new Error(
          `band ${i}: unknown pattern "${band.pattern}" (expected one of ${[...PATTERNS].join(", ")})`,
        );
      }
      return {
        index: i,
        heading: { text: reqText(band.heading, `band ${i} heading`), size: RAMP.heading },
        deck: { text: reqText(band.deck, `band ${i} deck`), size: RAMP.label },
        pattern: band.pattern,
        accent: band.accent,
        nodes: planBandNodes(band, i),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Text formatters shared between the font-corpus pass and the geometry pass,
// so the characters loaded/checked are byte-identical to the characters drawn.
// ---------------------------------------------------------------------------

export function formatComparisonItems(items) {
  return items.map((it) => `• ${it}`).join("\n");
}

export function formatChecklistRow(label, note) {
  return note ? `• ${label} — ${note}` : `• ${label}`;
}

// ---------------------------------------------------------------------------
// collectFontRequirements — pure, Node-safe. Returns
// [{ family: "Nunito", size: 23, chars: "..." }, ...], one entry per
// (family, size) pair actually used, built from the exact strings/roles the
// geometry pass will draw (LAYOUT-CONTRACT.md font gate; spike F2/F8).
// ---------------------------------------------------------------------------

export function collectFontRequirements(spec) {
  const plan = planDeck(spec);
  const corpus = new Map();
  const add = (text, size) => {
    const key = `${FONT_NAME.prose}@${size}`;
    let set = corpus.get(key);
    if (!set) corpus.set(key, (set = new Set()));
    for (const ch of text) set.add(ch);
  };

  add(plan.title.text, plan.title.size);
  // fitChromeText steps the title down to RAMP.heading on overflow (see
  // below) — the font gate must cover the title's OWN characters at that
  // fallback size too, or a vacuous check on some other role's Nunito@38
  // corpus would pass while the title's actual glyphs go unverified
  // (spike F8: a bare check() passes vacuously; this is the same failure
  // mode one level up — right size, wrong text).
  add(plan.title.text, RAMP.heading);
  add(plan.subtitle.text, plan.subtitle.size);
  add(plan.footer.text, plan.footer.size);

  for (const band of plan.bands) {
    add(band.heading.text, band.heading.size);
    // Same reasoning: band heading steps down to RAMP.hero on overflow.
    add(band.heading.text, RAMP.hero);
    add(band.deck.text, band.deck.size);
    switch (band.pattern) {
      case "flow":
      case "row-of-stages":
        for (const n of band.nodes) {
          add(n.label, RAMP.label);
          if (n.note) add(n.note, RAMP.note);
        }
        break;
      case "comparison":
        for (const n of band.nodes) {
          add(n.label, RAMP.hero);
          if (n.items.length) add(formatComparisonItems(n.items), RAMP.note);
        }
        break;
      case "timeline":
        for (const n of band.nodes) {
          add(n.at, RAMP.note);
          add(n.label, RAMP.label);
          if (n.note) add(n.note, RAMP.note);
        }
        break;
      case "tree":
        for (const n of band.nodes) {
          add(n.label, RAMP.hero);
          for (const c of n.children) add(c.label, RAMP.note);
        }
        break;
      case "checklist":
        for (const n of band.nodes) {
          add(formatChecklistRow(n.label, n.note), RAMP.note);
        }
        break;
    }
  }

  return [...corpus.entries()].map(([key, set]) => {
    const [family, sizeStr] = key.split("@");
    return { family, size: Number(sizeStr), chars: [...set].join("") };
  });
}

// ---------------------------------------------------------------------------
// In-page measurement helpers. Every one of these calls
// api.convertToExcalidrawElements with { regenerateIds: false } so the ids we
// assign survive into the returned elements untouched — that's what lets a
// later single "finalize" call bind arrows and frame membership by id.
// ---------------------------------------------------------------------------

function measureNatural(api, id, text, fontSize) {
  const [el] = api.convertToExcalidrawElements(
    [{ id, type: "text", x: 0, y: 0, text, fontSize, fontFamily: FONT.prose }],
    { regenerateIds: false },
  );
  return el;
}

// Natural (unbound) text, stepping down the ramp once on overflow, per
// the fixed-role overflow contract. Throws, naming the role, the
// measured width and the budget, if it still doesn't fit.
function fitChromeText(api, id, text, primarySize, fallbackSize, maxWidth, roleName) {
  let el = measureNatural(api, id, text, primarySize);
  if (el.width <= maxWidth) return el;
  if (fallbackSize) {
    const stepped = measureNatural(api, id, text, fallbackSize);
    if (stepped.width <= maxWidth) return stepped;
    throw new Error(
      `${roleName} "${text}" measures ${el.width.toFixed(1)}px at ${primarySize} and ` +
        `${stepped.width.toFixed(1)}px at fallback ${fallbackSize}, budget is ${maxWidth.toFixed(1)}px`,
    );
  }
  throw new Error(
    `${roleName} "${text}" measures ${el.width.toFixed(1)}px, budget is ${maxWidth.toFixed(1)}px (no fallback size for this role)`,
  );
}

// Bound text inside a rectangle. Declared height omitted so the library's own
// max(declaredHeight, textHeight + 2*BOUND_TEXT_PADDING) collapses to the
// natural required height (spike F7) — that's the "read back the ACTUAL text
// height" step, never a chars*constant guess.
// `textAlign`, when given, is set on the label object itself — not mutated
// on the returned element afterwards — because textAlign is part of the
// metric tuple the converter lays text out with (it can affect wrapping, not
// just the drawn position).
function measureBoundHeight(api, id, text, fontSize, width, textAlign) {
  const label = { text, fontSize, fontFamily: FONT.prose, ...(textAlign ? { textAlign } : {}) };
  const els = api.convertToExcalidrawElements(
    [{ id, type: "rectangle", x: 0, y: 0, width, label }],
    { regenerateIds: false },
  );
  const container = els.find((e) => e.id === id);
  if (!container) throw new Error(`measureBoundHeight: container "${id}" missing from converter output`);
  return container.height;
}

// Measure a column of stacked bound-text cards (e.g. hero + items, or
// label + note) at a fixed width, WITHOUT deciding y yet — used so peer
// columns/rows can be height-synced before any position is committed.
function measureCards(api, idPrefix, cards, width) {
  const present = cards.filter(Boolean);
  return present.map((c, i) => ({
    id: `${idPrefix}-${i}`,
    text: c.text,
    fontSize: c.fontSize,
    textAlign: c.textAlign,
    height: measureBoundHeight(api, `${idPrefix}-${i}-probe`, c.text, c.fontSize, width, c.textAlign),
  }));
}

// Pure JS: turn a measured card list into positioned skeleton descriptors.
// `heights`, if given, overrides each card's own measured height (row sync) —
// the container's declared height is then >= its natural requirement, so the
// library keeps the bound text vertically centred in the taller box.
function placeCards(cards, x, yTop, width, gap, heights) {
  let y = yTop;
  const placed = [];
  cards.forEach((c, i) => {
    const h = heights ? heights[i] : c.height;
    placed.push({ id: c.id, text: c.text, fontSize: c.fontSize, textAlign: c.textAlign, x, y, width, height: h });
    y += h + gap;
  });
  const height = placed.length ? y - gap - yTop : 0;
  return { placed, height };
}

// ---------------------------------------------------------------------------
// Column-candidate search (LAYOUT-CONTRACT.md): try each
// candidate k in declared order, accept the first whose BODY height clears
// the band's remaining budget (BAND_HEIGHT_CAP minus the heading/deck-line/
// padding overhead already spent — that overhead is fixed before any pattern
// runs, so it's the caller's job to hand down the true remaining cap rather
// than the raw constant). `build(k)` must be pure-ish (only calls the
// `measure*` helpers above, never mutates shared state) so a rejected
// candidate leaves no trace.
function selectColumnCandidate(candidates, bandIndex, pattern, bodyHeightCap, build) {
  const attempts = [];
  for (const k of candidates) {
    const result = build(k);
    attempts.push({ k, height: result.height });
    if (result.height <= bodyHeightCap) return { ...result, k, attempts };
  }
  throw new Error(
    `band ${bandIndex} (${pattern}): exhausted column candidates [${candidates.join(", ")}] — ` +
      attempts.map((a) => `k=${a.k} height=${a.height.toFixed(1)}`).join(", ") +
      ` — all exceed the band's remaining body budget of ${bodyHeightCap.toFixed(1)} ` +
      `(BAND_HEIGHT_CAP=${BAND_HEIGHT_CAP} minus heading/deck-line/padding overhead)`,
  );
}

function accentFor(band, tone) {
  return PALETTE[tone ?? band.accent];
}

// `textAlign`, when given, is set on the label object at skeleton-build time
// (never mutated on the converted element afterwards) — it is part of the
// metric tuple the converter lays text out with, same reasoning as
// measureBoundHeight above. Omitted entirely when not given, so every
// existing caller keeps the converter's own default (centred).
function rectSkeleton(id, x, y, width, height, text, fontSize, accent, textAlign) {
  return {
    id,
    type: "rectangle",
    x,
    y,
    width,
    height,
    strokeColor: accent.stroke,
    backgroundColor: accent.fill,
    fillStyle: "solid",
    strokeWidth: 2,
    roughness: 0,
    // roughness on the label itself: qt() (the bound-text factory) spreads
    // the label object's own fields, so a bare {text,fontSize,fontFamily}
    // here leaves the bound TEXT element defaulting to roughness "artist" —
    // measured, not assumed — even though the container above is roughness 0.
    label: { text, fontSize, fontFamily: FONT.prose, roughness: 0, ...(textAlign ? { textAlign } : {}) },
  };
}

function lineSkeleton(id, x1, y1, x2, y2, strokeColor) {
  const width = x2 - x1;
  const height = y2 - y1;
  return {
    id,
    type: "line",
    x: x1,
    y: y1,
    width,
    height,
    points: [
      [0, 0],
      [width, height],
    ],
    strokeColor,
    strokeWidth: 2,
    roughness: 0,
  };
}

function arrowSkeleton(id, x1, y1, x2, y2, strokeColor, startId, endId) {
  const width = x2 - x1;
  const height = y2 - y1;
  return {
    id,
    type: "arrow",
    x: x1,
    y: y1,
    width,
    height,
    points: [
      [0, 0],
      [width, height],
    ],
    strokeColor,
    strokeWidth: 2,
    roughness: 0,
    startArrowhead: null,
    endArrowhead: "arrow",
    start: { id: startId },
    end: { id: endId },
  };
}

// ---------------------------------------------------------------------------
// Pattern body layouts. Each returns { skeletons, height, columnsUsed,
// diagnostics } where `skeletons` are FINAL (x/y/width/height already
// decided) — they go straight into the deck-wide finalize call.
// ---------------------------------------------------------------------------

function layoutFlow(band, bandIndex, api, bodyX, bodyTop, bodyWidth, bodyHeightCap) {
  const build = () => {
    const k = 1;
    const width = FLOW_CARD_WIDTH;
    const x = PAGE_X + (PAGE_WIDTH - width) / 2;
    const units = band.nodes.map((n, i) => {
      const idPrefix = `b${bandIndex}-n${i}`;
      const cards = measureCards(api, idPrefix, [
        { text: n.label, fontSize: RAMP.label },
        n.note ? { text: n.note, fontSize: RAMP.note } : null,
      ], width);
      return { idPrefix, cards };
    });

    let y = bodyTop;
    const skeletons = [];
    const memberIds = [];
    const unitAnchors = []; // {topId, bottomId, topY, bottomY, centerX}
    units.forEach((u, i) => {
      const { placed, height } = placeCards(u.cards, x, y, width, CARD_HEADER_GAP);
      const accent = accentFor(band, null);
      placed.forEach((c) => {
        skeletons.push(rectSkeleton(c.id, c.x, c.y, c.width, c.height, c.text, c.fontSize, accent, c.textAlign));
        memberIds.push(c.id);
      });
      unitAnchors.push({
        topId: placed[0].id,
        bottomId: placed[placed.length - 1].id,
        topY: y,
        bottomY: y + height,
        centerX: x + width / 2,
      });
      y += height + ROW_GAP;
    });

    // Bound arrows chaining consecutive node units (LAYOUT-CONTRACT.md: flow
    // renders "a vertical chain of rectangles, each connected to the next by
    // a bound arrow"). Arrow + both endpoints must share one converter call
    // to actually bind — that call is the deck-wide finalize call these
    // skeletons feed into.
    const accentStroke = accentFor(band, null).stroke;
    for (let i = 0; i < unitAnchors.length - 1; i++) {
      const a = unitAnchors[i];
      const b = unitAnchors[i + 1];
      const arrowId = `b${bandIndex}-arrow${i}`;
      skeletons.push(
        arrowSkeleton(
          arrowId,
          a.centerX,
          a.bottomY + ARROW_CLEARANCE,
          b.centerX,
          b.topY - ARROW_CLEARANCE,
          accentStroke,
          a.bottomId,
          b.topId,
        ),
      );
      memberIds.push(arrowId);
    }

    const height = y - ROW_GAP - bodyTop;
    return { skeletons, height, memberIds, columnsUsed: 1 };
  };

  return selectColumnCandidate([1], bandIndex, "flow", bodyHeightCap, build);
}

function layoutRowOfStages(band, bandIndex, api, bodyX, bodyTop, bodyWidth, bodyHeightCap) {
  const n = band.nodes.length;
  const candidates = [...new Set([n, Math.ceil(n / 2), 2].filter((k) => k >= 1 && k <= n))];

  const build = (k) => {
    const width = bodyWrapWidth(k);
    const rowXStart = PAGE_X + (PAGE_WIDTH - (k * width + (k - 1) * GUTTER_COL)) / 2;

    // Natural height per node at this width, across ALL nodes (not just one
    // row), so every grid cell shares one height.
    const natural = band.nodes.map((n_, i) => {
      const idPrefix = `b${bandIndex}-n${i}`;
      return measureCards(api, idPrefix, [
        { text: n_.label, fontSize: RAMP.label },
        n_.note ? { text: n_.note, fontSize: RAMP.note } : null,
      ], width);
    });
    const slotCount = Math.max(...natural.map((c) => c.length));
    const slotHeights = Array.from({ length: slotCount }, (_, slot) =>
      Math.max(...natural.map((c) => c[slot]?.height ?? 0)),
    );

    const skeletons = [];
    const memberIds = [];
    const accent = accentFor(band, null);
    const numRows = Math.ceil(n / k);
    let cellHeight = 0;
    for (let s = 0; s < slotCount; s++) cellHeight += slotHeights[s] + (s > 0 ? CARD_HEADER_GAP : 0);

    for (let row = 0; row < numRows; row++) {
      const rowY = bodyTop + row * (cellHeight + ROW_GAP);
      for (let col = 0; col < k; col++) {
        const idx = row * k + col;
        if (idx >= n) continue;
        const cardX = rowXStart + col * (width + GUTTER_COL);
        const { placed } = placeCards(natural[idx], cardX, rowY, width, CARD_HEADER_GAP, slotHeights);
        placed.forEach((c) => {
          skeletons.push(rectSkeleton(c.id, c.x, c.y, c.width, c.height, c.text, c.fontSize, accent, c.textAlign));
          memberIds.push(c.id);
        });
      }
    }

    const height = numRows * cellHeight + (numRows - 1) * ROW_GAP;
    return { skeletons, height, memberIds, columnsUsed: k };
  };

  return selectColumnCandidate(candidates, bandIndex, "row-of-stages", bodyHeightCap, build);
}

function layoutComparison(band, bandIndex, api, bodyX, bodyTop, bodyWidth, bodyHeightCap) {
  const k = band.nodes.length;
  const build = () => {
    const width = bodyWrapWidth(k);
    const rowXStart = PAGE_X + (PAGE_WIDTH - (k * width + (k - 1) * GUTTER_COL)) / 2;

    const natural = band.nodes.map((n, i) => {
      const idPrefix = `b${bandIndex}-col${i}`;
      const itemsText = n.items.length ? formatComparisonItems(n.items) : null;
      return measureCards(api, idPrefix, [
        { text: n.label, fontSize: RAMP.hero }, // header stays centred
        // DEFECT 2 fix: a bulleted list reads ragged when centred (every
        // line a different width, no shared edge). Left-align it; the
        // library's own BOUND_TEXT_PADDING (5px, LAYOUT-CONTRACT.md) is the
        // left inset — small and consistent, not a guessed value.
        itemsText ? { text: itemsText, fontSize: RAMP.note, textAlign: "left" } : null,
      ], width);
    });
    const slotCount = Math.max(...natural.map((c) => c.length));
    const slotHeights = Array.from({ length: slotCount }, (_, slot) =>
      Math.max(...natural.map((c) => c[slot]?.height ?? 0)),
    );

    const skeletons = [];
    const memberIds = [];
    band.nodes.forEach((n, i) => {
      const x = rowXStart + i * (width + GUTTER_COL);
      const accent = accentFor(band, n.tone);
      const { placed } = placeCards(natural[i], x, bodyTop, width, CARD_GAP, slotHeights);
      placed.forEach((c) => {
        skeletons.push(rectSkeleton(c.id, c.x, c.y, c.width, c.height, c.text, c.fontSize, accent, c.textAlign));
        memberIds.push(c.id);
      });
    });

    let height = 0;
    for (let s = 0; s < slotCount; s++) height += slotHeights[s] + (s > 0 ? CARD_GAP : 0);
    return { skeletons, height, memberIds, columnsUsed: k };
  };

  return selectColumnCandidate([k], bandIndex, "comparison", bodyHeightCap, build);
}

function layoutTimeline(band, bandIndex, api, bodyX, bodyTop, bodyWidth, bodyHeightCap) {
  const k = band.nodes.length;
  const build = () => {
    const width = bodyWrapWidth(k);
    const rowXStart = PAGE_X + (PAGE_WIDTH - (k * width + (k - 1) * GUTTER_COL)) / 2;
    const accent = accentFor(band, null);

    // "at" free labels (unbound, natural width) above the axis.
    const atEls = band.nodes.map((n, i) =>
      measureNatural(api, `b${bandIndex}-at${i}`, n.at, RAMP.note),
    );
    const atHeight = Math.max(...atEls.map((e) => e.height));

    const tickHalf = 8;
    const axisY = bodyTop + atHeight + G / 2 + tickHalf;

    const cardTop = axisY + tickHalf + G / 2;
    const natural = band.nodes.map((n, i) => {
      const idPrefix = `b${bandIndex}-card${i}`;
      return measureCards(api, idPrefix, [
        { text: n.label, fontSize: RAMP.label },
        n.note ? { text: n.note, fontSize: RAMP.note } : null,
      ], width);
    });
    const slotCount = Math.max(...natural.map((c) => c.length));
    const slotHeights = Array.from({ length: slotCount }, (_, slot) =>
      Math.max(...natural.map((c) => c[slot]?.height ?? 0)),
    );

    const skeletons = [];
    const memberIds = [];

    const axisId = `b${bandIndex}-axis`;
    skeletons.push(
      lineSkeleton(axisId, PAGE_X + BODY_INSET, axisY, PAGE_X + PAGE_WIDTH - BODY_INSET, axisY, FRAME_STROKE),
    );
    memberIds.push(axisId);

    band.nodes.forEach((n, i) => {
      const colX = rowXStart + i * (width + GUTTER_COL);
      const centerX = colX + width / 2;

      const tickId = `b${bandIndex}-tick${i}`;
      skeletons.push(lineSkeleton(tickId, centerX, axisY - tickHalf, centerX, axisY + tickHalf, accent.stroke));
      memberIds.push(tickId);

      const atEl = atEls[i];
      const atId = `b${bandIndex}-at${i}`;
      skeletons.push({
        id: atId,
        type: "text",
        x: centerX - atEl.width / 2,
        y: axisY - tickHalf - G / 2 - atEl.height,
        text: n.at,
        fontSize: RAMP.note,
        fontFamily: FONT.prose,
        strokeColor: CHROME_COLOR,
        roughness: 0,
      });
      memberIds.push(atId);

      const { placed } = placeCards(natural[i], colX, cardTop, width, CARD_HEADER_GAP, slotHeights);
      placed.forEach((c) => {
        skeletons.push(rectSkeleton(c.id, c.x, c.y, c.width, c.height, c.text, c.fontSize, accent, c.textAlign));
        memberIds.push(c.id);
      });
    });

    let cardsHeight = 0;
    for (let s = 0; s < slotCount; s++) cardsHeight += slotHeights[s] + (s > 0 ? CARD_HEADER_GAP : 0);
    const height = cardTop - bodyTop + cardsHeight;
    return { skeletons, height, memberIds, columnsUsed: k };
  };

  return selectColumnCandidate([k], bandIndex, "timeline", bodyHeightCap, build);
}

function layoutTree(band, bandIndex, api, bodyX, bodyTop, bodyWidth, bodyHeightCap) {
  const k = band.nodes.length;
  const build = () => {
    const width = bodyWrapWidth(k);
    const rowXStart = PAGE_X + (PAGE_WIDTH - (k * width + (k - 1) * GUTTER_COL)) / 2;
    const accent = accentFor(band, null);

    const rootHeights = band.nodes.map((n, i) =>
      measureBoundHeight(api, `b${bandIndex}-root${i}`, n.label, RAMP.hero, width),
    );
    const rootHeight = Math.max(...rootHeights);

    const skeletons = [];
    const memberIds = [];
    let maxChildColHeight = 0;

    band.nodes.forEach((n, i) => {
      const x = rowXStart + i * (width + GUTTER_COL);
      const rootId = `b${bandIndex}-root${i}`;
      skeletons.push(rectSkeleton(rootId, x, bodyTop, width, rootHeight, n.label, RAMP.hero, accent));
      memberIds.push(rootId);

      let childY = bodyTop + rootHeight + ROW_GAP;
      let prevBottomId = rootId;
      let prevBottomY = bodyTop + rootHeight;
      n.children.forEach((c, j) => {
        const childId = `b${bandIndex}-root${i}-child${j}`;
        const h = measureBoundHeight(api, childId, c.label, RAMP.note, width);
        skeletons.push(rectSkeleton(childId, x, childY, width, h, c.label, RAMP.note, accent));
        memberIds.push(childId);

        const lineId = `${childId}-line`;
        skeletons.push(
          lineSkeleton(lineId, x + width / 2, prevBottomY + 1, x + width / 2, childY - 1, accent.stroke),
        );
        memberIds.push(lineId);

        prevBottomY = childY + h;
        childY += h + CARD_GAP;
        prevBottomId = childId;
      });
      const colHeight = childY - CARD_GAP - bodyTop;
      maxChildColHeight = Math.max(maxChildColHeight, colHeight - rootHeight - ROW_GAP);
    });

    const height = rootHeight + (maxChildColHeight > 0 ? ROW_GAP + maxChildColHeight : 0);
    return { skeletons, height, memberIds, columnsUsed: k };
  };

  return selectColumnCandidate([k], bandIndex, "tree", bodyHeightCap, build);
}

function layoutChecklist(band, bandIndex, api, bodyX, bodyTop, bodyWidth, bodyHeightCap) {
  const build = () => {
    const k = 2;
    const width = bodyWrapWidth(k);
    const rowXStart = PAGE_X + (PAGE_WIDTH - (k * width + (k - 1) * GUTTER_COL)) / 2;
    const accent = accentFor(band, null);

    const half = Math.ceil(band.nodes.length / 2);
    const columns = [band.nodes.slice(0, half), band.nodes.slice(half)];

    const skeletons = [];
    const memberIds = [];
    let bodyHeight = 0;

    columns.forEach((col, ci) => {
      const x = rowXStart + ci * (width + GUTTER_COL);
      let y = bodyTop;
      col.forEach((n, ri) => {
        const text = formatChecklistRow(n.label, n.note);
        const id = `b${bandIndex}-row${ci}-${ri}`;
        // DEFECT 3 fix: full-width rows with centred "label — note" text and
        // a centred bullet read as buttons, not as a Q&A checklist. Left
        // align so the question leads (primary) and the "— note" trails
        // (secondary) in natural reading order; the bullet moves from
        // floating mid-row to the left edge as a side effect of the same
        // alignment change, so it no longer needs a separate marker element.
        const h = measureBoundHeight(api, id, text, RAMP.note, width, "left");
        skeletons.push(rectSkeleton(id, x, y, width, h, text, RAMP.note, accent, "left"));
        memberIds.push(id);
        y += h + CARD_GAP;
      });
      bodyHeight = Math.max(bodyHeight, y - CARD_GAP - bodyTop);
    });

    return { skeletons, height: bodyHeight, memberIds, columnsUsed: k };
  };

  return selectColumnCandidate([2], bandIndex, "checklist", bodyHeightCap, build);
}

const PATTERN_LAYOUTS = {
  flow: layoutFlow,
  "row-of-stages": layoutRowOfStages,
  comparison: layoutComparison,
  timeline: layoutTimeline,
  tree: layoutTree,
  checklist: layoutChecklist,
};

// convertToExcalidrawElements appends every auto-created bound-text element
// (the label on a rectangle) to the END of its internal element map, not
// after its container — a Map re-set of an existing key keeps its original
// position, but the bound text is always a brand-new key, so it lands after
// EVERY element already in the map at that point, including later frames.
// Measured directly: a naive single conversion call put every band's bound
// text after every frame, not just its own. "Children before frame" is only
// a project convention (spike F6.4 — clipping does not depend on it), but
// LAYOUT-CONTRACT.md still asks for it, so this restores it deterministically
// from the INPUT order we actually intended, rather than trusting the
// converter's output order: every element keeps the rank of its matching
// input skeleton id; a bound-text element (no matching input id) inherits its
// container's rank plus a fractional offset, placing it immediately after.
function reorderByOriginalIntent(elements, originalSkeletons) {
  const rankOf = new Map(originalSkeletons.map((s, i) => [s.id, i]));
  const rank = (el) => {
    if (rankOf.has(el.id)) return rankOf.get(el.id);
    if (el.containerId && rankOf.has(el.containerId)) return rankOf.get(el.containerId) + 0.5;
    return Number.MAX_SAFE_INTEGER;
  };
  return elements
    .map((el, i) => ({ el, key: rank(el), i }))
    .sort((a, b) => a.key - b.key || a.i - b.i)
    .map((x) => x.el);
}

// ---------------------------------------------------------------------------
// layoutDeck — the only export that needs `api`. Runs inside the page.
// ---------------------------------------------------------------------------

export function layoutDeck(spec, api) {
  const plan = planDeck(spec);
  const diagnostics = { bands: [], zScene: null, sceneBounds: null };

  const allSkeletons = [];

  // Title / subtitle chrome (unframed, centred on the page axis).
  const chromeMaxWidth = PAGE_WIDTH - 2 * MARGIN;
  const titleEl = fitChromeText(api, "chrome-title", plan.title.text, RAMP.title, RAMP.heading, chromeMaxWidth, "title");
  let cursorY = MARGIN;
  allSkeletons.push({
    id: "chrome-title",
    type: "text",
    x: PAGE_X + PAGE_WIDTH / 2 - titleEl.width / 2,
    y: cursorY,
    text: plan.title.text,
    fontSize: titleEl.fontSize,
    fontFamily: FONT.prose,
    strokeColor: CHROME_COLOR,
    roughness: 0,
  });
  cursorY += titleEl.height + G / 2;

  const subtitleEl = fitChromeText(api, "chrome-subtitle", plan.subtitle.text, RAMP.label, null, chromeMaxWidth, "subtitle");
  allSkeletons.push({
    id: "chrome-subtitle",
    type: "text",
    x: PAGE_X + PAGE_WIDTH / 2 - subtitleEl.width / 2,
    y: cursorY,
    text: plan.subtitle.text,
    fontSize: RAMP.label,
    fontFamily: FONT.prose,
    strokeColor: CHROME_COLOR,
    roughness: 0,
  });
  cursorY += subtitleEl.height + G;

  // Bands.
  plan.bands.forEach((band, i) => {
    const frameId = `b${i}-frame`;
    const headingId = `b${i}-heading`;
    const deckId = `b${i}-deck`;

    const headingEl = fitChromeText(
      api,
      headingId,
      band.heading.text,
      RAMP.heading,
      RAMP.hero,
      chromeMaxWidth,
      `band ${i} heading`,
    );
    const deckEl = fitChromeText(
      api,
      deckId,
      band.deck.text,
      RAMP.label,
      null,
      chromeMaxWidth,
      `band ${i} deck line`,
    );

    const frameTop = cursorY;
    let y = frameTop + FRAME_PAD_TOP;
    allSkeletons.push({
      id: headingId,
      type: "text",
      x: PAGE_X + MARGIN,
      y,
      text: band.heading.text,
      fontSize: headingEl.fontSize,
      fontFamily: FONT.prose,
      strokeColor: CHROME_COLOR,
      roughness: 0,
    });
    y += headingEl.height + HEADING_DECK_GAP;

    allSkeletons.push({
      id: deckId,
      type: "text",
      x: PAGE_X + MARGIN,
      y,
      text: band.deck.text,
      fontSize: RAMP.label,
      fontFamily: FONT.prose,
      strokeColor: CHROME_COLOR,
      roughness: 0,
    });
    y += deckEl.height + DECK_BODY_GAP;

    const bodyTop = y;
    const bodyHeightCap = BAND_HEIGHT_CAP - (bodyTop - frameTop) - FRAME_PAD_BOTTOM;
    const layoutFn = PATTERN_LAYOUTS[band.pattern];
    const body = layoutFn(
      band,
      i,
      api,
      PAGE_X + BODY_INSET,
      bodyTop,
      PAGE_WIDTH - 2 * BODY_INSET,
      bodyHeightCap,
    );

    const frameHeight = bodyTop - frameTop + body.height + FRAME_PAD_BOTTOM;
    if (frameHeight > BAND_HEIGHT_CAP) {
      throw new Error(
        `band ${i} (${band.pattern}): frame height ${frameHeight.toFixed(1)} exceeds BAND_HEIGHT_CAP=${BAND_HEIGHT_CAP}`,
      );
    }

    allSkeletons.push(...body.skeletons);
    allSkeletons.push({
      id: frameId,
      type: "frame",
      x: PAGE_X,
      y: frameTop,
      width: PAGE_WIDTH,
      height: frameHeight,
      name: `${String(i + 1).padStart(2, "0")} ${band.heading.text}`,
      strokeColor: FRAME_STROKE,
      children: [headingId, deckId, ...body.memberIds],
    });

    const zActual = Math.min(USABLE_W / PAGE_WIDTH, USABLE_H / frameHeight);
    diagnostics.bands.push({
      index: i,
      pattern: band.pattern,
      columnsUsed: body.columnsUsed,
      frameHeight,
      zActual,
      attempts: body.attempts ?? null,
    });

    cursorY = frameTop + frameHeight + BAND_GAP;
  });

  // Footer chrome — replace the trailing BAND_GAP with a smaller footer gap.
  cursorY = cursorY - BAND_GAP + G;
  const footerEl = fitChromeText(api, "chrome-footer", plan.footer.text, RAMP.note, null, chromeMaxWidth, "footer");
  allSkeletons.push({
    id: "chrome-footer",
    type: "text",
    x: PAGE_X + PAGE_WIDTH / 2 - footerEl.width / 2,
    y: cursorY,
    text: plan.footer.text,
    fontSize: RAMP.note,
    fontFamily: FONT.prose,
    strokeColor: CHROME_COLOR,
    roughness: 0,
  });

  const sceneHeight = cursorY + footerEl.height + MARGIN;
  diagnostics.sceneBounds = { width: PAGE_WIDTH, height: sceneHeight };
  diagnostics.zScene = Math.min(
    USABLE_W / (PAGE_WIDTH + 2 * EXPORT_PAD),
    USABLE_H / (sceneHeight + 2 * EXPORT_PAD),
  );

  const converted = api.convertToExcalidrawElements(allSkeletons, { regenerateIds: false });
  const reordered = reorderByOriginalIntent(converted, allSkeletons);
  // reorderByOriginalIntent fixes ARRAY order (children-before-frame), but
  // the converter assigned each element's fractional `index` field in ITS
  // own (scrambled — see reorderByOriginalIntent's own comment) order, so
  // after reordering the `index` values are no longer monotonic in array
  // order. restoreElements is the same normalization Excalidraw itself runs
  // on file load; passed with no localElements/opts it does not touch
  // bindings, ids, or geometry — it only re-derives `index` for any
  // out-of-order run via the library's own fractional-indexing algorithm, so
  // a viewer that trusts `index` over array position agrees with the array
  // we just built. Confirmed no other measured field survives that call.
  const elements = api.restoreElements(reordered, null);

  // convertToExcalidrawElements refits a frame to its children's bounding box,
  // discarding the x/width the skeleton asked for. That makes frame origin
  // content-derived: a band whose leftmost element is a full-width card lands
  // at one x, a `flow` band whose leftmost element is the heading at
  // PAGE_X + MARGIN lands 56 further right. Since the deck is ONE continuous
  // canvas panned by hand, unequal frame origins make the page edge jitter
  // between bands. Re-pin every frame to the page box so all eight share an
  // axis. Safe: membership is by frameId, not containment, and every band's
  // content already lies inside [PAGE_X, PAGE_X + PAGE_WIDTH]. Height is left
  // as converted — it is per-band by definition.
  for (const el of elements) {
    if (el.type !== "frame") continue;
    el.x = PAGE_X;
    el.width = PAGE_WIDTH;
  }

  return { elements, diagnostics };
}
