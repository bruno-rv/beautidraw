# Visual system

Everything here is enforced by the layout engine. You choose the accent; you do not choose
colours, sizes or spacing. This file exists so you know what you are choosing between.

## Palette

Six accents, each a `{ stroke, fill }` pair. Set one per band with `accent`; override a single
`comparison` column with `tone`.

| Accent | Stroke | Fill | Reads as |
|---|---|---|---|
| `blue` | `#1e3a5f` | `#dbeafe` | neutral, structural — a safe default |
| `green` | `#047857` | `#d1fae5` | permitted, working, go |
| `amber` | `#b45309` | `#fef3c7` | caution, needs review |
| `red` | `#b91c1c` | `#fee2e2` | boundary, stop, human-only |
| `violet` | `#5b21b6` | `#ede9fe` | conceptual, model, mental map |
| `slate` | `#1e293b` | `#f1f5f9` | inert, framing, container |

Chrome is separate and never an accent: `#1e1e1e` for title, subtitle, headings, deck lines and
footer; `#94a3b8` for frames and the timeline axis.

**Rotate accents between adjacent bands.** The semantic readings above only survive if colour
means something — using `red` for a band that is merely important spends it.

## Type ramp

Five sizes. Adjacent steps are at least 1.25× apart so the hierarchy reads rather than looking
like noise.

| Role | Size |
|---|---|
| title | 48 |
| band heading | 38 |
| hero node / column header | 30 |
| node label, subtitle, deck line | 23 |
| note, footer | 18 |

The floor is set by the fit-zoom gate, and the band height cap is what keeps you clear of it.
A band viewed fit-to-window zooms to `min(1600 / 2280, 850 / frameHeight)`. The first term is
0.70175 and fixed; the second only becomes the smaller one above a frame height of 1211.25 — and
`BAND_HEIGHT_CAP` is 1211, which is `floor(850 × 2280 / 1600)`, not a free choice. So every legal
band zooms at 0.70175, 18pt lands at 12.63 css px, and the 12px floor holds with 0.63px to spare.

Two consequences. Content cannot push text below the floor — a band that would has already
failed the height cap. And the ramp cannot be lowered: 17pt would land at 11.93px and fail
everywhere at once.

`prose` (Nunito) is the default paragraph face. `mono` (Cascadia) is used for
commands, formulas, CLI strings, file paths, and literal identifiers. Short
annotations may use `handwritten` (Excalifont); it is not a paragraph face.
`fontForRole()` carries the role through measured font requirements and the
converter, so wrapping is based on the declared face rather than an
approximate character-count width.

## Contrast

Text on a filled shape must clear **4.5:1** below 24 effective px and **3:1** at or above.
"Effective" is size × the 0.70175 zoom above, so the 3:1 branch only engages at 35pt and up —
every ramp step a node can use is judged against the strict 4.5:1. The six pairs above are chosen
to clear it and the generator asserts it per element rather than trusting the table — `amber` is
the tightest at 4.51 with no headroom, so do not hand-edit fills.

## Page geometry

Fixed, and not yours to change: page width 2280, band height cap 1211, bands stacked with a 96
gap. Body content is inset 24 from the page edge; every frame is pinned to the page box so the
edge does not jitter as you pan.

A band that will not fit the height cap is a content problem. Split it.
