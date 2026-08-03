# Plan: beautidraw — a generator for sectioned Excalidraw lesson canvases
_Round 15 — **APPROVED by Codex.** First approved at round 8, reopened when the §11 spike ran and falsified four of its assumptions. Typography tradeoffs #4 and #5 signed off by the author 2026-08-02. Spike **passed** 2026-08-02; §2, §4, §7, §8, §9, §11 and the risk list amended by measurement. Argument transcript: `PLAN-REVIEW-LOG.md`._

## Goal

Build a Claude Code plugin at `~/Dev/beautidraw` whose skills turn a markdown document or a topic string into a single `.excalidraw` file: one continuous canvas, stacked labelled section bands running top to bottom, each band wrapped in a numbered `frame`, opened and panned by hand in excalidraw.com. No slideshow, no export, no presenter mode.

The reference artifact is `examples/reference/al-1.excalidraw` — a real lesson poster the author hand-built (scene bbox 2705 × 1695; the 2725 × 1715 figure quoted elsewhere is the padded SVG export size). Its author's verdict: *representative of the format, but it needs improving.* A five-lens adversarially-verified critique produced **35 confirmed defects**, and this plan exists to make each one structurally impossible rather than merely discouraged.

## Context that constrains the design

Settled (wayfinder map, `docs/design-notes/map.md`): standalone self-contained plugin repo; clean-room visual system; two entry points; mandatory self-validation; progressive disclosure; imagery from both vector primitives and a shipped asset catalogue.

*(Amended at packaging, 2026-08-03: **the shipped asset catalogue was not built.** Tickets 07/08 never resolved, there is no `assets/` tree, and the layout engine has no image element path — `generate.mjs` writes `files: null`. Imagery is vector primitives only. `skills/beautidraw/references/blackboard-images.md` defines an illustration **style** contract whose assets ship beside the deck rather than inside it; its embedding steps are marked as design for an unbuilt feature. "Self-contained" also narrowed: the 27 MB vendor bundle and Chromium are provisioned by `scripts/setup.mjs`, not committed. See §12.)*

Verified format facts (research 02/03/04, amended by the §11 spike): a `frame` adds only `name`; membership is an explicit `frameId`, never geometry; frames do not nest; `exportToSvg`/`exportToCanvas`/`exportToBlob` accept `exportingFrame`; those functions need a DOM; `image` keys into `files` by SHA-1 of raw bytes; ceilings are 4 MiB per file for collab sync and a silent ~5–10 MB localStorage quota. The existing skill's renderer is currently broken — its `esm.sh` import 404s on a transitive dependency. *(Research 02's claim that children must appear immediately before their frame or clipping breaks was **falsified** by spike F6.4 — see §7.)*

## The root cause the critique exposed

Nearly every defect traces to **hand-authored coordinates and text widths**. Implied em-per-character in the reference ranges 0.42 to 1.11 against any single true value. Once a generator cannot predict how wide a string renders, it sizes the box first and shrinks the type until it fits — which manufactured the nine-value ramp, the clipped evidence panel, the 10-unit annotation overlap, and the header centred 378 units off axis.

Central decision: **the LLM writes a semantic spec; a deterministic layout engine computes every coordinate.** The model never types an `x`.

## Approach

### 1. Pipeline

```
source (markdown | topic)
   └─> [A: content]  LLM            → deck-spec.json   (semantic; zero geometry)
        └─> [B: layout] JS in browser → .excalidraw     (all geometry; zero judgement)
             └─> [C: validate] lint + rendered eyes    → pass, or bounded retry
```

**Stage A — content.** The LLM emits `deck-spec.json`: title, subtitle, footer, and ordered bands. Each band carries a heading, a one-line deck, and a body described by a **pattern** plus typed content — never coordinates. Closed pattern vocabulary: `timeline`, `flow`, `row-of-stages`, `comparison`, `tree`, `checklist`. *(`checklist` replaced the planned `annotated-figure` during the build: dense question/answer enumerations turned out to be the recurring shape, and `annotated-figure` needs the asset catalogue that tickets 07/08 have not resolved. `references/patterns.md` is written from the code.)*

**Stage B — layout, in the browser.** Excalidraw measures text with the browser's `measureText`, normalises tabs, and soft-wraps bound text itself; no `chars × constant` model reproduces that. Since a browser is mandatory for rendering anyway, layout runs in the same Playwright page.

**The metric oracle.** *(Codex round 2: the public entry point exposes export helpers and `setCustomTextMetricsProvider`, not `measureText`/`wrapText`. Round 3 then checked each candidate route in the sources and found they are not interchangeable fallbacks — so they are now ranked by role, not by preference.)*

**Resolved empirically — the spike passed.** Findings in `docs/design-notes/research/11-spike-findings.md`; the three-route ranking below is superseded by measurement.

| Route | Status after the spike | Why |
|---|---|---|
| **1. `convertToExcalidrawElements`** | **the implementation** | a *public* export that performs real bound-text layout: soft-wrapping, container-relative placement, container-derived height, `containerId`/`boundElements` cross-linking. **No vendoring of internals is required** — the round-3 assumption that it was has been falsified against 0.18.1 |
| **2. `setCustomTextMetricsProvider`** | **not used** | the library already uses the browser's native Canvas metrics, and §11 proved those are byte-identical to the live viewer's. Injecting a provider could only introduce the divergence it was meant to avoid |
| **3. Measure-by-render** | **diagnostics only** | export renders current element state rather than discovering logical soft wraps; raster extents cannot recover stored text boxes or line breaks |

**The oracle is the adapter *and* the font fingerprint, jointly** — and the font term is the fragile one. `document.fonts.ready` is **not** sufficient: Excalidraw registers unicode-range subsets that load lazily, and measuring before an explicit `document.fonts.load` yields one shared fallback face for every family — which changes *wrap points*, not merely widths. Font loading is a correctness gate, never setup boilerplate.

**The load must be driven by the deck's own characters, not by a sample string.** *(This is a second-order version of the same bug: a per-(family, size) load with a fixed sample fetches only the subsets that sample happens to touch, and `document.fonts.check(font)` with no text argument probes a default string — so the gate returns true while a label containing a glyph from an unfetched subset is silently measured against the fallback face.)* Verified against the pinned build: `dist/prod/fonts/Nunito` ships five subsets registered as `[CYRILLIC_EXT, CYRILLIC, VIETNAMESE, LATIN_EXT, LATIN]`, and Excalidraw's own loader is character-driven — `loadSceneFonts` calls `getCharsPerFamily(elements)` over each element's `originalText` and gates every face on a unicode-range test. The generator mirrors that:

