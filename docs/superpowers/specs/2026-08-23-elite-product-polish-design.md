# Beautidraw Elite Product Polish Design

**Date:** 2026-08-23

**Status:** Approved direction; implementation pending written-spec review

## Product outcome

Beautidraw should feel like a mature learning-product generator whose primary
path is obvious, deterministic, recoverable, and visually trustworthy. A user
provides a semantic deck specification and receives a complete Excalidraw
learning canvas, readable frame and scene renders, diagnostics, and an
accessible outline from one command. The output must remain useful inside the
real Excalidraw editor, not only in exported PNGs.

The work refines the current product. It does not create a competing editor,
presentation runtime, or generic design system.

## Evidence behind the design

The design is based on current repository and runtime evidence gathered on
2026-08-23:

- `node scripts/build-deck.mjs` builds the 14-frame Claude Code artifact in
  roughly 2.8-3.2 seconds and emits 239 Excalidraw elements, four embedded
  files, frame PNGs, a scene PNG, diagnostics, and composition metadata.
- The current `llm-token-flow` and `rag-vector-graph` examples fail the
  repository's own semantic-presentation audit because they are entirely
  structured bands with repeated layouts and no canvas compositions.
- Fresh generated decks render intact exported PNGs but visibly clip intact
  text in the local Excalidraw editor at ordinary zoom levels.
- Fit-to-frame produces approximately 9 px effective body text at 1280x800
  and 7.2 px at 1024x768. Fit-all places long decks at 10% zoom and makes
  their content unusable.
- The canvas accessibility tree exposes toolbar controls and frame names, but
  not the ordered frame content, image descriptions, or inspection links.
- Images are valid and embedded. An immediate editor screenshot can show a
  placeholder because `addFiles()` starts asynchronous image-cache hydration
  and returns before the cache is ready.
- Missing image assets and oversized callouts can reach the composition stage,
  fail with raw Node stack traces, and leave partial output behind.
- The live viewer-parity gate currently blocks because the live Excalidraw
  build moved beyond the pinned viewer build.
- Composition is the measured hotspot at roughly 1.7-2.0 seconds and
  730-765 MB maximum RSS. The current performance is acceptable; correctness
  and output size matter more than speculative speed work.

## Design principles

1. **One golden path.** A successful `build-deck` invocation produces every
   supported deliverable. No hidden image-embedding command is required.
2. **Editor truth matters.** Exported PNG correctness does not excuse clipping,
   missing files, or broken frame behavior in Excalidraw.
3. **Concept before container.** Layout follows the relationship being taught.
   Repeated flow rows, comparison cards, and background wallpaper are rejected
   when they do not explain the claim.
4. **Images are evidence.** Raster illustrations must clarify a mechanism,
   boundary, contrast, or mental model. Decorative repetition is removed.
5. **Readable by default.** Titles, explanations, commands, labels, and
   inspection cues remain legible at supported frame-fit sizes.
6. **Accessible in parallel.** Because Excalidraw is canvas-based, every build
   emits a semantic outline rather than pretending the canvas alone is
   screen-reader complete.
7. **Fail early and preserve success.** Invalid input does not launch Chromium,
   emit a raw stack, or replace the last successful output with partial files.
8. **Remove more than we add.** Retire conflicting documentation, hidden
   post-processing, repeated wallpaper, redundant visual primitives, and
   temporary compatibility paths as the golden path absorbs their purpose.

## Product contract

The primary command remains:

```sh
node scripts/build-deck.mjs <deck-spec.json> <output-directory>
```

On success it emits:

- `deck.excalidraw` with valid frame membership and embedded image files;
- `band-NN.png` for every frame;
- `scene.png` for the complete canvas;
- `diagnostics.json` with stage, geometry, asset, and viewer-fidelity results;
- `composition-manifest.json` describing semantic layout decisions and assets;
- `outline.md` containing the title, subtitle, ordered frame headings, frame
  explanations, image descriptions, inspection commands, and real links.

