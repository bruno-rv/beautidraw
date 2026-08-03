# 10 — What shape is a beautidraw "presentation"?

Type: grilling
Status: resolved
Blocked by: —
Parent: ../map.md

## Question

The map was charted on the assumption that a presentation is a multi-frame Excalidraw file, one frame per slide. Two findings put that in doubt:

1. Ticket 09 — no presenter mode is needed. The file is opened and panned by hand.
2. The first example, `examples/al-1.excalidraw`, contains **zero frame elements**. It is one continuous 2705 × 1695 canvas with three stacked, labelled section bands (`SEÇÃO 1/2/3`), a title, and a footer.

So the generator's output shape is an open decision, not a settled premise:

- **A — Sectioned canvas.** Exactly the example: one canvas, vertical section bands, no frames. Highest fidelity to what Bruno already makes. No navigation aid beyond scrolling.
- **B — Sectioned canvas plus frames.** Same layout and content, but each section additionally wrapped in a `frame` element with a numbered name. The canvas still reads top-to-bottom, and Ctrl/Cmd+F zoom-to-frame becomes available for free. A superset of A; costs a handful of extra elements.
- **C — True slide deck.** Many small 16:9 frames, one idea each. A different artifact from the example, and only worth it if Bruno wants something he is not currently making.

Also to settle here: is one output file *one* presentation (as `al-1.excalidraw` is one lesson), or does a "presentation" span several files?

## Answer

**Option B — sectioned canvas plus frames.**

The output is one `.excalidraw` file laid out exactly like `al-1.excalidraw`: a title block, then stacked section bands running top to bottom, then a footer. **Additionally**, each section band is wrapped in a `frame` element with a zero-padded numbered name (`01 — Timeline`, `02 — Arquitetura`, …).

Why the frames earn their place despite 09 establishing that no presenter mode is needed:

- They cost a handful of elements and change nothing visually — the canvas still reads top to bottom exactly as it does today.
- Ctrl/Cmd+F zoom-to-frame becomes available for free on excalidraw.com, which is a real convenience while panning a 2705-unit-wide canvas by hand.
- They give the generator and the render-validation loop a first-class per-section handle: ticket 04 established that `exportToSvg` takes an `exportingFrame` argument, so a frame per section means the validation loop can render and inspect **one section at a time** instead of squinting at a 2705 × 1715 whole-canvas image. This is the strongest argument for frames and it is an internal one.

Frame ordering follows the ticket 02 convention: numeric name prefixes plus matching top-to-bottom Y layout, so alphabetical and Y-position sorts agree.

**Scope of one file**: one presentation = one `.excalidraw` file = one lesson or one topic, as `al-1.excalidraw` is one lesson. A presentation does not span files.

**Consequence for the map**: the destination changes from "multi-frame presentation, one frame per slide" to "one sectioned canvas per topic, with frames as section scaffolding". The layout unit is the **section band**, not the slide.
