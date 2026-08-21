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
2. **Develop the argument before writing the spec.** A document, transcript, link, or topic is
   raw material, not an outline. Extract its claims, evidence, tensions, examples, decisions and
   consequences; discard packaging and duplicate phrasing. A URL that renders client-side (a
   chat share link, a docs site) needs a real browser — a title-only result means the page was not
   rendered. With no source, establish the audience, the deck's central claim, and what the
   audience should understand or do differently by the end; say what you settled on.
3. **Create a narrative spine.** Give the deck a point of view, not a topic tour. For substantial
   material, move through a meaningful arc: orient the audience, expose the important mechanism
   or tension, make the evidence concrete, compare plausible alternatives, and land on an
   implication or next move. Keep the source's nuance: trade-offs, exceptions and unresolved
   questions often make a deck more useful than a clean but shallow conclusion. Aim for 8–14 bands
   when the source can sustain it; use fewer only when the subject is genuinely narrow. Split a
   dense insight across bands rather than reducing it to a slogan.
4. **Make the visual treatment map.** For every band, decide its primary explanatory form—native
   structure, personalized illustration, or both—and state its visual thesis in one sentence.
   Choose the pattern now, from the question the band answers; this decision is required before
   writing `deck-spec.json`. Images come only after this map and the semantic structure are clear.
5. **Write `deck-spec.json`.** Schema and per-pattern node shapes: `references/deck-spec.md`.
   Choosing a pattern: `references/patterns.md`. Accents and type: `references/visual-system.md`.
   For illustrations read `references/blackboard-images.md` first — it is the canonical style and
   placement contract.
