# Layout engine contract

Implements the core path of `PLAN.md`: `deck-spec.json` → deterministic layout → `.excalidraw`.

**In scope:** measurement, geometry, frames, emission.
**Out of scope for now:** oracle signing, `oracle_hash`, repair operators, the visual-verdict
loop. Those are PLAN.md §8/§10 machinery and are not needed to produce a deck. The geometric
*rules* below still apply — they are what the spike proved.

## Non-negotiables (each one is a measured spike result)

| Rule | Why |
|---|---|
| The LLM never types a coordinate. Every `x`/`y`/`width`/`height` is computed here. | PLAN.md central decision |
| Text geometry comes from `convertToExcalidrawElements`, never from a `chars × constant` model. | spike F1 |
| Fonts: `document.fonts.load(font, chars)` for the deck's own characters, then `document.fonts.ready`, then `document.fonts.check(font, chars)` **with the text argument**. Abort on failure. | spike F2 / F8 — a bare `check` passes vacuously and Cyrillic then measures 13.34% narrow |
| `lineHeight` is read from the library, never declared. | spike F4 |
| `boundElements: []`, never `null`. | measured: the viewer canonicalises `null` → `[]` |
| Bound text lives **only in rectangles**. Ellipses/diamonds carry unbound labels. | PLAN.md §2 |
| Children emitted before their frame. | convention (contiguity is not correctness — spike F6.4) |
| Frame `name` is navigation metadata, not typography. Zero-padded numeric prefix. | PLAN.md §4 |
| Frame bounds are re-pinned to `[PAGE_X, PAGE_X + PAGE_WIDTH]` **after** conversion. | `convertToExcalidrawElements` refits a frame to its children's bounding box and discards the skeleton's `x`/`width`. Left unpinned, frame origin becomes content-derived and the page edge jitters between bands as you pan. |

## Constants

```js
export const PAGE_X = 0;
export const PAGE_WIDTH = 2280;
export const BAND_HEIGHT_CAP = 1211;
export const MARGIN = 80;            // page side margin for chrome
export const G = 48;                 // base gutter
export const GUTTER_COL = 56;        // between columns
export const BAND_GAP = 96;          // vertical gap between bands
export const BOUND_TEXT_PADDING = 5; // per side, Excalidraw's own
export const RAMP = { title: 48, heading: 38, hero: 30, label: 23, note: 18 };
export const FONT = { prose: 6, mono: 3 };   // Nunito, Cascadia — spike F3
export const FONT_NAME = { prose: "Nunito", mono: "Cascadia" };

// z_actual / z_scene machinery (PLAN.md §4) — legibility gate + diagnostics
export const USABLE_W = 1600;
export const USABLE_H = 850;
export const EXPORT_PAD = 10;
export const FRAME_LABEL_BAND = 20.5;

export const BODY_INSET = 24;        // see below
```

Band-internal spacing (not exported; `layout.mjs` locals):

```js
const FRAME_PAD_TOP = G, FRAME_PAD_BOTTOM = G;
const HEADING_DECK_GAP = 16, DECK_BODY_GAP = G;
const ROW_GAP = G;                   // between stacked rows/units
const CARD_GAP = 12;                 // between visually distinct stacked cards
const CARD_HEADER_GAP = 0;           // between a label card and its note card
const ARROW_CLEARANCE = 6;           // arrow tip to the shape it binds to
const FLOW_CARD_WIDTH = Math.min(760, PAGE_WIDTH / 3);
const CHROME_COLOR = "#1e1e1e";      // title/subtitle/heading/deck/footer
const FRAME_STROKE = "#94a3b8";      // frames + the timeline axis rule
```

Derived, do not hard-code: `wrapWidth(k) = (PAGE_WIDTH - (k-1)*GUTTER_COL) / k`.

