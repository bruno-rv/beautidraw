# `deck-spec.json`

The only file you write. Semantic content, no geometry.

```jsonc
{
  "title": "string",       // canvas title, above band 01
  "subtitle": "string",    // one line under the title
  "footer": "string",      // one line below the last band
  "bands": [
    {
      "heading": "string",                 // the section title
      "deck": "string",                    // one line, <= 75 chars
      "pattern": "flow" | "row-of-stages" | "comparison" | "timeline" | "tree" | "checklist" | "canvas",
      "relation": "causal" | "dependency" | "temporal", // required only for flow
      "accent": "blue" | "green" | "amber" | "red" | "violet" | "slate",
      "nodes": [ /* required for structured patterns */ ],
      "height": 620, // required only for canvas; body height in 240..1000
      "visual": { /* required for automatic canvas composition */ }
    }
  ]
}
```

Bands render in array order and are numbered `01`, `02`, … in the frame name, which is what the
Excalidraw frame list shows.

For raster visuals, `visual.image.use` explains the learning purpose and
`visual.image.description` is a distinct accessible description. Callouts use
`kind: "example" | "boundary" | "inspect" | "warning"` and always include a
visible `label`.

While existing exemplars migrate, an omitted callout kind (or legacy string
callout) is temporarily treated as `example`. Explicit unsupported kinds still
fail validation.

## Node shapes

### `flow` — `{ relation, nodes: [{ label, note? }] }`
A vertical chain, each card joined to the next by a bound arrow. Cards are narrow and centred.

`relation` is required and must be `causal`, `dependency`, or `temporal`. Do not use flow for
settings precedence, scope, hierarchy, priority, or a list that happens to have an order.

```json
{ "label": "Quality gate", "note": "Persona review, diff cards, approvals, source checks" }
```

### `row-of-stages` — `{ label, note? }`
Cards side by side, no connectors. `note` is optional per node; label-only nodes are fine and
render as a single bar.

### `comparison` — `{ label, tone?, items: [string] }`
One column per node. `label` is the column header; `items` render as a left-aligned bulleted
list beneath it. `tone` overrides the band accent **for that column only** — this is what makes
a traffic-light band work.

```json
{
  "label": "Red — human decides",
  "tone": "red",
  "items": ["Hiring and promotion", "Pay and discipline"]
}
```

### `timeline` — `{ at, label, note? }`
A horizontal axis with a tick per node, left to right in array order. `at` is a display string
rendered above the axis — `"0–4"`, `"Q1"`, `"Day 1"`. It is not parsed; spacing is even
regardless of what it says.

### `tree` — `{ label, children: [{ label }] }`
A root row, each root with its children stacked beneath and connected by short lines.

### `checklist` — `{ label, note? }`
Two columns of left-aligned rows, rendered `• label — note`. For dense enumerations where each
row is a question or a check rather than a stage.

### `canvas` — `{ height, visual }`, no `nodes`

Allocates an empty deterministic body for a composed or hybrid frame. `height` is the body height,
from 240 to 1000. The heading and deck line remain normal frame chrome. `visual` is the semantic
visual thesis consumed by `scripts/auto-compose.mjs`; it contains a family, focus, nodes, and
caption. The automatic build pipeline fills every canvas band. Never deliver an empty canvas frame
or hand-author normalized coordinates for ordinary decks.

```jsonc
{
  "heading": "The mechanism is a network, not a list",
  "deck": "Several inputs converge on one decision",
  "pattern": "canvas",
  "accent": "violet",
  "height": 720,
  "visual": {
    "family": "orbit",
    "focus": "Decision point",
    "nodes": [
      { "label": "Evidence", "note": "What the decision can inspect" },
      { "label": "Constraint", "note": "What the decision cannot ignore" }
    ],
    "explanation": "Several scoped inputs shape one decision.",
    "evidence": ["The same repository can expose different context at different paths."],
    "tradeoff": "Broader scope increases reuse but also blast radius.",
    "caption": "The decision is the result of several scoped inputs.",
    "surface": "light"
  }
}
```

## Hard rules

Each of these is enforced — the generator throws rather than writing a file.

- **Empty or whitespace-only strings are fatal**, for labels, notes, headings and the three
  chrome strings alike. Excalidraw emits no text element for `""`, so the container would render
  blank and silently pass.
- **`accent` is required on every band** and must name one of the six; `tone` is optional and
  only `comparison` reads it. An unknown `pattern` or `accent` throws and lists what is accepted.
- **Every structured band needs at least one node**. A `canvas` band instead requires `height` from
  240 to 1000 and a semantic `visual` object. `bands` itself must be non-empty.

## Soft rule: the deck line

Keep `deck` to about **75 characters**. This is a guideline, not a gate: what the engine
actually enforces is a pixel budget, so an over-long deck line fails as
`band N deck line "…" measures Xpx, budget is 2120.0px`. 75 characters keeps you clear of it,
and beyond that the deck line competes with the heading anyway. The same budget check applies to
the title, subtitle, headings and footer, each against its own width.

## A complete minimal spec

Two bands, one of each of the most common shapes. Generates as-is.

```json
{
  "title": "Shipping the review pipeline",
  "subtitle": "What changed, and what it still costs us",
  "footer": "Questions before Friday",
  "bands": [
    {
      "heading": "Where the time goes",
      "deck": "Three stages, and only one of them is automated",
      "pattern": "row-of-stages",
      "accent": "blue",
      "nodes": [
        { "label": "Draft", "note": "Author writes, no gate" },
        { "label": "Review", "note": "Two approvals, median 14h wait" },
        { "label": "Merge", "note": "Automated once the suite is green" }
      ]
    },
    {
      "heading": "What we automate, what stays human",
      "deck": "Judgement calls do not get handed to a bot",
      "pattern": "comparison",
      "accent": "slate",
      "nodes": [
        {
          "label": "Machine decides",
          "tone": "green",
          "items": ["Formatting", "Test runs", "Merge on green"]
        },
        {
          "label": "Human decides",
          "tone": "red",
          "items": ["Design review", "Release sign-off"]
        }
      ]
    }
  ]
}
```
