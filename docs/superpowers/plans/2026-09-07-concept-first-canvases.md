# Concept-first canvas polish

User direction: make generated Excalidraw beautiful and readable, use distinct visual components, and eliminate excessive sparse boxes and tiny content.

## Direction

Preserve the tactile illustrations and editable Excalidraw output. Replace universal filled node containers with open typography, meaningful marks, measured explanations and relationship geometry. Each frame should teach one argument at normal frame zoom. Image panels, comparative columns, connected maps, timelines, fields and boundaries must look and read differently because they express different relationships.

## Work

1. Capture fresh baseline LLM and RAG renders from `52af5b6`; ignore stale `decks/*/out` evidence.
2. Improve shared semantic composition: separate node labels from notes, remove flattened labeled shapes and detached tiny footers, add meaningful connectors for maps, distinct field/boundary/journey layouts, improve text hierarchy and useful visual density. Preserve validation, semantic kinds, image metadata and accessible outline.
   Add optional native token-sequence, lookup, and distribution views with explicitly illustrative data, strict validation, editable marks and complete outline text. Author these in the LLM exemplar; retain all existing raster illustrations. Correct the commands map to show all six stated moments.
3. Inspect every fresh exemplar frame in batched sheets plus full-size representative frames; exercise real editor navigation at 1600x900 and 1280x800. Fix visual defects and verify affected tests and offline probes.
4. Assigned reviewer checks the actual results; separate adversarial reviewer follows only after approval. Resolve substantive findings before delivery.

## Acceptance

- No universal ellipse/diamond/card wrapper for prose; shapes represent objects, boundaries, data or relationships.
- Content and relationships lead; readable explanations sit beside their visual referent, with no tiny detached paragraph used as the main teaching content.
- Multiple composition families have visibly different topology and rhythm.
- No lost authored content, clipped labels, broken images, unreadable contrast or disconnected system maps.
- Fresh actual editor fidelity is checked at both target viewports; current tests protecting semantics and artifact integrity remain meaningful and pass.
- Deliver fresh generated Excalidraw files and PNG previews, with paths and honest review results.

## Review progress

- Structured comparison/checklist worker: assigned reviewer approved; adversarial review found single-item edge coverage and unequal-list vertical alignment. Both fixed with actual-generation regressions; assigned reviewer and adversarial reviewer approved the corrected result (2/2 focused tests).
- Native data views: assigned/adversarial reviews found whitespace loss, normalization duplicates, minimum-viewport overflow, display precision and unsupported placement. All corrected; assigned and final adversarial reviewers approved (50 focused tests, 8 dedicated tests, exact allocated-viewport conversion assertions).
- Shared composition renderer: initial 117-test suite passed, but assigned visual review rejected threshold/spotlight/constellation text crossings, disconnected focus marks, duplicate sequence marks, dropped data-mode teaching content, and small main text. All are required repairs. Independent converter diagnosis also proved nonzero-first-point arrow distortion; the conversion layer now canonicalizes linear origins with browser regressions.
- Commands integration exposed a long-checklist budget regression. A converter-measured compact fallback preserves all 31 reference entries without shrinking below the incumbent 23px or bypassing validation; both assigned and adversarial reviewers approved the final structured change (3/3 generation-backed tests, including the 19-frame catalog).
- Live editor QA at 1280x800 reproduced the navigation strip intercepting native Zoom in clicks. A bounded horizontal navigation strip now sits above native controls; assigned and adversarial reviewers approved real pointer zoom, all 19 frame links, keyboard traversal and fidelity at 1280x800/1600x900.
- Final renderer takeover resolved label/marker adjacency and complete larger editorial copy on short frames. All four final examples were regenerated together.
- Short teaching comparison/checklist text now uses local 30px body and 36px headings; the dense reference fallback retains 23px. Global typography tokens and other structured patterns remain unchanged. Assigned and adversarial reviewers approved geometry, exact font coverage and the final typography.
- Combined controller verification passed 121/121 tests and all 9 offline probes; detector returned no findings. After the final map rail adjustment, all four decks were rebuilt and map-specific checks passed at both viewports.
- Final adversarial review found and reconciled silent slicing of over-cap arrays, ignored threshold headings and missing callout/data-illustration copy. Capacity preflight and family-aware visible-text coverage now protect these contracts.
- Final direct UI check found navigation panned without refitting after a manual zoom. Buttons now use the existing chrome-aware fit routine; zoom-then-pointer/keyboard navigation tests and both final reviews passed.

## Final outcome

All assigned and independent adversarial reviews are APPROVED. The controller's final combined test run passed 125/125 with no skips or failures. Fresh builds contain 56 frames across the four examples and passed local Excalidraw checks at 1600x900 and 1280x800. Automatic capacity guards fail before browser work; manual composition remains compatible. Authored visible-text coverage follows the documented family contracts, with complete accessible outlines for fallback/planning metadata. Field and matrix axes stop before editorial prose; map rails meet their hubs; pointer and keyboard frame navigation refit after zoom.

Evidence is retained in `.scratch/concept-first/final/` and the reports under `.scratch/concept-first/`. Network viewer parity was not rerun in this visual-polish pass; validation used the pinned local Excalidraw runtime.
