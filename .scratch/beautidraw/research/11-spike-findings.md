# 11 — Metric oracle spike: findings

**Verdict: `passed`.** Every deliverable in PLAN.md §11 is answered. The plan's
largest risk is dead, and four of its assumptions are falsified with measurements.

## Runtime

`@excalidraw/excalidraw@0.18.1`, React 19.2.0, esbuild 0.25.10, Playwright 1.56.1,
HeadlessChrome/141.0.7390.37, macOS arm64, `deviceScaleFactor: 1`, launch args
`--font-render-hinting=none --disable-lcd-text`, viewport 1600 × 900.

Bundle `scripts/vendor/excalidraw.js`, sha256
`460ccb91503dd5a3d3587444eff767d24dcfd08038f0b45466a9e475c56c320e`, 13,506,288 bytes,
built offline by `scripts/build-bundle.mjs`. No CDN import at render time.

Target viewer measured: **excalidraw.com build `1acf66edabc2ac5bbd4aed0714aed7dca7cc2aab`**
(`2026-07-28T16:12:33Z-1acf66e`). Note this is the same commit npm publishes as the
`next` dist-tag (`0.18.0-1acf66e`).

Probes: `scripts/spike/probe-0{1..8}-*.mjs`, reproducible end to end with `pnpm spike:network`.

## F1 — Route 1 needs no vendored internals. **The largest planned risk is dead.**

`convertToExcalidrawElements` is a *public* export and it performs real bound-text
layout: soft-wrapping, container-relative placement, container-derived height, and
`containerId`/`boundElements` cross-linking.

Input: rectangle 300 × 100, 79-character label, `fontSize: 20`, `fontFamily: 5`.
Output text element wrapped to 3 lines (`text !== originalText`), `height = 75 =
3 × 20 × 1.25`, `x` centred in the container.

PLAN.md §2 ranked this route as *"requires vendoring internals — the package does not
expose runtime `element/*` subpaths — and the bound-text routine mutates scene state"*.
That is wrong for 0.18.1. Consequences:

- No non-public code is pinned, so the *"vendoring internals is a maintenance
  liability"* risk in PLAN.md is void.
- Route 2 (`setCustomTextMetricsProvider`) is **not needed at all**. The library uses
  the browser's native metrics by default, which F5 proves are already identical to
  the viewer's. Injecting a provider could only introduce divergence.
- `oracle_hash`'s `route-1 adapter source hash` term now covers a thin adapter over a
  public API. But see F2: the adapter and the **font fingerprint are jointly** the
  oracle, and the font term is the fragile one. Font loading is not setup boilerplate.

## F2 — `document.fonts.ready` is not sufficient. The font gate is a **correctness** gate.

Excalidraw registers its faces as unicode-range subsets, loaded lazily. After
`document.fonts.ready` resolved, `document.fonts.check("20px <family>")` returned
**false for every scene family**, and all five measured *byte-identically* (529.88 px
for the sample string) — the signature of one shared fallback face.

After explicit `document.fonts.load(...)` per family with sample text:

| Family | id | width @20px | vs fallback |
|---|---|---|---|
| Excalifont | 5 | 632.84 | +19.4% |
| Nunito | 6 | 585.02 | +10.4% |
| Cascadia | 3 | 703.13 | +32.7% |
| Comic Shanns | 8 | 660.00 | +24.6% |
| Lilita One | 7 | 543.06 | +2.5% |

