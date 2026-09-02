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

## Composition budget (hard gate)

The deterministic patterns are a vocabulary, not a default visual treatment. A substantial deck
with 8 or more bands must satisfy all of these constraints:

- At most half of the bands may use `flow`, `row-of-stages`, `comparison`, `timeline`, `tree`, or
  `checklist`.
- At least one band in every three must be `canvas` and filled through a composed or hybrid
  semantic visual plan.
- A deck with 10 or more bands must include at least two topic-specific raster illustration
  frames. Generate them after the visual thesis is known, review them, save them under the deck's
  `assets/` directory, and reference them through the `illustration` family.
- No structured pattern may appear more than twice, and structured bands may not run for more than
  two consecutive bands. The same cap applies to composed visual families (`field`, `spotlight`,
  `evidence`, …): at most twice per substantial deck. Raster `illustration` frames are exempt.
- Every canvas band must contain a visual relationship—such as a spatial map, transformation,
  tension, evidence collage, or network—with at least two non-text primitives (arrows, lines,
  ellipses, diamonds, or a scene image). A surface plus labels is still a box layout.
- Non-sequential canvas families may use at most three connectors. A pipeline or journey may use
  more only when order is the claim; do not turn every visual into a flowchart.
- A structured `flow` band must declare `relation: causal`, `dependency`, or `temporal`. Scope,
  precedence, hierarchy, taxonomy, and priority are not flows; use a field, matrix, layered
  illustration, comparison, or map.
- Develop the supporting explanation before shrinking it into a label. The audit expects roughly
  42 words of support per band on average and a depth field (`explanation`, `evidence`, or
  `tradeoff`) on canvas bands; split a dense mechanism across bands instead of making every frame
  a title plus cards.

Run the gate before generation:

```bash
node scripts/audit-deck-spec.mjs decks/<slug>/deck-spec.json
```

If it fails, revise the treatment map and semantic visual plans. Do not bypass it by rotating colours,
adding decorative arrows, or putting the same cards on a `canvas` surface.

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
- Read `references/semantic-visuals.md` for every composed or hybrid band. It defines the semantic
  visual families and the automatic composer contract.
- Read `references/composition-spec.md` only when a frame genuinely needs the low-level manual
  composer for a raster asset or exceptional custom element.
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

Treat the composition budget above as a design constraint while making the map. A row of native
patterns followed by one token scene is not variety. Plan the scene, map, transformation, or
worked-example frames first; use structured bands only where the relationship truly needs exact
inspection.

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

Describe that scene semantically in the same `deck-spec.json` band. Every `canvas` band must include
a `visual` object with:

```json
{
  "family": "illustration | orbit | field | spotlight | constellation | evidence | matrix | threshold | map",
  "focus": "the visual thesis or focal object",
  "nodes": [{ "label": "short label", "note": "why it matters" }],
  "explanation": "two sentences that explain the mechanism or consequence",
  "example": "a concrete repository or command-level scenario",
  "evidence": ["source-backed observation or concrete example"],
  "tradeoff": "boundary, tension, or decision consequence",
  "inspect": "the command or file that lets the viewer verify the claim",
  "callouts": [{ "label": "short label", "note": "why this callout matters" }],
  "image": { "file": "assets/topic-scene.png", "side": "left", "use": "what the scene explains", "description": "detailed description of the visual scene" },
  "caption": "one sentence that explains the relationship",
  "surface": "light | dark"
}
```

The automatic composer owns all coordinates, spacing, shape selection, colour rotation,
connector geometry, and image embedding directly from `visual.image`. Do not hand-author
`composition-spec.json`; the build pipeline computes layout deterministically.

For `illustration` bands, use the raster `imagegen` workflow and request a text-free, topic-specific
scene with one coherent visual thesis. The composer reads the PNG dimensions and computes the image
zone automatically; the model still does not type coordinates. Reject generic wallpaper, accidental
text, logos, repeated visual metaphors, or an image that merely restates the heading.

