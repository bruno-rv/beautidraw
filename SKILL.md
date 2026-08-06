---
name: beautidraw
description: Build an Excalidraw presentation from a document, transcript or topic — one continuous canvas of stacked, framed sections, every coordinate computed by a layout engine. Use when the user wants a deck, slides, or a visual walkthrough of a workflow or concept without PowerPoint.
---

# beautidraw

Produce one `.excalidraw` file: a single continuous canvas, sections stacked top to bottom,
each wrapped in a numbered `frame`. Opened and panned by hand on excalidraw.com. No slideshow,
no export, no presenter mode.

**You never type a coordinate.** You write semantic content into `deck-spec.json`; a layout
engine running inside a real browser computes every `x`, `y`, `width` and `height` from
Excalidraw's own text measurement. Guessing at geometry is the failure mode this exists to
remove — it produced every rendering defect in the deck this was built from. You own the spec;
generation is one command.

## Quick start

```json
{
  "title": "Shipping the review pipeline", "subtitle": "What changed", "footer": "Questions by Friday",
  "bands": [
    { "heading": "Where the time goes", "deck": "Three stages, one of them automated",
      "pattern": "row-of-stages", "accent": "blue",
      "nodes": [{ "label": "Draft", "note": "Author writes, no gate" },
                { "label": "Review", "note": "Two approvals, median 14h wait" }] }
  ]
}
```

Full schema, every pattern's node shape, and a complete two-band spec: `references/deck-spec.md`.

## Build a deck

1. **Set up.** Dependencies, a Chromium binary and the 27 MB vendored Excalidraw bundle — none
   ship with the plugin:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs"
   ```
   Idempotent. On a provisioned tree it prints `already provisioned` and exits. Run it first
   every time rather than guessing.
2. **Read the source.** A document, a transcript, a link, or just a topic. Extract the
   substance; ignore the packaging. A URL that renders client-side (a chat share link, a docs
   site) needs a real browser — a title-only result means the page was not rendered. With no
   source at all, settle who is in the room and what the deck is *claiming* first, and say what
   you settled on.
3. **Write `deck-spec.json`.** Schema and per-pattern node shapes: `references/deck-spec.md`.
   Choosing a pattern: `references/patterns.md`. Accents and type: `references/visual-system.md`.
   For illustrations read `references/blackboard-images.md` first — it is the canonical style and
   placement contract.
4. **Generate:**
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/generate.mjs" <spec.json> <outdir>
   ```
   Both paths are yours; relative ones resolve against your current directory. Unless the user
   names an output directory, use `decks/<slug>/deck-spec.json` and `decks/<slug>/out/` — only
   `out/` is gitignored, so the spec stays tracked. Writes `deck.excalidraw`, `band-NN.png` per
   band, `scene.png`, and `diagnostics.json`.
5. **Look at the PNGs.** Read `scene.png`, and any band that seems risky. Not optional — see
   "What the validators do not catch".
6. Hand over `deck.excalidraw`.

`${CLAUDE_PLUGIN_ROOT}` is substituted by Claude Code; outside a plugin install use your
checkout path.

## Write the presentation, not a script for it

The most likely way a deck goes wrong, and no validator catches it: you summarise **advice
about how to present** instead of the presentation itself. It happens whenever the source is a
planning conversation, a brief, or a coaching transcript. The tell is in the headings — "The
mental model **to teach**", "Run of show — 45 minutes". The audience sees meta-commentary about
a session they are sitting in.

Rewrite so every heading, deck line and node speaks to the audience about the subject: "From an
HR need to a reusable playbook", "One spreadsheet becomes decision-ready insight". Timings,
delivery order, presenter scripts and balance percentages are **not** deck content. If the
source is mostly delivery advice, the deck is built from what that advice is *about*.

## What the validators do not catch

`generate.mjs` fails closed on arithmetic: band height cap, edge coverage, element overlap,
fit-zoom legibility, unresolved bound text, `boundElements` shape, contrast floors. A clean run
means the geometry is sound. It says nothing about whether the deck is any good. Yours to judge:

- **One idea per band** — a band is a section, not a slide, and not a dumping ground.
- **Notes earn their place** — a note that restates its label is noise; label-only is fine.
- a pattern that fights its content (a 12-step sequence as `row-of-stages`)
- bands that all look alike because the accent never rotates, or a band with one node in it
- text that is technically legible and actually unreadable at pan distance

Read `scene.png` and judge it. If a band looks wrong the fix is almost always in the spec — a
different pattern, fewer nodes, shorter notes — not in the layout engine.

## When generation fails

Failures are deliberate and named. Read the message; it tells you which band and which rule.

| Failure | Fix in the spec |
|---|---|
| `exceeds BAND_HEIGHT_CAP` | fewer nodes, shorter notes, or split the band |
| `exhausted column candidates` | same — the pattern cannot fit this much content |
| `measures Npx, budget is Mpx` | a title, heading, deck line or footer is too long for its width budget — shorten it |
| `label is empty or whitespace-only` | a label, heading or chrome string is blank; the converter emits no text for `""` |
| `nodes must be a non-empty array` | every band needs at least one node |
| `unknown pattern` / `unknown accent` | the message lists the accepted values |
| `content spans [...]` (edge coverage) | the band abandons the page; usually too few nodes |
| overlap / contrast / `below the 12px gate` | report it — no spec can cause these; they indicate an engine bug |

Do not edit `scripts/layout.mjs` to make a deck pass. The engine's constants are measured, and
`scripts/LAYOUT-CONTRACT.md` records why each one holds.

## References

- `references/deck-spec.md` — the schema, every pattern's node shape, a complete example
- `references/patterns.md` — which of the six patterns fits what, and node counts that work
- `references/visual-system.md` — palette, accent rotation, type ramp, contrast, `mono`
- `references/blackboard-images.md` — the illustration style contract, and what it cannot yet do
- `${CLAUDE_PLUGIN_ROOT}/scripts/LAYOUT-CONTRACT.md` — the engine's measured invariants
  (read only if changing it)

Decks are type- and shape-led. Illustrations go in only after the engine has produced the frame
geometry, and `deck-spec.json` carries no image fields — a regeneration drops them, so the
embedding step must be reapplied.