The F1 bound-text case re-run with faces loaded **wrapped at different points**:
width `275.76` vs `288.81`, `x = 12.12` vs `5.60`, breaks moved ("jumps" / "jumps
over"). Unloaded fonts do not merely mis-measure — they produce different text.

**The loader is part of the oracle.** First formulation — `document.fonts.load(font,
sampleText)` per (family, size), then `ready`, then `check()` — is **still wrong**, and a
later consistency sweep caught it: see F8. The load must be driven by the deck's own
characters, not a sample.

## F3 — Font ids and the signed-off font roles

`FONT_FAMILY` = `{ Virgil: 1, Helvetica: 2, Cascadia: 3, Excalifont: 5, Nunito: 6,
"Lilita One": 7, "Comic Shanns": 8, "Liberation Sans": 9 }`.

`al-1.excalidraw` uses `fontFamily: 3` throughout — **Cascadia**, the monospace code
face. Per the author's signed-off font-role rule:

- `prose` → **Nunito, id 6**
- `mono` → **Cascadia, id 3** — unchanged from the reference, so code keeps its look.

Cascadia measures **20.2% wider than Nunito** at equal size (703.13 vs 585.02) — i.e. Nunito
is **16.8% narrower**, which is the width the signed-off change actually recovers. Stating it as
"Nunito is 20.2% narrower" inverts the base and overstates the saving.

## F4 — `lineHeight` is derived from `fontFamily`, not declared

PLAN.md §2 lists `lineHeight` as a per-role constant the plugin declares. The library
assigns it from the font family:

| Family | id | `lineHeight` | height per line @20px |
|---|---|---|---|
| Cascadia | 3 | 1.2 | 24 |
| Excalifont | 5 | 1.25 | 25 |
| Nunito | 6 | **1.35** | 27 |
| Lilita One | 7 | 1.15 | 23 |
| Comic Shanns | 8 | 1.25 | 25 |

**The metric tuple must read `lineHeight` from the library rather than declare it**, or
declare a value verified equal to it. Declaring a different number would diverge from
what Excalidraw does by default and therefore from the viewer.

Consequence for the signed-off font change: `prose` (Nunito, 1.35) is 12.5% taller per
line than the reference's Cascadia (1.2) while being **16.8% narrower** per line. Net per
text block: `0.832 x 1.125 = 0.936`, about 6.4% less area — favourable, but much less than
the width figure alone suggests. Band-height budgeting must use 1.35, not 1.25.

## F5 — Viewer parity: **exact**

The same measurement function was executed in our vendored bundle and on live
excalidraw.com, across 5 families × 5 sizes × 4 character repertoires:

- **100 / 100 measurements identical. `maxFingerprintDeltaPct = 0`** — 5 families x 5 sizes x
  4 repertoires (Latin, LATIN_EXT, Cyrillic, Vietnamese). See F8.

A generated scene (frame + rectangle + bound text carrying our computed geometry) was
injected into excalidraw.com via `localStorage` and read back after the app settled:

| | written | read back |
|---|---|---|
| text width | 288.5397 | 288.5397 |
| text height | 81 | 81 |
| wrapped lines | 3 | 3, identical break points |
| `frameId` / `containerId` | `frm1` / `cont1` | preserved |

Delta zero on every field. The pipeline does not merely agree with itself.

**Caveat to re-check on any upgrade:** parity was measured against build `1acf66e`,
which is the same commit as the npm `next` tag — our pinned `0.18.1` and the live
viewer are unusually close right now. `target viewer version` is a **pinned constant**, so a hermetic build cannot
detect the live viewer moving — re-running this probe is the only mechanism that does.

## F6 — `exportingFrame` works, but **not** as PLAN.md §4 assumed

Two-frame fixture: frames A (y 20) and B (y 420), each with a labelled rectangle, one
unframed rectangle between them, one oversized rectangle assigned to frame A by
`frameId` while extending 380 units past its right edge.

Confirmed:

- **Selection is exact.** Frame A export contains only `BAND ONE`, frame B only
  `BAND TWO`, neither the unframed chrome.
- **Membership is `frameId` alone**, and content outside the frame box is clipped.
- **Per-frame render ≈ 10 ms** after warm-up (49.7 ms first call, then 9.4 ms; whole
  scene 11 ms). The §8 retry budget is not render-bound.

Falsified:

1. **`exportPadding` is a top-level option, not an `appState` field.** Passed inside
   `appState` it is silently ignored and the default 10 applies. Passed top-level it is
   honoured exactly: scene export of a 400 × 200 bbox gives 400 × 200 at `pad = 0` and
   480 × 280 at `pad = 40`.
2. **Per-frame export ignores padding entirely** and is always *exactly*
   `frame.width × frame.height` — verified at `pad` 0, 10 and 40.
3. **Per-frame export never draws the frame label**, at any name length.
4. **Array order does not affect export.** Frames-first produced an equivalent frame A
   export to children-before-frame, and F5 shows excalidraw.com accepts *and preserves*
   both orderings with identical per-element geometry. Research 02's contiguity
   requirement is **not load-bearing** on either surface tested. Keep the contiguity
   fixture — it costs nothing and matches the format's convention — but the plan may no
   longer claim clipping breaks without it.

### The frame label, measured rather than inferred

Probe 3 inferred the label's extent from a whole-scene height subtraction. Probe 4's
attempted control was invalid: **`name: null` still paints a default `"Frame"` label**,
so named-vs-unnamed isolated nothing (both 240.5). The valid control is *frame vs no
frame* over identical element geometry:

| `exportPadding` | no frame | with frame | delta |
|---|---|---|---|
| 0 | 400 × 200 | 400 × 220.5 | +0, **+20.5** |
| 5 | 410 × 210 | 410 × 230.5 | +0, **+20.5** |
| 10 | 420 × 220 | 420 × 240.5 | +0, **+20.5** |
| 20 | 440 × 240 | 440 × 260.5 | +0, **+20.5** |
| 40 | 480 × 280 | 480 × 300.5 | +0, **+20.5** |

So **`FRAME_LABEL_BAND = 20.5`** (not the assumed 24), it adds **zero width** even for a
name that overflows the frame (the label truncates with an ellipsis), and it applies to
**whole-scene export only**. In the probe-3 two-frame scene it appeared once, above the
topmost frame — **empirically confirming the round-6 correction that label extents are
unioned, never summed**. Summing would have predicted 661 against the measured 640.5.

## F7 — Height derivation and the degenerate cases

`textHeight = lineCount × fontSize × lineHeight(fontFamily)` held **exactly** across every
case tried, and container height grows to `textHeight + 2 × BOUND_TEXT_PADDING`:

| Case | lines | height | predicted |
|---|---|---|---|
| blank line between paragraphs | 5 | 135 | 5 × 20 × 1.35 = 135 |
| trailing `\n` | 2 | 54 | 54 |
| leading `\n` | 2 | 54 | 54 |
| `A\n\n\nB` | 4 | 108 | 108 |
| tabs | 1 | 27 | 27 |

Blank lines are **real lines** and occupy full height — they are neither collapsed nor
trimmed, at either end. Tabs are normalised to 8 spaces in **both** `text` *and*
`originalText`, so the converter mutates the input string.

**The trap: an empty string produces no text element at all.** `convertToExcalidrawElements`
returns the container alone, with no error. A role the §2 table declares must carry bound text
would silently carry none, the container would render as an empty box, and no structural
assertion would fire because nothing is malformed. Guarded two ways in PLAN.md: §9 rejects
empty and whitespace-only labels at the schema, and Tier 1 asserts every declared-bound role
resolved to an actual text element. A single space *does* produce a text element (width 5.22).

## F8 — The obvious fix to F2 is **still wrong**: the font gate must be glyph-driven

Found by a post-spike consistency sweep, not by the spike itself, and verified against the
installed `@excalidraw/excalidraw@0.18.1` sources rather than inferred:

- `dist/prod/fonts/Nunito` ships **five** woff2 files, registered in `chunk-K2UTITRG.js` as
  `[CYRILLIC_EXT, CYRILLIC, VIETNAMESE, LATIN_EXT, LATIN]`. `LATIN` covers
  `U+0000-00FF` plus assorted punctuation and `U+2191`/`U+2193`; `LATIN_EXT` covers
  `U+0100-02AF`, `U+1E00-1E9F`, `U+2113`, `U+2020`, `U+2C60-2C7F` and more.
- Excalidraw's own loader is **character-driven**: `Fonts.loadSceneFonts()` calls
  `getCharsPerFamily(elements)`, iterating each element's `originalText` character by
  character, then gates every face on a unicode-range test. The live viewer fetches exactly
  the subsets the scene's characters require.

So F2's prescription — load with a *sample string* per (family, size) — fetches only the
subsets that sample happened to touch. Worse, `document.fonts.check(font)` **without a text
argument** probes the spec default (`" "`), which lies in `LATIN`, so it returns `true` as
soon as any latin subset is present. The gate's predicate is strictly weaker than the
property it is presented as guaranteeing, and it reports success while a label containing an
unfetched glyph is measured against the fallback face.

Correct procedure — mirror the library:

```
for each (family, size) in the metric tuple:
    chars = union of every character the deck lays out at that (family, size)
    await document.fonts.load(`${size}px "${family}"`, chars)
await document.fonts.ready
for each (family, size):
    assert document.fonts.check(`${size}px "${family}"`, chars)   // text arg mandatory
```

**Scope — measured (probe 8), not argued.** Loading Latin only for Nunito, then asking both
forms of `check`:

| Repertoire | bare `check` | `check(font, text)` | width error in that window |
|---|---|---|---|
| Cyrillic | `true` | `false` | **13.34%** |
| Vietnamese | `true` | `false` | 0.73% |
| `LATIN_EXT` | `true` | `true` | 0% |

The bare form is vacuous in all three; the text-argument form is honest in all three. But the
exposure is **narrower than the sweep argued**: `LATIN_EXT` rides along with `LATIN` and shows
zero error, so the "`ł`, `ā`, `ș`, `ℓ`, `†` move a wrap point" case does not reproduce. Ordinary
English and Western-European text — `é ö ñ ç`, em/en dashes, curly quotes, `…`, `€`, `™` — is
likewise unaffected.

What survives is the serious case: a **Cyrillic or Vietnamese** label, which §9's schema does
not exclude and Stage A can emit, measures against the fallback face while every stated
assertion passes. 13.34% is far past any wrap boundary. `→` (`U+2192`) is *not* a
counter-example — it is in no Nunito subset at all, so it falls back identically in our
measurement and in the viewer and does not diverge.

**Parity re-measured across the full repertoire** (probe 6, extended): 5 families × 5 sizes ×
4 repertoires = **100/100 measurements identical** against live excalidraw.com, including
`LATIN_EXT`, Cyrillic and Vietnamese. The earlier 25/25 figure covered Latin only, so the
parity claim was broader than its evidence; it now is not.

Nothing else closes the gap: viewer parity is a one-off spike deliverable rather than a
per-run check; Tier 2's geometry assertions compare a run against its own bad measurement;
and `oracle_hash`'s fixture-corpus term means `passed` attests only to the fixtures'
character repertoire.

## `USABLE_W` / `USABLE_H` provenance — checked, no double-count

Raising `BAND_HEIGHT_CAP` on the strength of F6 is only valid if `USABLE_H = 850` was never
itself net of the padding and label band that F6 removed. `PLAN-REVIEW-LOG.md:44` settles it:
the two constants entered at **round 1**, applied to bare frame dimensions (`1600/2280`,
`850/1200`), and the inflation terms were not introduced until round 4. They are raw
usable-viewport figures. The spike returns the model to the round-1 one, so they apply
unchanged and 1211 is sound. Provenance is now recorded in PLAN.md §4, where it had never
been written down.

## Required PLAN.md §4 revision

```
framedW(band) = frame.width           # was frame.width  + 2·EXPORT_PAD
framedH(band) = frame.height          # was frame.height + FRAME_LABEL_BAND + 2·EXPORT_PAD
z_actual(band) = min(USABLE_W / framedW, USABLE_H / framedH)
```

`EXPORT_PAD` and `FRAME_LABEL_BAND` stay live constants — both are real for the
whole-scene `z_scene` computation, which is unchanged apart from `FRAME_LABEL_BAND`
becoming 20.5.

Re-running the §4 worked check, holding `PAGE_WIDTH = 2280`, `USABLE_W = 1600`,
`USABLE_H = 850`:

- `z_w = 1600 / 2280 = 0.7018`
- height binds only when `frame.height > 850 / 0.7018 = 1211.2`

`BAND_HEIGHT_CAP` may therefore rise from 1170 to **1211** with width still binding —
the cap was lowered to 1170 solely to absorb padding and a label band that per-frame
export does not apply. Ramp floor: `18 × 0.7018 = 12.63` css px, clearing the ≥12 gate
with more headroom than the 12.52 the plan predicted.