```js
// Key on a serialised tuple. `charsFor[family, size]` would apply the comma
// operator and silently key by size alone.
const charsFor = new Map();                       // JSON.stringify([family, size]) -> string
for (const [family, size] of metricTuple) {
  const key = JSON.stringify([family, size]);
  charsFor.set(key, unionOfCharsLaidOutAt(family, size));
  await document.fonts.load(`${size}px "${family}"`, charsFor.get(key));
}
await document.fonts.ready;
for (const [family, size] of metricTuple) {
  const chars = charsFor.get(JSON.stringify([family, size]));
  assert(document.fonts.check(`${size}px "${family}"`, chars));
}
```

The text argument is **mandatory on both calls** — `check` without it probes the spec default and passes vacuously. A failed `check` **aborts the run**.

**Two font records, deliberately separate** *(Codex round 10 major: the first version of this fix put the deck's measured repertoire into the oracle fingerprint, which §8 hashes into a fixture-derived **signed** record. A per-deck value cannot live inside a fixed signature — the first deck using an extended glyph would either find no matching `passed` record or violate the stated hash binding. That was a flaw introduced by the previous fix, not by the original plan.)*

| Record | Scope | In `oracle_hash`? |
|---|---|---|
| **oracle font fingerprint** | measurements over the **fixture corpus** repertoire, fixed when the oracle is signed | **yes** — it attests the runtime measures as expected |
| **per-deck loaded repertoire** | the characters *this* deck loaded and checked | **no** — diagnostics only, written beside the output |

The per-deck value is gated at **run** level (the `check` assertion above), never at oracle level. Changing decks therefore cannot invalidate the oracle, and adding a glyph cannot silently pass.

**Scope, measured rather than argued** (probe 8). After loading Latin only for Nunito, the bare `check` returns `true` in all three cases below — but it is only *vacuous* where the honest form disagrees with it, which is Cyrillic and Vietnamese. For `LATIN_EXT` both forms agree and the measurement is already correct:

| Repertoire | bare `check` | `check(font, text)` | width error in that window |
|---|---|---|---|
| Cyrillic | `true` | `false` | **13.34%** |
| Vietnamese | `true` | `false` | 0.73% |
| `LATIN_EXT` | `true` | `true` | 0% |

So the exposure is **narrower than first argued**: `LATIN_EXT` rides along with `LATIN` and is safe, and ordinary Western-European text — `é ö ñ ç`, em/en dashes, curly quotes, `…`, `€`, `™` — is unaffected. The real case is a Cyrillic or Vietnamese label, which §9 does not exclude and Stage A can emit, measuring against the fallback face while every other assertion reports success. 13.34% is far past any wrap boundary. *(`→` `U+2192` is not a counter-example: it is in no Nunito subset at all, so it falls back identically here and in the viewer and does not diverge.)*

**The pipeline must not diverge from the viewer.** *(Codex round 3: a pipeline that validates itself agrees with itself and disagrees with excalidraw.com.)* Measured: 100/100 font measurements identical across Latin, LATIN_EXT, Cyrillic and Vietnamese between the pinned bundle and live excalidraw.com, and a generated scene round-tripped through the viewer with zero delta on bound-text width, height, wrap points, `frameId` and `containerId`.

**`target viewer version` is a pinned declared constant, not an observed one** — and therefore **build-time verification cannot detect live viewer drift**. *(A round-9 amendment claimed drift "surfaces as a blocked build"; that was false. As a constant, excalidraw.com can move and the recomputed hash still matches; as an observed value, every build would have to fetch excalidraw.com, breaking the offline-bundle requirement in §11 and making the gate network-flaky. The plan had not said which, so it silently claimed both.)* Resolved: the constant records **which viewer builds parity was verified against**, the build stays hermetic, and drift is caught by **re-running the parity probe** (`pnpm spike:network`) — a maintenance action on a schedule, not a per-build gate. Bumping the constant without re-running the probe is the one move that defeats this, so the constant and the probe's recorded viewer build are asserted equal at verification time.

**Stage C — validate.** Structural lint plus visual inspection, under a bounded retry budget.

### 2. Three distinct text geometries

The reference proves they differ: `ev_sft_t` is stored 240 × 55 inside a 260 × 75 container.

| Quantity | Meaning | Applies to |
|---|---|---|
| **natural** | the string measured with no wrapping | **unbound text**: title, subtitle, footer, free labels, annotations |
| **wrapped** | geometry after soft-wrapping to a given max width | **bound text only** |
| **container** | the shape's own `width`/`height` | shapes holding bound text |

The circularity is broken by ordering: **each pattern declares its wrap width budget before any measurement**, derived from `PAGE_WIDTH` and a **text-independent column count** — a function of the spec's node count and the pattern's declared layout table, never of how wide the text turned out to be.

**The candidate search is fully specified** *(Codex round 4: a finite candidate set bounds the search but does not determine it — order, tie-breaking, acceptance and the relayout limit were all unstated)*:

- Each pattern declares an **ordered** candidate list of column counts, e.g. `flow: [1, 2, 3]`, computed once from the node count. The order is the pattern's, not the content's.
- **Candidate widths are immutable.** Column count *k* fixes `wrapWidth(k) = (PAGE_WIDTH − (k−1)·GUTTER_COL) / k` before any string is measured. Only **height** is derived after wrapping.
- Selection is **first-fit in declared order, evaluated as one finite pass**: try every candidate in order and take the first whose laid-out band satisfies the height cap and the edge-coverage rule. No scoring, no tie-breaks. *(Codex round 5: "one advance per layout pass" plus "one bounded relayout" left it undefined whether candidate 3 was ever reached. The whole ordered list is now a single pass, so it always is.)* Exhausting the list fails the build, naming the pattern, the node count and every candidate tried with its failure reason.
- Candidate **budgets** are text-independent; candidate **selection** is not. *(Codex round 5, correctly: first-fit reads measured text to decide which candidate fits.)* What matters for the circularity is that no candidate's width is ever derived from the text it will hold — the selection reads measurement, the budgets never do.

**Bound text lives only in rectangles.** *(Codex round 3: Excalidraw's bound-text max width is shape-specific — ellipses, diamonds and arrows do not use `container.width − 2·padding`.)* Rather than implement three more shape formulas, the generator binds text only to rectangles; ellipses and diamonds carry unbound labels positioned by layout. This costs nothing — in the reference, ellipses are timeline dots with no text and diamonds are unused — and removes a whole class of measurement error.

**Wrapping is permitted only for rectangle-bound labels.** All unbound text is measured at its natural width. *(Codex round 4: §3's "wrap a long label" relayout directly contradicted "unbound text is never wrapped" — resolved in favour of the stricter rule.)*

**Every text role has an overflow contract**, and the contract depends on whether the role sits at the ramp floor *(Codex round 4: "step down exactly one ramp size" is impossible for footer and annotation, which already are the floor)*:

Every role a pattern can emit is declared in a **role table** with four mandatory columns — container kind, size, width-budget source, overflow behaviour. **A role not present in the table is a build failure, not a default.** *(Codex round 5: the round-4 table omitted `body` and free labels, left `annotation/evidence` boundness unresolved, and its `hero node` row contradicted the rectangles-only binding rule. The completeness mechanism matters more than any list I write here, because patterns will be added later.)*

**`containerId` (text binding) and `frameId` (frame membership) are independent axes** and the tables below vary only the first *(Codex round 6: grouping band headings under "page chrome" implied they were unframed, when in fact they are framed band content that merely has no text container)*.

Fixed roles, pattern-independent:

| Role | Size | `containerId` | `frameId` | Width budget | On overflow |
|---|---|---|---|---|---|
| title | 48 | none | none | `PAGE_WIDTH − 2·MARGIN` | step to 38, once; then fail |
| subtitle | 23 | none | none | `PAGE_WIDTH − 2·MARGIN` | fail |
| footer | 18 | none | none | `PAGE_WIDTH − 2·MARGIN` | fail — already at the ramp floor |
| band-heading | 38 | none | **its band** | `PAGE_WIDTH − 2·MARGIN` | step to 30, once; then fail |
| deck line | 23 | none | **its band** | `PAGE_WIDTH − 2·MARGIN` | fail |

Pattern body roles, all framed, with the generic rule each pattern's role table must instantiate:

| Role | Size | `containerId` | Width budget | On overflow |
|---|---|---|---|---|
| hero node | 30 | **rectangle** | `wrapWidth(k)` | wrap → next candidate → fail |
| node label | 23 | **rectangle** | `wrapWidth(k)` | wrap → next candidate → fail |
| evidence line | 18 | **rectangle** | `wrapWidth(k)` | wrap → next candidate → fail |
| free label (ellipse/diamond/axis marker) | 23 or 18 | none | pattern's declared `labelBudget` | fail — unbound text never wraps |
| annotation | 18 | none | pattern's declared `annotationBudget` | fail — already at the ramp floor |

*(Every bound role is rectangle-bound, consistent with §2. Ellipses and diamonds carry unbound free labels, which is why `free label` fails rather than wrapping.)*

Failure names the element, its role, its measured width and its budget. No silent shrink, no drift off the page. `BOUND_TEXT_PADDING = 5` per side.

**Height derivation, verified exactly by the spike across seven cases** including blank lines, leading and trailing newlines, consecutive blanks, and tabs:

```
textHeight(el)      = lineCount × fontSize × lineHeight(fontFamily)
containerHeight(el) = max(declaredHeight, textHeight + 2·BOUND_TEXT_PADDING)
```

`lineCount` counts **wrapped** lines and blank lines alike — a blank line is a real line and occupies full height. `lineHeight` comes from the family, so a `prose` row is 12.5% taller per line than the reference's monospace (1.35 vs 1.2); every row-height computation reads the observed value rather than a literal. Tabs are normalised to 8 spaces in **both** `text` and `originalText`.

The deck line's **75-character cap is an input constraint on the spec, not a pixel guarantee** *(Codex round 5)*. The measured-width failure rule is what actually protects the layout; the character cap only keeps the LLM from authoring something that will predictably fail.

**The metric tuple is pinned per role**, not just the font stack *(Codex round 4: `fontFamily`, `lineHeight`, `autoResize` and wrapping settings are all part of Excalidraw's text geometry model and were unspecified)*. Constants declare, for every role: `fontFamily`, `fontSize`, `textAlign`, `verticalAlign`, `autoResize`, and whether the role wraps. The complete tuple goes into the oracle fixtures and into the recorded fingerprint, so a metric drift can be attributed to a specific field rather than guessed at.

**`lineHeight` is read from the library, never declared** *(spike F4: it is derived from `fontFamily`, not chosen — Cascadia 1.2, Excalifont 1.25, Nunito 1.35, Lilita One 1.15, Comic Shanns 1.25)*. Declaring a different value would diverge from what Excalidraw does by default, and therefore from the viewer. It is recorded in the fingerprint as an observed value.

Every role's `fontFamily` is `prose` unless the role's content is code, per the signed-off font-role rule in *Key decisions* #5. Resolved against the pinned build in §11: **`prose` = Nunito (6)**, **`mono` = Cascadia (3)** — the reference's existing face, so code keeps its look. Nunito is **16.8% narrower** than Cascadia per line (equivalently, Cascadia is 20.2% *wider*: 703.13 vs 585.02 at 20px) and 12.5% taller (`lineHeight` 1.35 vs 1.2). On an **equal-line comparison** — same line count, same content — that is `0.832 × 1.125 = 0.936`, about 6.4% less area. *(Codex round 10 nit: this is not a guaranteed per-block area ratio. Narrower lines can change where text wraps, and a line count that drops or rises swamps a 6.4% term.)* Favourable, but far less than the 20% the width figure alone suggests. Band-height budgeting uses 1.35.

### 3. Page rectangle — explicit, not inferred

*(Revised twice. Round 0 shrank `PAGE_WIDTH` after layout, which was circular. Round 1 fixed the width but still centred chrome on the union bbox — Codex round 2: asymmetric content then recreates the original header drift.)*

The page is an explicit rectangle: **`PAGE_X = 0`, `PAGE_WIDTH = 2280`**. Chrome centres on `PAGE_X + PAGE_WIDTH/2 = 1140`, never on the union of what happened to be drawn.

Bands are asserted against **both** edges with an absolute tolerance, not a percentage of a coordinate: **`ε = 0.08 × PAGE_WIDTH = 182.4`**, requiring `|left − PAGE_X| ≤ ε` **and** `|right − (PAGE_X + PAGE_WIDTH)| ≤ ε`. *(Codex round 3: "within 8% of `PAGE_X`" is meaningless when `PAGE_X = 0`, and a one-sided check let a band be 16% narrow.)* The **probe set** for a band's content bbox is its framed body elements plus its heading and deck line; frames, dividers, backgrounds and decorative elements are excluded, so a full-width divider cannot mask an under-filled band.

Ordered passes: measure → lay out each band to `PAGE_WIDTH` → stack with the gutter system → place chrome on the page axis → emit frames → lint. A band that overflows is resolved **inside** the §2 finite candidate pass — try every declared column count in order, take the first that fits. There is no second relayout step and no second width or column derivation. Only rectangle-bound labels may wrap; unbound text never does. Exhausting the candidate list **fails the build**. No global resize. The only geometry change that happens *after* linting is a §8 repair operator, and those are bounded, enumerated and monotonic.

### 4. Type ramp, page width and legibility — solved jointly

*(Codex round 1 proved the round-0 numbers self-contradictory: `22/18 = 1.222` broke the plan's own ≥1.25 rule, and `1600/2700 = 0.59` made 14-unit text render at 8.3 px against the plan's own ≥12 gate.)*

- **Ramp: 48 / 38 / 30 / 23 / 18.** Ratios 1.263, 1.267, 1.304, 1.278 — all clear 1.25.
- **`PAGE_WIDTH = 2280`**, **`BAND_HEIGHT_CAP = 1211`**.

**Exact zoom equations.** *(Codex round 4: the previous figures were nominal and not reproducible — export padding, the frame label band, and the relationship between the height cap and the inflated frame bounds were all hand-waved. The spike then measured all three and falsified two.)* Constants: `USABLE_W = 1600`, `USABLE_H = 850`, `EXPORT_PAD = 10`, `FRAME_LABEL_BAND = 20.5`.

**`USABLE_W` / `USABLE_H` provenance** — never written down before, and load-bearing for the cap below. They are the **raw** usable viewport a maximised browser gives Excalidraw's canvas: 1600 wide, and 850 = 900 viewport height less ~50 of editor chrome. They were set in round 1 against *bare* frame dimensions (`1600/2280`, `850/1200`) and are **not** net of export padding or any label band — the inflation terms did not exist until round 4. Since the spike proves per-frame export is exactly the bare frame box, the model returns to the round-1 one and the two constants apply unchanged. There is no double-count.

```
framedW(band) = frame.width         // per-frame export is EXACTLY the frame box
framedH(band) = frame.height        // no padding, no label — measured, spike F6
z_actual(band) = min(USABLE_W / framedW, USABLE_H / framedH)

sceneHeight    = renderedBounds().height        // renderer-inclusive, see below
z_scene = min(USABLE_W / (PAGE_WIDTH + 2·EXPORT_PAD),
              USABLE_H / (sceneHeight + 2·EXPORT_PAD))
```

**Measured facts behind those equations** (spike F6):

- `exportPadding` is a **top-level** `exportToSvg` option, not an `appState` field. Inside `appState` it is silently ignored and the default 10 applies — a live footgun, since the wrong call site still produces a plausible image.
- **Per-frame export ignores padding entirely** and is always exactly `frame.width × frame.height`, verified at padding 0, 10 and 40, at every frame-name length.
- **Per-frame export never draws the frame label.**
- **The frame label adds 20.5 height and 0 width to a whole-scene export**, constant across every padding value, and it truncates rather than widening when the name overflows the frame. A `name` of `null` still paints a default `"Frame"` label — there is no way to opt out, so the band is unconditional.

`renderedBounds()` is the **unpadded painted union** as the renderer reports it — every serialised element plus the actual painted extent of each native frame label, unioned once. *(Codex round 5: a serialised-element union understates the real height, because native frame labels are drawn by the renderer and never appear in the elements array. Codex round 6 then caught two errors in that fix: it defined `renderedBounds()` as already padded while `z_scene` adds `2·EXPORT_PAD` again — double-counting — and it **added** `FRAME_LABEL_BAND` per frame instead of unioning real extents, which overstates the union whenever labels sit inside an existing bbox.)*

So padding is applied exactly once, in the `z_scene` expression above, and label extents are unioned rather than summed. **The spike confirmed the union directly**: a two-frame scene measured 640.5 tall where summing per-frame label bands would have predicted 661 — only the topmost frame's label extends the union, because the lower frame's label falls inside the existing span. `FRAME_LABEL_BAND` is a whole-scene constant only; it no longer appears in `z_actual`.

Worked check with the constants above: a full-width band gives `framedW = 2280`, so `USABLE_W/framedW = 1600/2280 = 0.701754…`. Height binds only above `850 × 2280 / 1600 = 1211.25` **exactly** *(Codex round 9 nit: the earlier `1211.2` was a rounded value printed as though exact)*, so `BAND_HEIGHT_CAP = 1211` keeps **width binding** — `850/1211 = 0.701899… > 0.701754…`, the design intent — and the ramp floor lands at `18 × 0.701754 = 12.63` css px, clearing the ≥12 gate. *(The cap was 1170 while the plan assumed per-frame export inflated the frame by padding plus a label band. It does neither, so the cap rises and the legibility headroom grows.)*

**One zoom function, used everywhere** *(Codex round 4: `z_actual` was scoped to framed content while the contrast rule still wrote `fontSize × z_actual` for every element, chrome included)*:

```
z_effective(el) = el.frameId ? z_actual(frameOf(el)) : z_scene
```

Every legibility and contrast computation uses `z_effective`. Unframed chrome remains **exempt from the ≥12 legibility gate** — it is read at the establishing shot, which §4 declares is not a legibility target — but it is **not** exempt from contrast, which is evaluated at `z_scene`. *(Codex round 4 also killed the rationale I had offered: subtitle and footer are 23 and 18, not "the two largest ramp sizes" — the 38 band heading is framed content. The exemption stands on the establishing-shot argument alone.)*

Diagnostics record `z_actual` per band, `z_scene`, and the exact bounds each was computed from.

**Native frame labels are outside the ramp and outside the legibility contract.** *(Codex round 3, and it is right: a `frame` element carries only `name` — there is no font-size field — and Excalidraw draws the label at a fixed 14 units, which is ≈9.8 px at `z ≈ 0.702` and could never satisfy a ≥12 gate.)* The visible section title is the band's **heading text element** at ramp size 38. The frame's `name` is navigational metadata for the search menu, not typography.

**Role → size**: `48` title · `38` band-heading · `30` hero node · `23` node label / free label / subtitle / deck line · `18` annotation / evidence line / footer. *(Codex round 6: an earlier summary named a `body` role that appears in no table. There is no `body` role — it was loose shorthand for the registered roles above, and under the §2 completeness mechanism an unregistered role name is a build failure, so the shorthand had to go.)*

*(Revised — Codex: "exactly five sizes" made valid decks illegal, since a deck may contain no hero and no annotation, and subtitle/footer had no size at all.)* The rule is now: **every size used must come from the ramp, and at most five distinct sizes may appear.** Singletons are legal for roles that are singular by nature (title, subtitle, footer); a *content* role appearing once is a warning, not a failure. Size is assigned from role before geometry; containers are sized to the wrapped text afterwards. Siblings in one flow or row share one size. Emphasis jumps a full ramp step or it is not emphasis.

The whole-canvas zoom is explicitly **not** a legibility target — it is the establishing shot. Only the per-band fit-zoom is gated.

### 5. Palette, legend and contrast

A legend maps `role → approved shade set`; every non-neutral hex resolves to exactly one role. Neutrals (`#64748b`, `#1e293b`, `#ffffff`) are exempt. Chrome hues and content hues are disjoint sets.

Contrast is evaluated **at effective rendered size**: `effective_px = fontSize × z_effective`, then ≥ 4.5:1 below 24 effective px, ≥ 3:1 at or above. Text on a `transparent` fill is measured against the canvas background `#ffffff`. Stroke against its own fill requires ≥ 3:1.

### 6. Connector taxonomy

*(Round 1 replaced a blanket "every connector is a bound arrow" rule, which contradicted the reference's legitimate axis and divider lines. Round 2 fixed two further contradictions.)*

| Kind | Element | Rules |
|---|---|---|
| **semantic connector** | `arrow` | both bindings resolve to real ids, verified bidirectionally against `boundElements`; endpoint proximity validated **through the pinned library's own binding gap semantics**, not an independent threshold |
| **callout leader** | `line` | one endpoint within 4 units of its panel, the other within 4 units of its referent; obstacle testing **exempts the terminal zone at each end** |
| **axis / structural** | `line` | emitted *before* anything overlapping it, so nothing erases it |
| **divider** | `line` | spans exactly `PAGE_WIDTH` at a gutter midpoint |
| **decorative** | `line` | may not express a relationship; flagged if its endpoints touch two shapes |

*(Codex round 2: "endpoint within 2 units" contradicted Excalidraw's binding geometry, which uses a 5-unit base gap plus a stroke contribution — valid bound arrows would have failed. And a leader aimed at a text referent must, by definition, reach into that text's inflated bbox, so the generic obstacle test made the two rules jointly unsatisfiable.)*

### 7. Frame membership

A band's frame contains its heading, deck line and every body element, each carrying `frameId`. Title, subtitle, footer and dividers are **unframed** page chrome. Cross-band connectors are **forbidden** — frames do not nest and clipping is per-frame. Cross-band relationships are expressed by shared alignment on a common axis. Emission order per band: children, then the frame element, asserted by a generated fixture.

**Emit `boundElements: []`, never `null`.** *(Measured: excalidraw.com canonicalises `null` to `[]` on load. Both mean "nothing bound", so this is cosmetic — but emitting `null` makes every round-trip differ from what the viewer holds, which turns a byte-clean parity check into a merely semantic one and hides real drift behind an expected diff.)* Tier 1 asserts it.

**Contiguity is convention, not a correctness requirement** *(spike F6.4 falsified research 02's claim that clipping breaks without it: frames-first ordering produced an equivalent per-frame export, and excalidraw.com accepted **and preserved** both orderings with identical per-element geometry)*. Membership is `frameId` alone, on both surfaces tested. The fixture stays because it costs nothing and matches the format's convention — but the plan no longer claims clipping depends on it.

### 8. Validation — two tiers, and an explicit oracle state

*(Codex round 2 blocker: the linter was gating on metrics the spike had not validated. Codex round 3 blocker: the fix was **fail-open** — "Tier 2 gates once the oracle passes" reads as licence to ship on Tier 1 alone while the oracle is unproven, which would ship exactly the unvalidated geometry this project exists to eliminate.)*

The oracle has an explicit recorded state, and it decides delivery, not just enforcement:

| Oracle state | Tier 1 | Tier 2 | `.excalidraw` delivery |
|---|---|---|---|
| `passed`, hash-matched and current | enforced | enforced | allowed |
| `passed` but hash-stale | enforced | cannot run | **blocked** |
| `unproven` / `failed` / missing / malformed / unrecognised | enforced | cannot run | **blocked** |

*(Codex round 4: fail-closed on three named states left missing, malformed, unknown and stale records undefined — the most likely real-world cases.)* The oracle record is a signed JSON document binding its verdict to a hash over the **complete runtime manifest**:

```
oracle_hash = H( excalidraw bundle hash
               | route-1 adapter source hash      # our local public-API adapter
               | harness source hash              # the page layout+render run in
               | fixture corpus hash              # what "passed" was measured against
               | font fingerprint
               | playwright version
               | chromium revision
               | browser launch flags
               | device pixel ratio
               | platform / runtime image id
               | usable viewport constants
               | target viewer version
               | metric tuple )
```

*(Codex round 5: the round-4 hash covered bundle, fonts, viewer and metric tuple but not the browser itself. Round 6: it still omitted **our own** geometry code — the adapter, the harness, the fixtures it was validated against, and the platform — so an edit to the adapter could leave a valid-looking signature attached to different geometry. The hash now covers the complete layout/oracle artifact, not just its dependencies.)* Verification checks the signature against a pinned public key **and** recomputes `oracle_hash` from the live runtime. Any value other than a signature-valid, hash-matched, current `passed` blocks delivery; unrecognised states are treated as `failed`, never as permissive.

**Blocked delivery means no `.excalidraw` file is written. Diagnostics are still written** — per-band and whole-scene renders, linter output, the oracle record and the failure reason all land in the artifact directory, because a blocked run that explains nothing is useless. *(Codex round 4 minor: "no artifact is written" read as contradicting the diagnostics directory.)*

**Tier 1 — no metric dependency.** Schema validity; id uniqueness and derivation; element ordering; `frameId` presence; `boundElements` is an array, never `null` (§7); **child-before-frame contiguity — enforced as a project emission convention, not a correctness gate** *(Codex round 9 nit: the spike proved neither surface depends on it, so gating it as though clipping breaks without it would misrepresent why the check exists; it stays because a stable emission order keeps diffs and `geometry_hash` legible)*; **every role declared bound in the §2 role table resolved to an actual text element** (§9's empty-label trap); no cross-band connectors; binding references resolve bidirectionally; legend resolution and chrome/content hue disjointness; ramp membership and distinct-size count; payload under 3 MB; connector kind classification.

**Tier 2 — runs only in oracle state `passed`; its absence blocks delivery rather than waiving it.** Everything geometric: stored geometry matching the measured value; bound-text overflow; connector/text intersection; chrome centred on the page axis; band edge coverage; `fontSize × z_effective ≥ 12` for framed content; band height ≤ BAND_HEIGHT_CAP; peer rows sharing width/height/y from the row maximum; peer fill luminance ratio ≤ 1.4; contrast gates; axis-span ordering; timeline `year → x` monotonic mapping with per-interval units-per-year ratio ≤ 1.15 unless a break glyph is drawn.

Each Tier 2 assertion kills a specific confirmed defect: the clipped panel, the leaders struck through "2017" and "2026", the orphan `residual` line, the 378-unit header drift, the nine-size non-scale, white-on-`#60a5fa` at 2.54:1 *(recomputed: `#3b82f6` measures 3.68:1 — still a failure at 14 units, since `14 × z ≈ 9.8` effective px falls under the 24 px threshold where ≥4.5:1 applies, but the 2.54 figure belongs to `#60a5fa`)*, bands abandoning the page, the illegible timeline, stair-stepped panels, a stage visually outranking its peers, the box erasing 340 units of axis, spacing swinging from 11 to 100 units per year.

**Warnings, never gates** (composition taste, derived from one example): largest empty rectangle > 15% of scene bbox; band content aspect outside 1.2–4.0; a content role used exactly once.

**Visual validation** renders **both** every frame via `exportingFrame` **and** the whole scene — per-frame rendering cannot see unframed chrome, dividers, or global whitespace.

Its pass/fail contract is a **machine contract**, not a description *(Codex round 3 asked who decides; round 4 correctly objected that "structured verdict" with no schema is not implementable)*. The reviewing model reads each image against a written rubric and returns a versioned JSON document:

```jsonc
{
  "schema": "beautidraw.visual-verdict/1",
  "target": { "kind": "band" | "scene", "frameId": "…|null", "bandIndex": 0 },
  "verdict": "pass" | "defects",
  "defects": [{
    "class": "clipped-text" | "overlap" | "connector-crosses-text"
           | "ambiguous-anchor" | "unbalanced-whitespace"
           | "illegible" | "wrong-pattern" | "other",
    "elementIds": ["…"],          // may be empty for scene-level defects
    "evidence": "what is visibly wrong, in one sentence"
  }]
}
```

**Fail closed**: a missing, malformed, schema-invalid, or timed-out verdict is treated as `defects` with class `other`, never as a pass.

**Bounded retry with defined repair operators.** *(Codex round 4, the sharpest finding of the round: re-running a deterministic layout over an unchanged spec reproduces a byte-identical image, so an undefined "retry" either loops forever or silently lets the reviewer mutate the spec — which would break the reproducibility contract.)* Retry never touches `deck-spec.json`. It applies one enumerated **layout-parameter** operator, selected by defect class:

Each operator has a **finite ordered state list and advances monotonically** — a state is never revisited *(Codex round 5: bounded is not the same as progressing; `R3` had no variant set and `R1`/`R4` could mint a new hash without changing anything)*:

| Defect class | Operator | Ordered states |
|---|---|---|
| `clipped-text` | `R1` grow row | `[+1 line, +2 lines]` on the peer row's computed height |
| `overlap`, `unbalanced-whitespace` | `R2` next candidate | the pattern's remaining column candidates, in order |
| `connector-crosses-text`, `ambiguous-anchor` | `R3` reroute | `[orthogonal, side-routed, label-offset]` |
| `illegible` | `R4` widen gutters | `[G, 1.5·G, 2·G]` |
| `wrong-pattern`, `other` | **none** | escalate immediately — a content problem no relayout fixes |

Progress is guaranteed by four rules: defects are processed in a **deterministic order** (band index, then defect-class enum order, then first element id) and only the highest-priority defect is repaired per iteration; an operator whose states are exhausted escalates rather than looping; after each repair **Tier 2 re-runs**, and a repair that leaves the geometry hash unchanged is detected as a **no-op and escalates immediately**; and a repair that introduces a *new* Tier 2 violation is rolled back and escalates.

**At most 3 iterations.** A defect class with no operator escalates on first occurrence without consuming the budget.

**What reproducibility now claims** *(Codex round 5 caught a real contradiction: repair-operator selection depends on model judgement, so §10's "byte-reproducible from the spec" was false the moment any repair ran)*. The reproducibility input is the **triple** `(deck_spec_hash, layout_params_hash, repair_history)`, all three serialised beside the output. Given the same triple and the same pinned runtime, the output is byte-identical. Given only the spec, it is not — because the visual gate is a judgement, and pretending otherwise would be the kind of unverifiable claim this whole review exists to remove.

Every iteration writes per-band PNGs, the whole-scene PNG, the verdict documents, and structured diagnostics recording — per element — natural, wrapped and container dimensions, the chosen wrap width and column candidate, `z_effective`, plus `z_actual` per band, `z_scene`, both bounds sets, the two hashes, the pinned renderer version, the metric tuple, and **the loaded-font fingerprint**. On exhaustion, delivery is blocked and the artifacts plus the outstanding verdict go to a human.

### 9. `deck-spec.json`

A JSON Schema validated before layout. Bounded failure for every degenerate case: label longer than the pattern's wrap budget (wrap, then fail), more nodes than the pattern supports (reject, naming the limit), duplicate or non-monotonic timeline years (reject), cycles in a `flow` (reject), tree depth beyond the limit (reject), unknown pattern (reject). No silent truncation.

*(**As built, 2026-08-03: there is no JSON Schema file.** `generate.mjs` and `layout.mjs` validate the spec in hand-written code — unknown pattern, empty/whitespace label, node shape per pattern, and the column-candidate search that rejects content a pattern cannot fit. The behaviour above holds; only the mechanism differs. Recorded rather than quietly dropped: a schema is still the better home for it, because hand-written checks are the kind that drift out of step with the pattern vocabulary. The shipped vocabulary is the one in §1 — `checklist`, not `annotated-figure`.)*

**Empty and whitespace-only labels are rejected at the schema**, and they fail in two different ways *(spike F7)*: an **empty string** makes `convertToExcalidrawElements` return the container **alone** — no text element, no error — while a **whitespace-only** string does produce a text element, just an invisible one. The first is the worse bug: a role the §2 table declares must carry bound text silently carries none, the container renders as an empty box, and no structural assertion fires because nothing is malformed. Tier 1 therefore also asserts that **every role declared bound in the role table actually resolved to a text element**, so the defect cannot arrive by another path.

### 10. Determinism

**Byte-reproducibility is claimed from the triple `(deck_spec_hash, layout_params_hash, repair_history)` plus the pinned runtime — not from the spec alone.** See §8: the visual gate is a judgement, so any run that invoked a repair operator is reproducible only when its recorded repair history is replayed. A run that needed no repair *is* reproducible from the spec.

Each term has a canonical form *(Codex round 6: an unserialised "history" is not a reproducibility input)*:

`H` is **SHA-256 over RFC 8785 canonical JSON (JCS), UTF-8 encoded** — named explicitly so two implementations cannot disagree about what a hash means.

- **`repair_history`** — an ordered JSON array, one entry per applied repair:
  `{iteration, bandIndex, targetRef, defectClass, operator, fromState, toState}`.
  **`targetRef` is mandatory** *(Codex round 7: without it, two repairs sharing band, class, operator and states could target different peer rows — `R1` grows one specific row — so the history was not replayable)*. It is a path of **canonical spec ordinals** — the band's and the row's position *in `deck-spec.json`*, which is immutable for a given spec — never a position in the emitted elements array, which relayout reorders. Written `"spec:band/2/row/1"` and `"spec:band/2/connector/<spec-local-id>"` to make the origin unmistakable. *(Codex round 8 nit: the earlier `band[2].pattern.row[1]` notation read as a positional array index, which is precisely what the surrounding sentence rules out.)* Serialised with sorted keys, no timestamps. Replaying the history applies the same operators to the same targets in the same order, skipping the visual gate entirely.
- **`layout_params_hash`** — `H` over the canonicalised constants actually used: `PAGE_X`, `PAGE_WIDTH`, `BAND_HEIGHT_CAP`, the ramp, `G`, `GUTTER_COL`, `MARGIN`, `EXPORT_PAD`, `FRAME_LABEL_BAND`, `USABLE_W/H`, plus the per-band selected column candidate.
- **`geometry_hash`** (used for §8 no-op detection) — `H` over every element's `(id, type, x, y, width, height, angle, frameId, containerId, points, startBinding, endBinding)`, sorted by id. **`points` and the bindings are included deliberately** *(Codex round 7: without them an `R3` reroute that changes a connector's path while leaving its bounding box identical would be misread as a no-op and escalate a defect that was in fact being repaired)*. Styling remains excluded, so a repair that only recolours still registers as a no-op. Element ids and `seed` values derive from a hash of **`(pattern path, ordinal within pattern, element kind, role, canonicalised content)`** — *(Codex round 2: hashing `(band, role, content)` alone collides whenever a band repeats a label, e.g. two "Add & LayerNorm" boxes, which the reference has)*. Content is canonicalised (Unicode NFC, whitespace normalised) before hashing, and **a collision is a hard failure, never a silent overwrite**. No timestamps are written; keys are serialised sorted. Stage A is non-deterministic by nature — reproducibility is claimed from the spec onward, and the spec is written beside the output.

### 11. The spike — **PASSED** (2026-08-02)

Prerequisite for everything geometric, and now discharged. Full findings:
`docs/design-notes/research/11-spike-findings.md`. Probes: `scripts/spike/probe-0{1..8}-*.mjs`,
reproducible end to end with `pnpm spike:network`.
Headline results: route 1 needs no vendored internals (F1); the font gate is a
correctness gate, not polish (F2); `lineHeight` is derived, not declared (F4);
**viewer parity is exact — 100/100 measurements across four character repertoires and a zero-delta scene round-trip
against live excalidraw.com** (F5); and `exportingFrame` works, but per-frame export
applies neither padding nor a label band, which moved `BAND_HEIGHT_CAP` from 1170 to
1211 (F6).

Delivered:

- **Pinned versions, named and locked**: `@excalidraw/excalidraw@0.18.1` (latest confirmed, 2026-04-20), a pinned Playwright release and its bundled Chromium revision, and the font set shipped with the package. **The lockfile is committed; the bundle and its manifest are not.** *(Amended at packaging: `scripts/vendor/` is a 27 MB build artifact and Chromium is ~150 MB, so both are generated locally by `scripts/setup.mjs` rather than committed. Determinism comes from the lockfile plus the pinned versions above — the artifact is reproducible from them, and `build-bundle.mjs` still records its hash for the oracle.)*
- **A local, offline bundle.** No CDN import at render time — the existing skill is broken today for exactly that reason. The build artifact is vendored **into the working tree at setup time** and its hash recorded.
- **Font readiness before any measurement**, per the character-driven procedure in §2: `document.fonts.load(font, chars)` where `chars` is the union of characters the deck will actually lay out at that `(family, size)`, *then* `await document.fonts.ready`, *then* `document.fonts.check(font, chars)` **with the text argument**, aborting on failure, *then* record the fingerprint and the repertoire. **`ready` + `check` alone is not enough**, and neither is a fixed sample string — both leave lazily-loaded subsets unfetched while reporting success. *(Codex round 9 major: the delivered procedure listed only `ready` + `check`. The consistency sweep then caught that the obvious fix was still glyph-blind — see §2.)*
- **A decisive two-frame fixture** proving frame selection, clipping and `frameId` association under `exportingFrame`. It also settled child-before-frame ordering, which the research had left empirically open: ordering is **not** load-bearing (F6.4).
- **The metric oracle**, built as route 1 — `convertToExcalidrawElements` over the library's **native** Canvas metrics, with no injected provider — verified against fixtures whose ground truth is Excalidraw's own rendering, including multi-line bound-text cases with blank lines. *(Codex round 9 major: this deliverable still required route 2 as a width backend, contradicting §2 where route 2 is unused.)* The spike records the oracle state (`passed` / `failed`) that §8 keys on.
- **Viewer parity**: open a generated file in the live viewer and confirm the rendered text geometry matches what layout computed. Without this the pipeline can agree with itself and disagree with excalidraw.com. **The parity corpus must span the repertoire the plan admits** — at minimum one `LATIN_EXT` fixture and one Cyrillic or Vietnamese fixture, since those are exactly the subsets §2's gate exists to protect. *(Codex round 10 nit: parity was first measured on a Latin sample only, so the claim was broader than the evidence.)* Re-running this probe is also the **only** mechanism that detects live viewer drift (see the risk list), so it is a scheduled maintenance action, not a one-off.
- **The `prose` / `mono` font ids resolved against the pinned build**, each asserted loaded via `document.fonts.check(font, chars)` **with the character-union argument** — never the bare form, which passes vacuously. Both recorded in the metric tuple. Excalidraw renumbered its font ids across versions, so these are discovered, never assumed.
- **Measured per-frame render time**, so the retry budget is grounded.

### 12. Skill architecture

**Built 2026-08-02.** The layout below is as shipped; it differs from the original sketch in two
places, both recorded rather than retro-fitted.

- `.claude-plugin/plugin.json` — plugin manifest.
- `skills/beautidraw/SKILL.md` — thin: pipeline, the audience-facing rule, failure table, pointers.
- `skills/beautidraw/references/` — `deck-spec.md`, `patterns.md`, `visual-system.md`, and
  `blackboard-images.md` (**style contract only — image embedding is unbuilt**: the spec has no
  image field and `generate.mjs` writes `files: null`, so illustrations ship beside the deck,
  not inside it). **No `assets.md`** — tickets 07/08 are unresolved and there is no icon set.
- `scripts/` — `layout.mjs` (in-page), `generate.mjs`, `harness-runner.mjs`, `harness.html`,
  `setup.mjs`, `build-bundle.mjs`, `metric-fonts.mjs` (the Nunito/Cascadia inventory, shared by
  setup and the bundler so the two cannot drift), `vendor-entry.js`, `vendor/` (generated),
  `spike/` (probes; `probe-06` is the viewer-drift gate), `LAYOUT-CONTRACT.md`.
  **`lint.js` and `render.js` were not built as separate files**: validation and rendering both
  live in `generate.mjs`, because both need the same booted Playwright page and splitting them
  would mean booting Chromium twice or passing the page across module boundaries for no gain.
- `commands/` — `from-doc.md`, `from-topic.md`, invoked as `/beautidraw:from-doc` and
  `/beautidraw:from-topic`. *(Named without the redundant `beautidraw-` prefix: an installed
  plugin already namespaces its commands, so the planned names would read
  `/beautidraw:beautidraw-from-doc`.)*

`scripts/` resolves its own root from `import.meta.url`, so `node <plugin>/scripts/generate.mjs`
works from any working directory — verified by running it from outside the repo.

## Key decisions & tradeoffs

1. **Deterministic layout engine, not LLM-placed coordinates.** Contradicts the author's existing `excalidraw-diagram` skill (*"Don't write a Python generator script"*). Overridden on evidence: the 35 defects are overwhelmingly arithmetic, not taste. Cost: a closed vocabulary cannot draw what it has no pattern for.
2. **Layout runs in the browser.** Only Excalidraw's own measurement can be correct. Cost: no cheap headless path, no pure-unit-testable geometry, and a hard dependency on a pinned Chromium.
3. **A closed pattern vocabulary.** Six patterns. Trades reach for guarantees.
4. **Five type sizes against the reference's nine, and larger.** **Signed off by the author, 2026-08-02.** Five of the reference's nine adjacent steps are under 1.15×, which reads as noise rather than hierarchy. Sizes go *up* because the fit-zoom legibility gate demands it. Cost: some content that currently fits one line will wrap.
5. **Prose moves off monospace.** **Signed off by the author, 2026-08-02.** All 51 text elements in the reference are `fontFamily: 3` while only ~6 contain code. Monospace costs ≈20% width — part of what pushed the reference's type down to 10–12 units — and spends Excalidraw's only "this is literal syntax" signal on everything, footer included. New rule: **the code font is a role, not a default.**

   | Content | Font role |
   |---|---|
   | code, formulas, CLI, file paths, literal identifiers | `mono` |
   | title, band headings, deck lines, node labels, annotations, subtitle, footer | `prose` |

   The concrete `fontFamily` integers for `mono` and `prose` are **resolved against the pinned build during the spike, not guessed here** — Excalidraw renumbered its font ids across versions, and the numeric value is already part of the §2 metric tuple and therefore of `oracle_hash`. The spike must record both ids and assert each resolves to a face that `document.fonts.check(font, chars)` confirms is loaded **for the characters actually being measured**. Cost: this visibly changes the look of the author's format.
6. **Two-tier gating.** Structural checks gate immediately; geometric checks gate only after the spike. Prevents enforcing invariants whose oracle is unproven.
7. **Explicit page rectangle**, not a content-derived canvas.

## Risks / open questions

- ~~**The metric oracle may have no clean solution.**~~ **Closed by the spike.** `convertToExcalidrawElements` is public and does real bound-text layout; no internals are vendored. This was the single largest risk.
- ~~**Vendoring internals is a maintenance liability.**~~ **Void** — nothing non-public is pinned.
- **Font loading is the fragile term in the oracle.** The spike showed unloaded faces silently produce different wrap points while every API call still succeeds. The failure mode is a plausible-looking wrong file, so the `document.fonts.check` assertion must abort rather than warn.
- **Viewer drift is invisible to a normal build.** Parity was measured against excalidraw.com build `1acf66e`, which happens to be the same commit as the npm `next` tag — our pinned 0.18.1 and the live viewer are unusually close right now, and that will not last. Because the build is hermetic, **nothing at build time can detect the live viewer moving**: `target viewer version` is a pinned constant, so a recomputed `oracle_hash` still matches after excalidraw.com ships a new build. Drift surfaces only when the **maintenance parity probe** is re-run and fails. *(Codex round 10 major: an earlier version of this bullet claimed drift "surfaces as a blocked build". It does not, and saying so would have made the mitigation look automatic when it is a scheduled human action.)*

  **A failed probe does not license bumping the constant.** *(Codex round 11 major: the previous wording said a failure "forces a constant update and a re-signed oracle" — which would certify a runtime known to disagree with the viewer. Re-pinning changes what we *claim* compatibility with; it does nothing about the local bundle still producing different geometry.)* The remediation order is fixed and has exactly one path: the oracle **stays blocked** until the local bundle and adapter are updated so that parity **passes** against the new live build. Only then may the constant be re-pinned and the oracle re-signed. *(Codex round 12 major: an earlier version offered a second path — "the target stays pinned and the divergence is accepted as an explicit compatibility narrowing." That escape hatch had no oracle state, no signature, and no gate; the probe would have failed anyway. Worse, it is not verifiable in principle — you cannot measure parity against a viewer build that no longer serves. **There is no accepted-divergence state.**)*

The probe enforces this itself and its failure path is exercised, not assumed. It exits non-zero on: an unidentified viewer build; a live build ≠ the pinned constant; any missing or failed `document.fonts.check(font, chars)`; a missing fingerprint entry; any font-metric delta beyond `TOLERANCE_PX`, compared on **unrounded** values; a scene that fails to round-trip; the viewer rewriting bound text; any bound-text geometry delta; the viewer altering **any** asserted field of the scene we wrote — type, position, size, angle, `frameId`, `containerId`, `boundElements`, font fields, text — normalised by element id; or the two array orderings diverging. So a drifted runtime cannot produce a passing `pnpm spike:network`.
- **Browser-dependent layout.** Geometry depends on Chromium version and font availability. An unpinned upgrade silently changes every future deck.
- **Six patterns may not cover real lessons.** Unknown until several are generated.
- **The band-height cap (1211) may fight genuinely tall content.** A deep architecture stack is naturally vertical; forcing columns could obscure the sequence.
- **Stage A/B split may leak.** Emphasis is genuinely semantic; how far that field goes before geometry creeps back is unresolved.
- **The visual system derives from one example.** More were requested and have not arrived; composition thresholds ship as warnings for exactly this reason.

## Out of scope

- PNG / PDF / HTML export as a deliverable. The `.excalidraw` file is the artifact.
- Presenter mode, slideshow, Excalidraw+ features.
- Reusing or retiring `~/.claude/skills/excalidraw-diagram`.
- The Excalidraw MCP chat canvas as a delivery path.
- Editing decks in place after hand-modification. Regeneration is from the spec.
