# 01 — Example Excalidraw presentations land in the repo

Type: task
Status: open
Blocked by: —
Parent: ../map.md

## Question

Bruno places the example `.excalidraw` presentation files that establish the desired layout into `~/Dev/beautidraw/examples/`.

Nothing about slide anatomy, deck grammar, typography, density, or the colour system can be specified before this resolves — the visual system is clean-room, derived from these files and nothing else. This is the single hardest blocker on the map.

HITL. The checklist for Bruno:

1. Drop one or more `.excalidraw` files into `~/Dev/beautidraw/examples/`.
2. For each file, say in one line what it is and whether it is *good* — an example to imitate — or merely *representative* of a format that still needs improving.
3. Flag any file that is a single dense diagram rather than a multi-frame presentation, so it is not mistaken for deck layout evidence.

## Progress

**Received (1 of ?)**: `examples/al-1.excalidraw`, copied from `~/Downloads/al-1.excalidraw`. 48 KB, 94 elements, no `files` map (zero embedded images).

Measured facts, straight from the JSON:

- **Zero frame elements.** One continuous canvas, 2705 × 1695 (x 75..2780, y 30..1725), `viewBackgroundColor` white, `gridSize` 20. This is the finding that raised ticket 10.
- **Structure**: title (36px) + subtitle (16px) at top centre, then three stacked section bands each opened by a `SEÇÃO N — …` heading at 20px and a 12px one-line summary, then a 14px footer with course branding. Section bands start at y≈140, y≈500, y≈1370.
- **Element mix**: 51 text, 18 rectangle, 9 arrow, 9 ellipse, 7 line. Text-dominant — a low container ratio in practice, consistent with the "prefer free-floating text" instinct.
- **Uniform style**: `roughness: 0` on all 94 elements, `fontFamily: 3` on all 51 text elements. Stroke widths 1 (64), 2 (23), 3 (7) — thin by default, weight reserved for emphasis.
- **Type scale actually used**: 36 / 24 / 20 / 16 / 14 / 13 / 12 / 11 / 10. Nine sizes, heavily weighted to 12 (16 uses) and 14 (10 uses). Small type — designed for zooming in, not for reading at fit-to-screen.
- **Palette in use** — strokes: `#1e3a5f` navy (21), `#64748b` slate (19), `#047857` emerald (15), `#1e40af` blue (10), `#c2410c` orange (9), `#22c55e` green (6), `#b45309` amber (5), `#6d28d9` violet (4), `#ffffff` (3), `#374151` (1), `#3b82f6` (1). Backgrounds: mostly `transparent` (67), then `#1e293b` dark slate (6, the evidence-artifact panels), `#3b82f6` (6), `#a7f3d0` (5), `#fed7aa` (3), `#93c5fd` (2), `#fef3c7` (2), `#60a5fa` / `#dbeafe` / `#ddd6fe` (1 each). Tailwind-family colours throughout.
- **Content language**: Portuguese (pt-BR), with English technical terms kept verbatim.
- **Evidence artifacts confirmed present**: real formulas (`PE(pos,2i) = sin(pos/10000^(2i/d))`, `softmax(Q × K^T / √d_k) × V`), real numbers (`d_model = 512`, `512 → 2048 → 512`, `× 6 camadas`), real costs (`$670` → `$100M+`), real citations (`173.000+ citações`, `NeurIPS 2017`).

**Still needed from Bruno**: a verdict on this file — imitate it, or merely representative of a format that still needs improving — and whether more examples are coming.

## Answer

<!-- on resolution: the full file list, verdicts, and the facts later tickets depend on -->