**`BODY_INSET`.** Body content is laid out against `PAGE_WIDTH - 2*BODY_INSET`, not `PAGE_WIDTH`,
so a k=1 rectangle's edges don't sit flush on the frame boundary. `wrapWidth(k)` is still exactly
the formula above; the inset is applied to the width fed into it (`bodyWrapWidth(k)`), never to the
formula itself. Chrome (heading, deck line) uses `MARGIN`, not `BODY_INSET`.

## Roles → size and font

| Role | Size | Font | Bound? |
|---|---|---|---|
| title | 48 | prose | no |
| subtitle | 23 | prose | no |
| band heading | 38 | prose | no (framed) |
| deck line | 23 | prose | no (framed) |
| hero node | 30 | prose | **rectangle** |
| node label | 23 | prose | **rectangle** |
| note / evidence | 18 | prose | **rectangle** |
| free label | 23 | prose | no |
| annotation | 18 | prose | no |
| footer | 18 | prose | no |
| any code / formula / literal | inherit | **mono** | as above |

## `deck-spec.json` schema

```jsonc
{
  "title": "string",
  "subtitle": "string",
  "footer": "string",
  "bands": [
    {
      "heading": "string",
      "deck": "string",              // one line, <= 75 chars
      "pattern": "flow" | "row-of-stages" | "comparison" | "timeline" | "tree" | "checklist",
      "accent": "blue"|"green"|"amber"|"red"|"violet"|"slate",
      "nodes": [ ... ]               // shape depends on pattern, see below
    }
  ]
}
```

### Pattern node shapes

- **`flow`** — `nodes: [{ label, note? }]`. A vertical chain of cards, each connected to the
  next by a bound arrow. Cards are `FLOW_CARD_WIDTH` wide and centred on the page axis
  (`PAGE_X + PAGE_WIDTH/2`), **not** page-width. Column candidates: `[1]`.
- **`row-of-stages`** — `nodes: [{ label, note? }]`. Cards in a row, no connectors.
  Column candidates: `[n, ceil(n/2), 2]`, deduped and clamped to `1..n` — first that fits.
- **`comparison`** — `nodes: [{ label, tone?, items: [string] }]`. One column per node;
  `label` is a hero header card, `items` render as one left-aligned bulleted note card
  beneath it. `tone` maps to the accent shade for that column only.
- **`timeline`** — `nodes: [{ at, label, note? }]`. A horizontal axis line with a tick and a
  card per node, ordered left to right by array order. `at` is a display string (e.g. "0–4 min")
  and renders as chrome above the axis. One column per node.
- **`tree`** — `nodes: [{ label, children: [{ label }] }]`. Root row of hero rectangles, each
  with its children stacked beneath and connected by short lines.
- **`checklist`** — `nodes: [{ label, note? }]`. Two columns of left-aligned note-sized rows,
  text `• label — note`; used for dense enumerations.

Empty or whitespace-only labels are a **hard error** — the converter returns no text element
for an empty string (spike F7), so a container would silently render blank.

### Card composition

A node that has both a `label` and a `note` emits **two rectangles of equal width**, the note
directly beneath the label. The gap between them decides whether they read as one card or two
bars, so it is not a free parameter:

| Gap | Used by | Reads as |
|---|---|---|
| `CARD_HEADER_GAP` (0) | `flow`, `row-of-stages`, `timeline` | One card with a header band — the two boxes share a stroke |
| `CARD_GAP` (12) | `comparison`, `tree`, `checklist` | Separate rows — a bullet list, child nodes, or successive questions |

Merging a label/note pair into a **single** bound text is not an option: Excalidraw bound text is
single-style (one `fontSize` per container), so it would collapse the 23/18 ramp. The shared
stroke is what buys the card gestalt while keeping two sizes.

Two AABBs that share an edge exactly are **not** an overlap. `checkNoOverlap` uses strict `>` on
the intersection area, which makes `CARD_HEADER_GAP = 0` legal for every pattern rather than a
special case.

### Text alignment

