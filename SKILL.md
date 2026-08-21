---
name: beautidraw
description: Create substantive, visually authored Excalidraw presentations from documents, transcripts, links, or topics. Use when the user wants a continuous-canvas deck whose content, composition, diagrams, and generated imagery are designed around the argument rather than forced into repeated slide templates.
---

# Beautidraw

Create one `.excalidraw` presentation: a continuous canvas of numbered frames, designed to be
opened and panned in Excalidraw. The result is a visual explanation, not a decorated outline.

The governing order is:

> **substance → narrative → visual thesis → composition → assets → Excalidraw → visual QA**

Never reverse it. Do not begin with a template, pattern, or generated image and then shrink the
content until it fits.

## Non-negotiable outcome

A good Beautidraw deck must make the audience understand something they could not get from a list
of headings. It develops a point of view, uses concrete evidence or examples, preserves meaningful
tensions, and changes visual form when the idea changes.

Reject a deck—even if the geometry passes—when it has any of these characteristics:

- generic headings such as “Benefits”, “Challenges”, or “Next steps” without the actual claim;
- labels that merely paraphrase their heading;
- a sequence of small boxes and arrows used for ideas that are not genuinely sequential;
- the same composition repeated with different colours;
- a generated image acting as wallpaper behind the same fixed card layout;
- a concept image chosen before the content it is meant to explain;
- no concrete example, evidence, trade-off, decision, or consequence;
- meta-commentary about how to present instead of the presentation itself.

## Read the references at the point of use

- Read `references/content-composition.md` before planning any substantive deck. It defines the
  depth brief, narrative spine, composition lanes, visual treatment map, and acceptance review.
- Read `references/deck-spec.md` and `references/patterns.md` only for bands using the structured
  lane.
- Read `references/composition-spec.md` for every composed or hybrid band. It defines the `canvas`
  frame contract, normalized geometry, supported elements, and deterministic assembly command.
- Read `references/visual-system.md` for typography, palette, contrast, and frame geometry.
- Read `references/blackboard-images.md` before generating or embedding any illustration.
- Read `scripts/LAYOUT-CONTRACT.md` only when changing the deterministic layout engine.

## Build workflow

### 1. Set up

Dependencies, Chromium, and the vendored Excalidraw bundle do not ship with the plugin:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs"
```

Run it first. It is idempotent. Outside a plugin install, use the Beautidraw checkout path.

### 2. Establish the content brief

Read the source and extract substance rather than mirroring its packaging. A client-rendered URL
needs a real browser; a title-only result is not a source read.

Before any visual decision, write a short content brief containing:

- audience and the change in understanding or action the deck should create;
- one central claim;
- the essential claims that support it;
- the evidence, examples, mechanisms, trade-offs, exceptions, or decisions behind those claims;
- what remains uncertain or outside scope.

With only a topic, develop the explanation first. Do not generate imagery to discover what the
deck is about. Do not invent factual evidence; mark hypothetical examples as hypothetical.

### 3. Create the narrative spine

Turn the brief into an argument, not a topic inventory. A useful arc commonly orients the audience,
reveals a mechanism or tension, makes it concrete, tests alternatives, and lands on an implication
or action. Keep the shape that best fits the material rather than forcing this exact sequence.

Substantial subjects generally need 8–14 bands. Use fewer when the subject is genuinely narrow,
not because the visual template is cramped. Split a dense idea into distinct audience jobs instead
of compressing it into slogans.

Every band must have:

- an **audience job**: what this band enables the viewer to understand or decide;
- a **claim**: a sentence with a point of view, not a category label;
- **support**: evidence, mechanism, example, contrast, boundary, or consequence;
- a **visual thesis**: what relationship the audience should be able to see.

### 4. Make the visual treatment map

Choose the composition only after the band’s content is developed. For every band, record:

- audience job, claim, and support;
- visual thesis;
- execution lane: `structured`, `composed`, or `hybrid`;
- composition family;
- image or data asset needed, if any;
- intended density and reading order.

Across a substantial deck, use several genuinely different composition families. Colour changes do
not count as variation. Avoid more than two adjacent bands with the same lane and composition unless
the repetition itself makes a comparison easier.

### 5. Choose the execution lane band by band

#### Structured lane

Use the deterministic layout engine when the native structure is the clearest explanation:

- `flow` for genuine causality or dependency;
- `comparison` for parallel dimensions across alternatives;
- `timeline` for change through time;
- `tree` for hierarchy or decomposition;
- `checklist` for a practical diagnostic or decision;
- `row-of-stages` for peers with no causal order.

Write those bands into `deck-spec.json` and generate them normally. Never choose a native pattern
merely because it is available.

#### Composed lane

Use a bespoke frame when the idea is better explained by a scene, spatial metaphor, annotated
system, before/after, tension, evidence collage, map, or other content-specific composition.

The illustration is the explanatory structure, not a background. Generate it only after its visual
thesis and target aspect ratio are known. Integrate a small number of direct Excalidraw labels,
callouts, arrows, highlights, or source notes around the focal objects. Do not place the scene behind
a centred stack of generic cards.

Use Excalidraw’s browser conversion and restoration APIs for custom elements, then validate the
finished frame. Coordinates may be produced by deterministic composition code or derived from the
known frame geometry; they must not be guessed and left unverified.

#### Hybrid lane

Use a hybrid when a personalized visual establishes intuition and a precise structure makes the
claim inspectable—for example, a concept scene beside a comparison, a system illustration with a
small evidence table, or a human decision point beside a decision boundary.

Give each part a deliberate zone. The illustration must not be a low-opacity full-frame wash unless
the band genuinely benefits from that treatment. Foreground content should occupy the space it
needs, not default to the same centre column.

### 6. Generate and assemble

For structured bands, write semantic content into `deck-spec.json`, then run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/generate.mjs" <spec.json> <outdir>
```