6. **Generate the structure:**
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/generate.mjs" <spec.json> <outdir>
   ```
   Both paths are yours; relative ones resolve against your current directory. Unless the user
   names an output directory, use `decks/<slug>/deck-spec.json` and `decks/<slug>/out/` — only
   `out/` is gitignored, so the spec stays tracked. Writes `deck.excalidraw`, `band-NN.png` per
   band, `scene.png`, and `diagnostics.json`.
7. **Add planned imagery.** Generate each accepted asset for its target frame or side zone;
   normalize it to that target’s exact aspect ratio and pixels; record its dimensions, placement
   mode, target band and use in `blackboard-asset-manifest.json`; then embed it. Never stretch a
   16:9 card to fill a differently shaped frame.
8. **Render the completed deck and inspect it.** Read the final `scene.png` and any risky band
   after embedding—not the pre-image render. Check text remains primary, images are undistorted,
   and every visual treatment earns its role. See "What the validators do not catch".
9. Hand over `deck.excalidraw` and its manifest-backed image assets.

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

## Make the content worth seeing

Do not compress the source into headings with decorative cards. Each band should earn its space
by doing one clear piece of audience work: establish context, reveal a mechanism, compare choices,
test an assumption, show a concrete example, or make an implication actionable. The deck line
states the claim of that band; its nodes supply the reasoning, evidence, example or consequence
that lets the audience believe it.

- **Prefer specificity over generic labels.** Replace "Benefits", "Challenges" and "Next steps"
  with the actual benefit, tension or decision. A useful node carries a fact, contrast,
  representative scenario, named condition, or consequence — not a paraphrase of its heading.
- **Use depth selectively, not density everywhere.** A core mechanism can take two or three bands:
  what it is, how it works, and where it breaks or changes the decision. Keep opening and closing
  bands spare enough to create rhythm.
- **Give abstractions an anchor.** Pair unfamiliar models with an example, before/after comparison,
  timeline, decision boundary, or concrete failure mode. Do not invent factual evidence; clearly
  frame illustrations and hypothetical scenarios as such.
- **Preserve tension.** If the source contains a trade-off, disagreement, uncertainty or human
  judgement call, show it. A presentation becomes superficial when it presents every issue as a
  frictionless process.
- **Write for a pan, not a transcript.** Notes may be complete thoughts, but they should be short
  enough to scan. If several sentences are required to make an idea intelligible, create another
  band with a different job.

## Design visual rhythm, not repeated cards

Content comes before imagery. Finish the narrative spine and visual treatment map, choose each
band's pattern, and write the semantic `deck-spec.json` before generating any visual asset. Then
choose imagery to reveal the already-defined idea, not merely to avoid repetition or supply a
theme. Before image generation, name the visual job,
the exact band it serves, and what the audience will understand from it that text alone would not
show. If that cannot be stated, do not generate the image. Check the sequence as a whole: a
process, a contrast, a timeline, a system map, a decision checklist, a worked example, or a visual
metaphor. Alternate between structural and explanatory bands so the deck has changes of pace.

For each substantial deck, create a short **visual treatment map** after the narrative is settled
and before writing the spec:
for every band, record whether its primary explanation is a native structure, a personalized
illustration, or both; then state the visual thesis in one sentence. Do not reuse a generic
pipeline, token stream, or decorative background across unrelated concepts. A generated image must
be specific to the band’s mechanism, tension, example or outcome: it can show a grounded scene, a
system metaphor, a before/after transformation, competing forces, a human decision point, or an
ecosystem of related actors. Use the image to create an original way into the idea, while the
foreground content supplies the precise claim and evidence.

- **Select the visualization from the question.** Use `flow` only when a causal sequence is the
  point. Use `comparison` as a table when the audience must compare the same dimensions across
  alternatives; use `timeline` for time; use `tree` for ownership, taxonomy or decomposition;
  use `checklist` for an applied diagnostic or decision; and use `row-of-stages` only for peers
  that do not depend on one another. A flow is never the fallback merely because the source has
  several concepts.
- **Prefer a personalized image for conceptual material.** When the audience needs intuition,
  emotional salience, a memorable analogy, or a view of an otherwise invisible system, generate a
  concept-specific illustration after writing its visual thesis. Use a native format instead when
  the audience must inspect exact values, categories, chronology, ownership or dependencies. Many
  bands should combine both: a large, bespoke frame background establishes the concept and one
  spacious foreground structure makes the argument inspectable.
- **Treat quantitative relationships honestly.** The native patterns do not render statistical
  charts. When the source contains trustworthy numerical data whose shape is the argument,
  generate a real chart or graph as a frame-native asset with labelled values and a source note,
  then embed it using the illustration placement contract. Never ask an illustration model to
  invent a chart, scale, trend or data label. If the data are not sufficient for a chart, use a
  comparison, timeline, tree or example instead.
- Rotate accents with semantic intent as well as visual variety. Repeated visual treatment is a
  signal to reconsider the story, not just recolour the next band.
- For decks of eight or more bands, identify at least two visual anchors that improve
  comprehension: a coloured-blackboard metaphor, a concrete before/after, or a distinctive
  structural pattern. Use illustrations when they clarify a hard-to-see relationship; do not add
  them as ornament. When an image is used as a background, make it a full-bleed parent-frame
  surface, sized for that frame and placed behind the explanatory content. It should be visibly
  large enough to carry the visual idea, while the foreground uses a small number of spacious,
  readable content groups—not a thin stack of boxes in the middle. Follow
  `references/blackboard-images.md` for any generated image and embed it before final delivery
  when imagery is part of the requested handoff.
- End with a synthesis, decision boundary, or actionable checklist that reflects the argument;
  avoid a generic "Questions?" band unless that is the intended outcome.

## What the validators do not catch

`generate.mjs` fails closed on arithmetic: band height cap, edge coverage, element overlap,
fit-zoom legibility, unresolved bound text, `boundElements` shape, contrast floors. A clean run
means the geometry is sound. It says nothing about whether the deck is any good. Yours to judge:

- **One idea per band** — a band is a section, not a slide, and not a dumping ground.
- **Notes earn their place** — a note that restates its label is noise; label-only is fine.
- a pattern that fights its content (a 12-step sequence as `row-of-stages`)
- bands that all look alike because the accent never rotates, or a band with one node in it
- text that is technically legible and actually unreadable at pan distance
- a deck that could be rearranged without changing its meaning, because its bands do not form an
  argument
- a summary-shaped deck: generic headings, labels that restate them, no concrete example or
  consequence, and no visible trade-off
- visual monotony: the same pattern, density and card treatment repeated until the canvas loses
  its rhythm

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