The illustration is the explanatory structure, not a background. Generate it only after its visual
thesis and target aspect ratio are known. Integrate a small number of direct Excalidraw labels,
callouts, arrows, highlights, or source notes around the focal objects. Do not place the scene behind
a centred stack of generic cards.

### Illustrate by default, not as a last resort

Every deck should lean on generated imagery well beyond the minimum two raster frames. Default to
one metaphor-bearing illustration per major idea the deck introduces — a mechanism, a threshold, a
trade-off, a persona, a lifecycle stage — not merely one per deck. Use visuals to carry meaning
that prose would otherwise state: a brain filling past a line for a context budget, a knot
unwinding into one line for a simplification pass, a forked road for an alternative path. If a
band's explanation contains a "like" or "imagine", that simile is the image brief.

Keep the budget honest: an illustration must argue the band's point (see the rejection criteria in
`references/blackboard-images.md`), not decorate it. Never restate the heading as an image. When in
doubt between a fourth card row and a first illustration, choose the illustration.

### Compose scenes, not icons

An illustration must be a complete **scene**, never a lone object floating on an empty board. A
single floating object (a rocket, a microphone, a dial alone, a mouse next to a ruler) reads as a
box with minor contents — the exact failure user review rejects. Require:

- **An environment**: ground, sky, walls, furniture, or landscape that fills the frame edge to
  edge (layered foreground, midground, background) — not a centred object with wide empty margins;
- **Several interacting elements** (at least 3–5) around the focal metaphor: secondary actors,
  props, terrain, atmosphere — the metaphor is one element inside a lived-in world;
- **A reason the elements are together**: the environment should carry the band's claim (a harbor
  for parallel shipping lanes, a canyon fork for a branching choice, a war-room table for a
  second opinion), not just decorate around the object.

Brief-check before generating any image: if the subject line names one object and nothing else,
expand it into the scene that object lives in. Also reject "generous margins" and "16:9 card"
wording in prompts — they push the model toward sparse centred compositions.

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

### 6. Generate and publish

Run the presentation audit before generation:

```bash
node scripts/audit-deck-spec.mjs decks/<slug>/deck-spec.json
```

Then run the single automatic build command:

```bash
node scripts/build-deck.mjs decks/<slug>/deck-spec.json decks/<slug>/out
```

The build runs preflight, deterministic base layout, automatic visual composition, asset
embedding, and accessible outline generation in a transactional sibling stage, publishes atomically,
and prints the build receipt:

```text
BUILD DECK OK — decks/<slug>/out
elapsed: 2403 ms
frames: 15
embedded assets: 4
bytes: 27604176
deck: decks/<slug>/out/deck.excalidraw
scene: decks/<slug>/out/scene.png
diagnostics: decks/<slug>/out/diagnostics.json
manifest: decks/<slug>/out/composition-manifest.json
outline: decks/<slug>/out/outline.md
```

Unless the user names an output directory, keep the tracked spec at
`decks/<slug>/deck-spec.json` and generated files under `decks/<slug>/out/`.

For composed and hybrid bands, the automatic composer:

1. reads the semantic `visual` object and validates `use` and distinct `description` for any image;
2. chooses the declared family and a palette variant;
3. lays out shapes, labels, connectors, and captions in normalized frame coordinates;
4. converts through Excalidraw's browser API and validates the finished elements;
5. embeds referenced raster assets with content-hashed file IDs into `deck.excalidraw`.

The single `build-deck.mjs` command handles all composition, embedding, and outline generation.

### 7. Validate the actual presentation

The generator checks geometry, overlap, edge coverage, fit-zoom legibility, bound text, contrast,
and other structural invariants. Those checks do not establish presentation quality.

Inspect the final continuous canvas and representative frames after all images and custom elements
are present. Verify:

- the content brief is visible in the deck rather than reduced to vague labels;
- each band performs its audience job;
- each concept names its mechanism, a concrete example, the important boundary or exception, and
  an inspection command or artifact;
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
