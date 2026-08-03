# 02 — Frame element semantics and live frame navigation

Type: research
Status: resolved
Blocked by: —
Parent: ../map.md

## Question

What exactly is an Excalidraw `frame` element in the file format, and how does presenting by navigating frames actually work for a viewer?

Specifically:

- The full JSON shape of a `frame` element: required and optional properties, `name`, sizing, z-order relative to its children.
- How a child element is associated with a frame (`frameId`? containment by geometry? both?) and what happens to elements that straddle a frame boundary.
- Whether frames nest, and whether frame order in the `elements` array carries meaning.
- How a person navigates frame to frame while presenting in excalidraw.com and in the desktop app — keyboard shortcuts, zoom-to-frame, any presentation/slideshow affordance, and whether frame *order* is derived from names, array order, or canvas position.
- Whether any of this differs between excalidraw.com, Excalidraw+, the desktop app, and the Obsidian plugin.
- Practical frame sizing conventions for a presentation — is there a canonical slide aspect ratio or size people use?

Findings go in `../research/02-frame-semantics-and-navigation.md`.

## Answer

Full findings: `../research/02-frame-semantics-and-navigation.md`. Sourced from the `excalidraw/excalidraw` TypeScript source, the dev docs, and issue threads.

**Frame shape**: the base element plus `type: "frame"` and `name: string | null`. That is the *only* field frames add. A null name renders as the default label `"Frame"`.

**Association is `frameId` on the child, compared with `===`** — a static pointer, not live geometry. Geometry (`elementOverlapsWithFrame`) only decides membership at edit time in the UI. A straddling element is eligible to join and gets *visually clipped* to the frame bounds, while its own coordinates still run past the boundary. So a generator must set `frameId` explicitly and must not rely on containment.

**Frames do not nest** — the code explicitly excludes frame-like elements from becoming children of another frame.

**Array order is load-bearing.** The dev docs require a frame's children to sit immediately *before* their frame element in the `elements` array; violate it and rendering and clipping break silently. This is a hard constraint on how the generator emits JSON.

**Navigation — this invalidates an assumption the map was built on.** Free excalidraw.com has **no native Present/slideshow mode**. A maintainer closed issue #253 confirming presentations are an Excalidraw+ feature. What exists where:

| Surface | Frame-to-frame affordance | Ordering rule |
|---|---|---|
| excalidraw.com (free) | Ctrl/Cmd+F Search menu lists frames; no slideshow | canvas **Y-position** |
| Excalidraw+ | real slide presentation | its own decoupled slide-list order (open complaint #8731) |
| Obsidian Excalidraw plugin | community "Slideshow" script | **alphabetical by frame name** |
| Desktop app | deprecated — Electron wrapper retired for the PWA | n/a |

Three surfaces, three different ordering rules. **Array order governs presentation order nowhere.**

**Mitigation that satisfies two surfaces at once**: name frames with zero-padded numeric prefixes (`01 — Title`, `02 — …`) *and* lay them out top-to-bottom in matching Y order. Alphabetical sort and Y-position sort then agree.

**Sizing**: 16:9 is the de facto convention (Excalidraw+ default, issue #8509); 1920×1080 is concretely sourced as the Obsidian plugin's PDF-export default. No official canonical preset exists — feature request #8751 is still open.

**Consequence**: the map's delivery constraint said "live frame navigation in Excalidraw" and ruled export out of scope. On free excalidraw.com that means manual Search-menu jumps or hand zooming, not a presentation mode. Which surface Bruno actually presents on is now an open decision — raised as ticket 09.