Unless the user names an output directory, keep the tracked spec at
`decks/<slug>/deck-spec.json` and generated files under `decks/<slug>/out/`.

For composed and hybrid bands:

1. obtain the generated frame geometry;
2. generate or prepare the visual at the exact target aspect ratio;
3. inspect and reject weak or generic assets before embedding;
4. add the frame-native image and direct annotations;
5. preserve explicit `frameId` membership and child-before-frame element order;
6. update `blackboard-asset-manifest.json` with file, SHA-1, dimensions, placement mode, band,
   and intended use;
7. rerender the completed `.excalidraw` after embedding.

Use the deterministic composer rather than hand-editing the final JSON:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/compose.mjs" <deck.excalidraw> <composition-spec.json> <outdir>
```

Every composed or hybrid band must be a `canvas` band in `deck-spec.json` and must have exactly one
entry in `composition-spec.json`. The composer rejects missing, duplicate, non-canvas, out-of-bounds,
or aspect-mismatched compositions.

A regeneration can remove post-processed images and custom elements. Preserve or reapply the
assembly step before delivery.

### 7. Validate the actual presentation

The generator checks geometry, overlap, edge coverage, fit-zoom legibility, bound text, contrast,
and other structural invariants. Those checks do not establish presentation quality.

Inspect the final continuous canvas and representative frames after all images and custom elements
are present. Verify:

- the content brief is visible in the deck rather than reduced to vague labels;
- each band performs its audience job;
- the visual form matches the content’s relationship;
- images are concept-specific, undistorted, and explanatory;
- text is readable at pan distance and does not cover focal objects;
- reading order is obvious without presenter narration;
- the deck has rhythm: changes in scale, density, composition, and visual emphasis;
- claims are accurate, sourced where appropriate, and honest about uncertainty;
- the last band synthesizes, decides, or enables action instead of ending generically.

If the deck still looks like repeated boxes with different backgrounds, it has failed this review.
Revise the treatment map or move the affected bands to the composed/hybrid lane.

### 8. Deliver

Hand over the completed `.excalidraw`, the final rendered overview, and any manifest-backed image
assets required to preserve the result. State any limitation that remains. Do not present a clean
geometry report as proof that the presentation itself is good.

## Generation failures

Failures from `generate.mjs` are deliberate and named. Fix spec-caused failures in the spec by
splitting content, shortening text, or selecting a pattern that fits the idea. Do not weaken
`scripts/layout.mjs` to make a deck pass. Overlap, contrast, unresolved binding, or text below the
legibility gate indicates an engine or composition defect that must be reported and corrected.
