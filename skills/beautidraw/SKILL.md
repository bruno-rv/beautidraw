---
name: beautidraw
description: Build an Excalidraw presentation from a document or a topic — one continuous canvas of stacked, framed sections. Use when the user wants to present workflows, ideas or concepts visually without PowerPoint.
---

# beautidraw

Produce one `.excalidraw` file: a single continuous canvas, sections stacked top to bottom,
each wrapped in a numbered `frame`. Opened and panned by hand on excalidraw.com. No slideshow,
no export, no presenter mode.

## The one thing that makes this work

**You never type a coordinate.** You write semantic content into `deck-spec.json`; a layout
engine running inside a real browser computes every `x`, `y`, `width` and `height` from
Excalidraw's own text measurement. Guessing at geometry is the failure mode this exists to
remove — 35 of 35 confirmed defects in the reference artifact were arithmetic, not taste.

```
source (document | topic)
  └─> [A] you        → deck-spec.json        semantic, zero geometry
       └─> [B] engine → deck.excalidraw      all geometry, zero judgement
            └─> [C] engine → validators + PNGs
```

You own stage A. Stages B and C are one command.

## Build a deck

1. **Read the source.** A document, a transcript, a link, or just a topic. Extract the
   substance; ignore the packaging.
2. **Write `deck-spec.json`.** Schema and per-pattern node shapes:
   `references/deck-spec.md`. Choosing a pattern: `references/patterns.md`. Accents and type:
   `references/visual-system.md`.
   If the deck needs illustrations, read `references/blackboard-images.md` before generating
   them; it is the canonical colored-blackboard style and embedding contract.
3. **Generate:**
   ```
   node <plugin>/scripts/generate.mjs <spec.json> <outdir>
   ```
   Absolute paths are fine and the command runs from any working directory. Writes
   `deck.excalidraw`, `band-NN.png` per band, `scene.png`, and `diagnostics.json`.
4. **Look at the PNGs.** Read `scene.png` for the whole canvas and any band that seems risky.
   This step is not optional — see "What the validators do not catch".
5. Hand over `deck.excalidraw`.

First run in a fresh checkout needs `pnpm install` and `pnpm bundle` (builds the vendored
Excalidraw bundle into `scripts/vendor/`). Check whether `scripts/vendor/excalidraw.js` exists
before assuming it does.

## Write the presentation, not a script for it

The most likely way a deck goes wrong, and no validator catches it: you summarise **advice
about how to present** instead of the presentation itself. It happens whenever the source is a
planning conversation, a brief, or a coaching transcript.

The tell is in the headings. These address the presenter:

- "Lead with the work, not the feature list"
- "The mental model **to teach**"
- "Only four concepts **are worth teaching**"
- "Run of show — 45 minutes"
- a footer reading "~15% concepts, ~70% workflows"

The audience sees meta-commentary about a session they are sitting in. Rewrite so every
heading, deck line and node speaks to the audience about the subject:

- "From an HR need to a reusable playbook"
- "Four things to remember"
- "One spreadsheet becomes decision-ready insight"

Timings, delivery order, presenter scripts and balance percentages are **not** deck content.
If the source is mostly delivery advice, the deck is built from what that advice is *about*.

## Content rules

- **One idea per band.** A band is a section, not a slide, and not a dumping ground.
- **The deck line is an argument, not a label.** ≤ 75 characters, and it should say something
  the heading does not.
- **Notes earn their place.** A node with a label and no note is fine. A note that restates the
  label is noise.
- **Prose is the default font.** `mono` is a role — code, formulas, CLI, file paths, literal
  identifiers — not a house style. (Not yet wired for note text; write formulas as prose.)
- **6–12 bands** reads as a session. Beyond that, split the deck.

## What the validators do not catch

`generate.mjs` fails closed on arithmetic: band height cap, edge coverage, element overlap,
fit-zoom legibility, unresolved bound text, `boundElements` shape, contrast floors. A clean run
means the geometry is sound.

It says nothing about whether the deck is any good. Composition defects that pass every gate:

- a pattern that fights its content (a 12-step sequence as `row-of-stages`)
- bands that all look alike because the accent never rotates
- a band with one node in it
- text that is technically legible and actually unreadable at pan distance

So read `scene.png` and judge it. If a band looks wrong, the fix is almost always in the spec —
a different pattern, fewer nodes, shorter notes — not in the layout engine.

## When generation fails

Failures are deliberate and named. Read the message; it tells you which band and which rule.

| Failure | Fix in the spec |
|---|---|
| `exceeds BAND_HEIGHT_CAP` | fewer nodes, shorter notes, or split the band |
| `exhausted column candidates` | same — the pattern cannot fit this much content |
| `label is empty or whitespace-only` | a label is blank; the converter emits no text for `""` |
| `content spans [...]` (edge coverage) | the band abandons the page; usually too few nodes |
| overlap / contrast / legibility | report it — these indicate an engine bug, not a spec bug |

Do not edit `scripts/layout.mjs` to make a deck pass. The engine's constants are measured, and
`scripts/LAYOUT-CONTRACT.md` records why each one holds.

## References

- `references/deck-spec.md` — the schema and every pattern's node shape
- `references/patterns.md` — which of the six patterns fits what, and node counts that work
- `references/visual-system.md` — palette, accent rotation, type ramp, contrast
- `../../scripts/LAYOUT-CONTRACT.md` — the engine's measured invariants (read only if changing it)

Generic decks remain type- and shape-led. When a presentation needs illustration assets, use the
canonical colored-blackboard reference in `references/blackboard-images.md`, keep the asset map
explicit, and embed images only after viewing the rendered result.
