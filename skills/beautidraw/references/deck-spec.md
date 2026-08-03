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
      "pattern": "flow" | "row-of-stages" | "comparison" | "timeline" | "tree" | "checklist",
      "accent": "blue" | "green" | "amber" | "red" | "violet" | "slate",
      "nodes": [ /* shape depends on pattern */ ]
    }
  ]
}
```

Bands render in array order and are numbered `01`, `02`, … in the frame name, which is what the
Excalidraw frame list shows.

## Node shapes

### `flow` — `{ label, note? }`
A vertical chain, each card joined to the next by a bound arrow. Cards are narrow and centred.

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

## Hard rules

- **Empty or whitespace-only labels are fatal.** Excalidraw emits no text element for `""`, so
  the container would render blank and silently pass. The generator refuses to write the file.
- **`deck` is capped at 75 characters** — beyond that it competes with the heading.
- **`accent` is required on every band**; `tone` is optional and only `comparison` reads it.
- Every band needs at least one node.

## Worked example

`examples/hr-ai/deck-spec.json` in this repo — 12 bands built from a planning conversation,
covering every pattern except `tree`. Its `out/` directory holds the rendered result.