Build output is staged in a sibling temporary directory. Only a completely
validated build replaces the requested output directory. A failed build
preserves the prior successful output and removes its own staging directory.

Every public CLI entry point supports `--help`, reports the failing stage and
input path, suggests a recovery action, and omits raw stacks unless an explicit
debug mode is selected.

A successful build ends with a compact receipt: elapsed time, frame count,
embedded-asset count, total artifact size, and direct paths to the Excalidraw
deck, scene render, diagnostics, and accessible outline. This is the primary
delight detail: the product closes the loop and makes the next action obvious
without confetti, animation, or extra interaction.

## Semantic and visual system

### Frame hierarchy

Each frame has:

- one claim-bearing heading;
- one concise subtitle when it materially narrows the claim;
- one dominant visual argument;
- supporting explanation with mechanism, example, boundary, and inspection
  guidance when the subject requires them;
- no more content than can remain readable at the supported frame-fit size.

Body explanations use the readable text role. Code, commands, paths, and
measured values use the mono role. The handwritten role is reserved for short
annotations and emphasis, not paragraphs.

The smallest text inside a frame must render at an effective size of at least
12 px when that frame is fit at 1280x800 and 1600x900. At 1024x768 and
800x600, the generated outline is the supported reading surface and the deck
must provide a concise navigation/readability cue instead of implying that
fit-all is readable.

### Layout vocabulary

Layouts are selected by semantic relationship:

- sequence or causality: directional mechanism with explicit transitions;
- hierarchy or precedence: layered or nested spatial argument;
- comparison: shared dimensions and a visible decision boundary;
- classification: spatial grouping with meaningful axes or containment;
- inspection: concrete artifact, command, or evidence path;
- mental-model correction: misconception and corrected mechanism in direct
  tension.

The same layout pattern cannot be the default for consecutive frames. Cards
and boxes are used only when their boundary carries meaning.

### Images and icons

`visual.image` is the only supported image-authoring contract. The build embeds
the image directly and records its SHA-1, dimensions, source path, purpose, and
description in the composition manifest.

Each image specification requires a concise description suitable for the
accessible outline. Missing files, invalid dimensions, unsupported formats,
or missing descriptions fail during the preflight audit.

New raster illustrations use thesis-specific ImageGen output. A deck uses the
smallest useful number of images; the same illustration is not reused across
unrelated claims. Existing repeated blackboard-background post-processing is
removed once its examples are migrated.

Small semantic icons may identify `example`, `boundary`, `inspect`, and
`warning`. They use one coherent Excalidraw-native line style, carry a text
label, and never replace the label or become decorative card furniture.

Dark frames are exceptional emphasis surfaces. They must earn the contrast
through the visual thesis and meet the same text, focus, and image-legibility
requirements as light frames.

## Interaction and wayfinding

The continuous canvas remains the core interaction model. Beautidraw does not
ship a second editor or presenter runtime.

To make long canvases usable:

- every frame has a stable zero-padded name and semantic title;
- the canvas begins with a compact overview containing the ordered frame map
  and the instruction to use Excalidraw's frame navigation rather than fit-all;
- the accessible outline mirrors the same order and headings;
- real URLs become Excalidraw links and Markdown links;
- commands and local paths receive a clearly copyable mono treatment even when
  the editor cannot provide a click action;
- inspection cues name both the action and the evidence the learner should
  expect to find.

Frame selection, zoom, pan, undo, help, and image hydration are verified in the
local harness. The harness itself exposes a visible loading state, a visible
failure state with recovery detail, and an explicit ready state for browser
tests.

## Accessibility

The build must not claim that a rasterized canvas is screen-reader accessible.
Instead it provides equivalent ordered content in `outline.md`.

The outline includes:

- deck title and subtitle;
- one heading per frame in canvas order;
- all explanatory text without visual-only ordering assumptions;
- descriptions for every raster image;
- explicit labels for example, boundary, warning, and inspection content;
- actionable links where a URL exists;
- code and command formatting that survives copy/paste.

