# 11 — The metric oracle spike

Type: task
Status: resolved — **oracle state `passed`**
Blocked by: —
Parent: ../map.md

## Question

Prove the geometry foundation before any of it is allowed to gate. Identified as the single largest risk in `../../../PLAN.md` §11, and the prerequisite for every geometric assertion in §8.

Deliverables:

- **Pinned versions, locked**: `@excalidraw/excalidraw@0.18.1`, a pinned Playwright release and its Chromium revision, the shipped font set. Lockfile and bundle manifest committed.
- **A local offline bundle** — no CDN import at render time. The existing skill's renderer is broken today for exactly that reason (esm.sh 404 on a transitive dependency); jsdelivr worked as a stopgap but is still a network dependency.
- **Font readiness before measurement**: `document.fonts.ready`, per-face `document.fonts.check`, fingerprint recorded.
- **A two-frame fixture** proving frame selection, clipping, `frameId` association and child-before-frame ordering under `exportingFrame`.
- **The metric oracle itself** — route 1 (vendored adapter over the pinned build's bound-text layout) with route 2 (`setCustomTextMetricsProvider`) as its width backend, verified against fixtures whose ground truth is Excalidraw's own rendering, including a multi-line bound-text case containing a blank line.
- **Viewer parity**: open a generated file in the pinned viewer and confirm the rendered geometry matches what layout computed. Without this the pipeline can agree with itself and disagree with excalidraw.com.
- **Measured per-frame render time**, so the retry budget is grounded rather than guessed.

If route 1 cannot be made to work, the deterministic-layout premise collapses back to LLM placement plus visual iteration. Because Tier 2 is fail-closed, that surfaces as a blocked build rather than as silently unvalidated output — but it would mean rewriting the plan, so this ticket runs first.

## Answer

**Oracle state: `passed`.** Full findings in `../research/11-spike-findings.md`; probes in
`../../../scripts/spike/probe-0{1..8}-*.mjs` (`pnpm spike:network`); `PLAN.md` §2, §4, §7, §11 and the risk list
amended by measurement.

Every deliverable landed, and the headline is that **the largest risk was imaginary**:
`convertToExcalidrawElements` is a *public* export that performs real bound-text layout, so
route 1 vendors nothing non-public and route 2 (`setCustomTextMetricsProvider`) is not needed
at all. **Viewer parity is exact** — 100/100 font measurements identical between the pinned
bundle and live excalidraw.com (build `1acf66e`), spanning Latin, LATIN_EXT, Cyrillic and
Vietnamese, and a generated scene round-tripped through the viewer with zero delta on
bound-text width, height, wrap points, `frameId` and `containerId`.

Four plan assumptions were falsified, all of which would have shipped as silent geometry
errors:

1. `document.fonts.ready` is not sufficient — faces load lazily as unicode-range subsets, and
   measuring early gives every family one shared fallback, which changes **wrap points**, not
   just widths. The explicit `document.fonts.load` loop is part of the oracle. A later
   consistency sweep showed the obvious fix was *still* wrong: `document.fonts.check(font)`
   without a text argument passes vacuously (measured — Cyrillic reads **13.34% narrow** in
   that window), so both the load and the check must be driven by the deck's own characters.
2. `lineHeight` is derived from `fontFamily` (Cascadia 1.2, Excalifont 1.25, Nunito 1.35,
   Lilita One 1.15, Comic Shanns 1.25), not declared per role as §2 had it.
3. Per-frame export applies **neither `exportPadding` nor a frame-label band** — it is exactly
   `frame.width × frame.height`. `BAND_HEIGHT_CAP` rises 1170 → 1211 and the ramp floor gains
   headroom (12.63 css px vs the predicted 12.52). Separately, `exportPadding` is a *top-level*
   option; passed inside `appState` it is silently ignored.
4. Child-before-frame array ordering is **not** load-bearing — research 02 was wrong. Both
   orderings export equivalently and excalidraw.com preserves both with identical geometry.
   The contiguity fixture stays as convention, not correctness.

Degenerate bound-text cases all behave, with `height = lineCount × fontSize × lineHeight`
holding exactly: blank lines, leading/trailing newlines and consecutive blanks are preserved
as real lines; tabs are normalised to 8 spaces in **both** `text` and `originalText`. One trap
for `deck-spec.json` validation: **an empty label string produces no text element at all** —
the converter returns the container alone, so an empty label must be rejected at the schema.

Measured per-frame render ≈ 10 ms after warm-up (49.7 ms first call, 9.4 ms thereafter; whole
scene 11 ms), so the §8 retry budget is not render-bound.

Pinned manifest (`scripts/vendor/manifest.json`): `@excalidraw/excalidraw@0.18.1`, React
19.2.0, esbuild 0.25.10, Playwright 1.56.1, HeadlessChrome/141.0.7390.37, bundle sha256
`460ccb91503dd5a3d3587444eff767d24dcfd08038f0b45466a9e475c56c320e` (13,506,288 bytes), built
offline — no CDN at render time.

Not part of this ticket: the **signed** oracle record and `oracle_hash` computation described
in `PLAN.md` §8. The spike establishes the verdict and every input to that hash; wiring the
signature and the state machine is build-out.