Default is centred. Left-aligned: `comparison` items, `checklist` rows — both are lists, and
centring a bulleted list rags both edges.

`textAlign` is part of the metric tuple, so it must be set on the skeleton's `label` object at
build time and passed through `measureBoundHeight` as well. Mutating it on the returned element
changes the rendering without changing the measurement the layout was computed from.

The only available inset is Excalidraw's own `BOUND_TEXT_PADDING` (5px, symmetric,
unconfigurable) — container width *is* the wrap width in this library, so a larger left-only
inset would need a second invisible rectangle inside the card.

## Palette

Accents resolve to `{ stroke, fill }`. Content hues and chrome hues stay disjoint — see the
chrome colours below. `slate` is available as a band accent (band 04 uses it) and is a distinct
value from either chrome colour.

```js
const PALETTE = {
  blue:   { stroke: "#1e3a5f", fill: "#dbeafe" },
  green:  { stroke: "#047857", fill: "#d1fae5" },
  amber:  { stroke: "#b45309", fill: "#fef3c7" },
  red:    { stroke: "#b91c1c", fill: "#fee2e2" },
  violet: { stroke: "#5b21b6", fill: "#ede9fe" },
  slate:  { stroke: "#1e293b", fill: "#f1f5f9" },
};
```

Every element uses `roughness: 0` and `strokeWidth: 2`, matching the reference artifact.
`roughness: 0` must be set on the **label object itself** for bound text — the container's
`roughness` does not propagate, and bound text otherwise defaults to hand-drawn.

Chrome is `CHROME_COLOR` (`#1e1e1e`): title, subtitle, band heading, deck line, the timeline's
`at` labels, footer. `FRAME_STROKE` (`#94a3b8`) draws frames and the timeline axis rule.
Timeline tick marks and tree connector lines take the band accent's `stroke`, since they belong
to the content rather than the chrome. No chrome value is an accent, so the two never collide.

## Contrast

Text on a filled rectangle must clear 4.5:1 against that fill below 24 effective px, 3:1 at or
above. The pairs above are chosen to clear it; assert rather than assume.

## Deliverables

1. `scripts/layout.mjs` — pure geometry, **runs inside the browser page**. Exports
   `layoutDeck(spec, api)` where `api` is the Excalidraw module. Returns
   `{ elements, diagnostics }`.
2. `scripts/generate.mjs` — Node entry. Boots the existing harness
   (`scripts/harness-runner.mjs` exports `withHarness`), injects `layout.mjs`, runs it,
   writes `<out>.excalidraw`, and writes per-band + whole-scene PNGs beside it.
3. Validation inside `generate.mjs`, all fail-closed with a named cause:
   - every band's frame height ≤ `BAND_HEIGHT_CAP`
   - every band's content spans the page within `ε = 0.08 × PAGE_WIDTH`
   - no two elements in a band overlap (excluding a frame and its own children, and a
     container and its own bound text); strict `>` on the intersection area, so touching
     edges pass
   - `fontSize × z_actual(band) ≥ 12` for framed text, where
     `z_actual = min(1600 / frame.width, 850 / frame.height)`
   - every bound role resolved to a real text element
   - `boundElements` is an array on every element
   - every text/fill pair clears its contrast floor (4.5:1 below 24 effective px, 3:1 above)

**Edge-coverage exemptions.** `EDGE_COVERAGE_EXEMPT_PATTERNS = { "flow" }`. A centred k=1
column cannot clear `ε` by construction, and widening it back out to pass would reintroduce the
composition defect the narrowing exists to remove. Every other pattern still has to clear it —
the rule exists so a band cannot quietly abandon the page. Note the cost: `flow` now has no
positional gate at all, which is why frame bounds are pinned explicitly rather than left to the
converter.

The probe set for edge coverage excludes decorative `line` elements, so the timeline's
edge-to-edge axis cannot mask an under-filled band.
