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

The floor is set by the fit-zoom gate: a band viewed fit-to-window renders at ~0.70×, so 18pt
lands at ~12.6 css px. Nothing smaller is allowed, which is why the ramp starts high.

`prose` (Nunito) is the default. `mono` (Cascadia) is a role — code, formulas, CLI, file paths,
literal identifiers — not a house style. Note text is currently prose-only; write formulas as
prose ("voluntary leavers over average headcount", not `leavers / headcount`).

## Contrast

Text on a filled shape must clear **4.5:1** below 24 effective px and **3:1** at or above. The
six pairs above are chosen to clear it and the generator asserts it per element rather than
trusting the table — `amber` is the tightest at 4.51 with no headroom, so do not hand-edit fills.

## Page geometry

Fixed, and not yours to change: page width 2280, band height cap 1211, bands stacked with a 96
gap. Body content is inset 24 from the page edge; every frame is pinned to the page box so the
edge does not jitter as you pan.

A band that will not fit the height cap is a content problem. Split it.