The local harness gives its main menu trigger and status regions accessible
names, exposes loading and error messages through appropriate live semantics,
and preserves visible keyboard focus. Automated checks verify keyboard-only
reachability of the harness controls and the complete outline structure.

## Errors, edge cases, and recovery

Preflight validation rejects, before browser launch:

- malformed or missing JSON;
- missing or invalid image assets;
- image specifications without descriptions;
- unsupported image types or dimensions;
- headings, explanations, callouts, labels, or inspect strings beyond their
  documented budgets;
- missing semantic relations for relationship-dependent layouts;
- frame compositions that violate the structured/canvas budget.

Failure output includes the stage, path, concise reason, and recovery action.
It does not echo arbitrarily large input strings or leave partial deliverables.

Direct lower-level commands remain available for maintainers, but share the
same parsing, validation, and diagnostic helpers as `build-deck`.

## Performance and artifact budgets

Performance work is accepted only with production-mirroring measurements. On
the current reference machine and 14-frame Claude deck, guardrails are:

- setup no-op: at most 0.25 seconds;
- audit: at most 0.05 seconds;
- base generation: at most 1.0 second and 600 MB maximum RSS;
- 13-band composition: at most 2.2 seconds and 850 MB maximum RSS;
- full build: at most 3.5 seconds and 850 MB maximum RSS;
- offline probes: at most 9 seconds total;
- composed output: below 40 MB unless an intentional format change is
  documented.

The implementation may reduce duplicate browser startup or raster embedding
only when measurements show an improvement without weakening deterministic
rendering, geometry validation, or output fidelity.

## Example migration

Three decks prove the product:

1. `claude-code-artifacts` proves mixed media, semantic canvas composition,
   dark/light restraint, command typography, and editor parity.
2. `llm-token-flow` is migrated from eight repeated structured bands to a
   concept-first sequence with canvas compositions and a small number of
   thesis-specific raster illustrations.
3. `rag-vector-graph` is migrated from fifteen repeated structured bands and
   recycled backgrounds to relationship-specific frames that distinguish RAG,
   vector search, graph traversal, hybrid retrieval, and decision boundaries.

All three must pass audit, build, editor-harness inspection, outline checks,
and batched visual review. Generated outputs are evidence, not substitutes for
source specifications.

## Verification and acceptance

The work is accepted only when current evidence proves all of the following:

1. Unit and integration tests use Node's built-in test runner and demonstrate
   red-green coverage for new validation, diagnostics, staging, outline, and
   harness behavior.
2. All three example specifications pass the presentation audit and complete
   the one-command build.
3. Every generated frame passes geometry, overlap, explicit membership, child
   ordering, image-reference, and image-readiness checks.
4. Browser screenshots at 1600x900 and 1280x800 show no clipped text, missing
   images, overlapping controls, or unreadable effective body text.
5. Keyboard traversal reaches every harness control in logical order, focus is
   visible, controls have accessible names, and the outline contains the full
   ordered learning content.
6. The live-viewer parity probe passes against the identified current live
   build with zero behavioral mismatches; the pin is changed only after that
   behavioral run is green.
7. Invalid JSON, missing files, missing descriptions, oversized content, and
   composition failures produce concise diagnostics and preserve the previous
   successful output.
8. Performance and artifact-size guardrails pass on fresh measured runs.
9. Impeccable's detector reports no unresolved defects in changed UI targets,
   and two batched visual-review rounds find no P0/P1 issue.
10. Each implementation task receives a worker review for specification and
    task quality. A separate adversarial Codex review follows every approval;
    unresolved important findings return to the original worker until both
    reviewers reconcile.
11. A final whole-product adversarial review exercises the complete authoring,
    build, editor, outline, error, accessibility, and recovery paths.

## Non-goals

- A standalone Beautidraw editor, slideshow runtime, or hosted viewer.
- Decorative animation or motion added only to signal polish.
- A new general-purpose component library.
- Replacing Excalidraw's native toolbar or interaction model.
- Optimizing unmeasured code paths.
- Retaining legacy image-post-processing solely for compatibility with
  examples that are migrated in this work.
