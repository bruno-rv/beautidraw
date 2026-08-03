# 02 — Frame element semantics and live frame navigation

Research for `../issues/02-frame-semantics-and-navigation.md`.

## Bottom line

- Association is purely by `frameId` on the child (a plain string pointer, checked with `===`) — not live geometry. Geometry only decides *eligibility* (add/drop) at edit time (drag, resize, paste). Once a child has `frameId` set, it stays a member even if later moved fully outside the frame's bounds, until something explicitly clears it.
- Array order is **load-bearing**, not decorative: the primary source is explicit that a frame's children must sit *before* the frame element in the `elements` array, with the frame element immediately after its last child. Get this wrong and clipping/rendering silently degrades.
- Frames do not nest. The containment-eligibility code explicitly excludes frame-like elements from becoming children of another frame.
- **Critical for this project: plain excalidraw.com / the open-source library has no built-in "Present"/slideshow mode at all.** Presentation (live presenting, slide decks, PDF/PPTX export) is an **Excalidraw+ paid-product feature**, confirmed directly by an Excalidraw maintainer. The only native "frame navigation" on free excalidraw.com is manual: select a frame (click its name/border) + `Shift+2` (zoom to selection), or `Ctrl/Cmd+F` Search, which lists frames as a distinct category ordered by **canvas Y-position (top to bottom)**, not name and not array order.
- The Obsidian Excalidraw plugin ships an independent, unofficial slideshow (a community "Excalidraw Automate" script), which orders frames **alphabetically by frame `name`** — a different rule from excalidraw.com's own search menu.
- **Design implication for beautidraw**: since the map commits to "live frame navigation inside Excalidraw" with no dependency on Excalidraw+, the generator cannot lean on any native next/previous-frame command — because none exists in the free product. It should (a) name frames with a sortable numeric prefix (`"01 Title"`, `"02 Overview"`, …) so the Obsidian plugin's alphabetical sort is correct, **and** (b) lay frames out top-to-bottom in increasing Y on the canvas, in the same order, so free excalidraw.com's own Search-menu frame list (Y-sorted) agrees with the Obsidian ordering too. Doing both makes the deck presentable correctly regardless of which surface the user ends up navigating in. Default to 16:9 frames.

---

## 1. Full JSON shape of a `frame` element

Primary source: `packages/element/src/types.ts` in `excalidraw/excalidraw` (fetched from `master`, commit `786ab26…`), specifically:

```ts
type _ExcalidrawElementBase = Readonly<{
  id: string;
  x: number;
  y: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roundness: null | { type: RoundnessType; value?: number };
  roughness: number;
  opacity: number;
  width: number;
  height: number;
  angle: Radians;
  seed: number;          // shape-generation seed, kept stable across renders
  version: number;       // incremented on each change
  versionNonce: number;  // regenerated on each change, tie-breaks version during collab reconciliation
  index: FractionalIndex | null;  // fractional-indexing string, kept in sync with array order
  isDeleted: boolean;
  groupIds: readonly GroupId[];   // deepest to shallowest
  frameId: string | null;         // <-- the containing frame's id, or null
  boundElements: readonly BoundElement[] | null;
  updated: number;        // epoch ms
  link: string | null;
  locked: boolean;
}>;

export type ExcalidrawFrameElement = _ExcalidrawElementBase & {
  type: "frame";
  name: string | null;
};

export type ExcalidrawMagicFrameElement = _ExcalidrawElementBase & {
  type: "magicframe";   // the "AI"/wireframe-to-code frame variant, same shape
  name: string | null;
};

export type ExcalidrawFrameLikeElement =
  | ExcalidrawFrameElement
  | ExcalidrawMagicFrameElement;
```

Source: [`packages/element/src/types.ts`](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/types.ts) (fetched via raw.githubusercontent.com, master branch).

**What this means field by field:**

- A `frame` element adds exactly **one** field beyond every other Excalidraw element: `name: string | null`. Everything else (`x`, `y`, `width`, `height`, `strokeColor`, `backgroundColor`, etc.) is the same base shape every rectangle/ellipse/text element has — a frame is structurally just another element with `type: "frame"`.
- All fields on `_ExcalidrawElementBase` are **required** (no `?` optional markers) — including on frame elements. `name` must be present as a key; its *value* may be `null`.
- `frameId` is inherited by *every* element type, including frame elements themselves. In practice frame elements do not use it meaningfully to nest (see §3).
- Default/fallback name: when `name` is `null`, the UI falls back to a computed default label. From `packages/element/src/frame.ts`:
  ```ts
  const DEFAULT_FRAME_NAME = "Frame";
  const DEFAULT_AI_FRAME_NAME = "AI Frame";
  export const getDefaultFrameName = (element: ExcalidrawFrameLikeElement) =>
    isFrameElement(element) ? DEFAULT_FRAME_NAME : DEFAULT_AI_FRAME_NAME;
  export const getFrameLikeTitle = (element: ExcalidrawFrameLikeElement) =>
    element.name === null ? getDefaultFrameName(element) : element.name;
  ```
  Source: [`packages/element/src/frame.ts`](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/frame.ts), lines ~971-981.
- **Z-order relative to children**: children are painted *first*, the frame element is painted immediately after them, in array order (see §3). The frame's own stroke/label sits visually "on top," and this ordering is also what lets the frame clip its children during rendering/export.

### Literal example: one frame with two correctly-associated children

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [
    {
      "id": "child-rect-1",
      "type": "rectangle",
      "x": 120,
      "y": 220,
      "width": 300,
      "height": 120,
      "angle": 0,
      "strokeColor": "#1e1e1e",
      "backgroundColor": "#a5d8ff",
      "fillStyle": "solid",
      "strokeWidth": 2,
      "strokeStyle": "solid",
      "roughness": 1,
      "opacity": 100,
      "roundness": { "type": 3 },
      "seed": 123456789,
      "version": 1,
      "versionNonce": 987654321,
      "index": "a0",
      "isDeleted": false,
      "groupIds": [],
      "frameId": "frame-1",
      "boundElements": null,
      "updated": 1735660800000,
      "link": null,
      "locked": false
    },
    {
      "id": "child-text-1",
      "type": "text",
      "x": 140,
      "y": 250,
      "width": 200,
      "height": 25,
      "angle": 0,
      "strokeColor": "#1e1e1e",
      "backgroundColor": "transparent",
      "fillStyle": "solid",
      "strokeWidth": 2,
      "strokeStyle": "solid",
      "roughness": 1,
      "opacity": 100,
      "roundness": null,
      "seed": 223456789,
      "version": 1,
      "versionNonce": 187654321,
      "index": "a1",
      "isDeleted": false,
      "groupIds": [],
      "frameId": "frame-1",
      "boundElements": null,
      "updated": 1735660800000,
      "link": null,
      "locked": false,
      "text": "Hello",
      "fontSize": 20,
      "fontFamily": 1,
      "textAlign": "left",
      "verticalAlign": "top",
      "containerId": null,
      "originalText": "Hello",
      "lineHeight": 1.25
    },
    {
      "id": "frame-1",
      "type": "frame",
      "x": 100,
      "y": 200,
      "width": 400,
      "height": 300,
      "angle": 0,
      "strokeColor": "#000000",
      "backgroundColor": "transparent",
      "fillStyle": "solid",
      "strokeWidth": 1,
      "strokeStyle": "solid",
      "roughness": 0,
      "opacity": 100,
      "roundness": null,
      "seed": 323456789,
      "version": 1,
      "versionNonce": 287654321,
      "index": "a2",
      "isDeleted": false,
      "groupIds": [],
      "frameId": null,
      "boundElements": null,
      "updated": 1735660800000,
      "link": null,
      "locked": false,
      "name": "01 Title Slide"
    }
  ],
  "appState": {},
  "files": {}
}
```

Notes on the example: both children carry `"frameId": "frame-1"`; the frame element carries `"frameId": null` (it is not itself inside another frame); the two children appear **before** the frame element in the array, matching the required ordering rule from §3.

---

## 2. Child-to-frame association and boundary straddling

Primary source: [`packages/element/src/frame.ts`](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/frame.ts).

**Steady-state membership is `frameId` only.** `getFrameChildren` is a pure filter:

```ts
export const getFrameChildren = (allElements: ElementsMapOrArray, frameId: string) => {
  const frameChildren: ExcalidrawElement[] = [];
  for (const element of allElements.values()) {
    if (element.frameId === frameId) {
      frameChildren.push(element);
    }
  }
  return frameChildren;
};
```

So at render/query time, an element is "in" a frame if and only if `element.frameId === frame.id`. There is no live re-check against the frame's current bounds during normal rendering.

**Geometry only governs *edit-time transitions*** — deciding whether to *assign or clear* `frameId` when the user drags an element over/out of a frame, resizes a frame, pastes, duplicates, etc. The relevant predicate is:

```ts
export const elementOverlapsWithFrame = (element, frame, elementsMap) =>
  elementsAreInFrameBounds([element], frame, elementsMap) ||   // fully inside
  isElementIntersectingFrame(element, frame, elementsMap)   ||   // edges cross (straddling)
  isElementContainingFrame(element, frame, elementsMap);        // element fully contains the frame
```

`isElementIntersectingFrame` does line-segment intersection between the frame's boundary and the element's boundary — i.e. **any partial overlap counts**. So:

- **An element straddling a frame boundary** (partially inside, partially outside) is treated as *eligible* — dragging it partly over a frame's edge is enough for Excalidraw to assign it that frame's `frameId`. It is not required to be fully contained.
- Once assigned, at render/export time the frame clips its children to its own rectangle (children are drawn, then the frame is drawn over them and used as a clip mask — see §3), so the visually straddling part outside the frame gets clipped away in frame-scoped renders/exports, even though the element's own `x/y/width/height` still extend past the boundary.
- If an element is dragged fully outside a frame, or a frame is resized so an element no longer overlaps at all, the same "no longer overlapping" check (used in the frame's drag/resize handlers, e.g. `filterElementsEligibleAsFrameChildren`, `getElementsOverlappingFrame`) is what triggers the app to clear the element's `frameId` back to `null`.

Source (function excerpts): [`packages/element/src/frame.ts`](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/frame.ts) lines ~75-158 (`isElementIntersectingFrame`, `elementsAreInFrameBounds`, `elementOverlapsWithFrame`, `isElementContainingFrame`), ~450-501 (`filterElementsEligibleAsFrameChildren`).

Secondary/community corroboration (DeepWiki, an AI-generated but code-derived reference, labeled as such — not an official Excalidraw source): confirms frames "can clip their children during rendering and export," gated by a `frameRendering.enabled` app-state toggle, and that "children are drawn before the frame, allowing the frame to potentially wrap or clip them." (https://deepwiki.com/excalidraw/excalidraw/3.5-frames-and-containment)

---

## 3. Nesting and array-position meaning

**Nesting: no.** `filterElementsEligibleAsFrameChildren` in `frame.ts` explicitly filters out any frame-like element from becoming a child of another frame:

```ts
for (const element of elements) {
  // don't add frames or their children
  if (
    isFrameLikeElement(element) ||
    (element.frameId && otherFrames.has(element.frameId))
  ) {
    continue;
  }
  ...
}
```

This is the code path used when computing what a frame can absorb (drag/resize/paste). A frame element is unconditionally excluded from eligibility, and elements that already belong to a *different* frame are also excluded (a frame can't poach another frame's children). There is no code path found (searched `frameId`, `isFrameLikeElement`, nesting-related helpers) that allows a `frame`/`magicframe` element to carry a non-null `frameId` pointing at another frame. Excalidraw frames are single-level containers.

**Array order: yes, it is meaningful, and is a documented contract**, not an implementation detail you can ignore. Primary source, the official *developer* docs (not the end-user docs site):

> "Frames should be ordered where frame children come first, followed by the frame element itself:
> ```
> [
>   other_element,
>   frame1_child1,
>   frame1_child2,
>   frame1,
>   other_element,
>   frame2_child1,
>   frame2_child2,
>   frame2,
>   other_element,
>   ...
> ]
> ```
> If not ordered correctly, the editor will still function, but the elements may not be rendered and clipped correctly. Further, the renderer relies on this ordering for performance optimizations."

Source: [`dev-docs/docs/codebase/frames.mdx`](https://github.com/excalidraw/excalidraw/blob/master/dev-docs/docs/codebase/frames.mdx), published at `docs.excalidraw.com/docs/codebase/frames`.

Separately, each element also carries an `index: FractionalIndex | null` field (fractional-indexing string) which the codebase keeps "always kept in sync with the array order" (comment in `types.ts`) and uses for ordering during multiplayer reconciliation/undo-redo — but this is a derived/cache field, not an independent source of truth; array order is primary.

---

## 4. How a human navigates frame to frame while presenting

This is the area with the most divergence across surfaces (see also §5). Summary by product:

### excalidraw.com (free, open-source core)

**There is no built-in "Present"/slideshow mode.** A GitHub code search across the whole `excalidraw/excalidraw` TypeScript source for `"presentation"` returns only two incidental matches (`textWrapping.ts`, `interactiveScene.ts`), neither related to a slideshow feature. This was confirmed directly by an Excalidraw maintainer closing the original feature request:

> "We've completed integrating presentations into Excalidraw+ some time last year. Here are the types and uses: Online/live/real-time presentations... Slides: a simple slide deck with a shareable link... Export presentations to PDF/PPTX..."
> — maielo (Excalidraw team), closing comment on [Issue #253 "Presentation Mode"](https://github.com/excalidraw/excalidraw/issues/253), closed 2024-04-29.

So on free excalidraw.com, "navigating frame to frame" is manual, using generic (non-frame-specific) canvas tools:
- Select a frame (click its name label or border) and press **`Shift+2`** ("zoom to selection") to fit it to viewport.
- Open the **Search menu** (`Ctrl/Cmd+F`), which has a dedicated "frames" result category (`t("search.frames")`) — clicking a result pans/zooms to that frame.
- **Frame order in the Search menu is determined by canvas Y-position, ascending (top to bottom) — not name, not array order.** Primary source, `packages/excalidraw/components/SearchMenu.tsx`:
  ```ts
  const frames = elements.filter((el) => isFrameLikeElement(el)) as ExcalidrawFrameLikeElement[];
  ...
  frames.sort((a, b) => a.y - b.y);
  ```
  Source: [`packages/excalidraw/components/SearchMenu.tsx`](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/components/SearchMenu.tsx) (fetched raw, master branch).
- Generic zoom shortcuts also apply: `Shift+1` zoom-to-fit-all, `Shift+2` zoom-to-selection (community-documented, e.g. discussed in [excalidraw/excalidraw#770](https://github.com/excalidraw/excalidraw/pull/770) and [#3831](https://github.com/excalidraw/excalidraw/issues/3831); treat as secondary confirmation of well-known shortcuts, not quoted from an official shortcuts page — the `docs.excalidraw.com/docs/introduction/keybindings` URL 404'd when fetched directly).

### Excalidraw+ (paid product)

Native, purpose-built presentation feature, confirmed by the maintainer comment above and by the product page:

> "Excalidraw+ users can easily turn any set of drawings into a series of slides using the frame tool" — via Tools menu → "More tools" → "Frame tool".
Source: https://plus.excalidraw.com/use-cases/presentations

Per the maintainer's issue #253 comment, Excalidraw+ presentations include: live/real-time presenting with an invite link (voice supported), presenter control from mobile/laptop for projector use, a shareable async "Slides" deck link, and PDF/PPTX export. Presenter-notes/speaker-notes was, as of that 2024 comment, still on the roadmap ("planning to do it").

**Order determination in Excalidraw+ is explicitly *not* simply frame position or array order** — this is corroborated by an open, still-unresolved user complaint:

> "the current model of having frames on the canvas and organizing slides on a sidebar is fundamentally flawed... Adding a new slide on the sidebar adds a frame quite randomly on the canvas... Adding a frame on the canvas adds a new slide to the bottom of the sidebar... it is not really possible to have a canvas that reflects the order of the slides, or slides that reflect the way things are organized on the canvas."
Source: [Issue #8731](https://github.com/excalidraw/excalidraw/issues/8731) ("Remove traditional slides sidebar and use frames instead"), open as of research date. This is a user-filed issue, not a maintainer statement, but it directly describes observed product behavior, so it's treated as a reliable behavioral report, labeled accordingly. Conclusion: Excalidraw+ slide order is tracked by a **separate, explicit sidebar/slide-list ordering**, decoupled from both canvas position and the underlying `elements` array — i.e. a fourth ordering mechanism distinct from the three the ticket asked about (name / array / position).

### Desktop app

There is no current *official* desktop app. Excalidraw's own Electron wrapper (`excalidraw/excalidraw-desktop`) was deprecated in favor of the PWA:

> "After careful analysis... PWA is the future they want to build upon... the growing set of capabilities of the web platform can fulfill their use case."
Source: https://plus.excalidraw.com/blog/deprecating-excalidraw-electron (cross-referenced by https://web.dev/case-studies/deprecating-excalidraw-electron)

Behaviorally this means "desktop app" = same excalidraw.com/Excalidraw+ web app installed as a PWA, or an unofficial third-party Electron wrapper (e.g. community `excalidraw-desktop`/`excalidraw-x` forks) that just embeds the same web app — no distinct navigation model. Unknown/unverified: whether any specific unofficial wrapper adds its own presentation affordance; not investigated further as out of scope (these are unofficial, unmaintained-by-Excalidraw forks).

### Obsidian Excalidraw plugin

Ships a community-authored "Slideshow" script (an Excalidraw Automate script, `ea-scripts/Slideshow.md`, by the plugin author zsviczian) that works directly on plain `.excalidraw` frames — **no Excalidraw+ dependency**. Key behavior, quoted from the script's own documentation:

> "Frames are played in alphabetical order of their titles."

Auto-generated names for unnamed frames follow a `getFrameName(...)` helper producing `"Frame 01"`, `"Frame 02"`, etc., which — being zero-padded and sequential — happens to sort correctly if frames were created in canvas order, but any manual rename can silently reorder the deck.

**Presentation path override**: the script actually prioritizes, in order: (1) a selected arrow/line element (drawing an explicit path across frames overrides name-sorting), (2) a previously-set hidden presentation path, (3) falling back to all frames sorted alphabetically by name.

Navigation keys (from the same doc):
- Forward: `↓`, `→`, or `Space`
- Backward: `↑`, `←`
- Exit: `Backspace` or `Esc`
- Jump to last slide: `End`
- Re-focus current slide: `Home`
- Toggle fullscreen: `F`
- Edit current slide: `E`
- Plus UI prev/next buttons, a slide-picker dropdown, and a laser-pointer/pan toggle.

Source: [`ea-scripts/Slideshow.md`](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/master/ea-scripts/Slideshow.md), `zsviczian/obsidian-excalidraw-plugin`.

Known rough edges (community-reported, GitHub issue, not official docs): frames can become invisible after the slideshow script doesn't close cleanly, fixed by re-invoking "Excalidraw: Frame settings" from the command palette — [Issue #8857](https://github.com/excalidraw/excalidraw/issues/8857) (reported against the plugin, filed on the core repo; comment from a plugin community member cites the actual fix location in the plugin's own issue tracker).

### Direct answer to "what determines order"

| Surface | Ordering key | Source type |
|---|---|---|
| excalidraw.com Search-menu frame jump | canvas Y-position, ascending | primary (source code) |
| Excalidraw+ presentation/slide deck | explicit separate slide-list order (decoupled from canvas & array) | user-report, corroborated by maintainer's feature description |
| Obsidian plugin Slideshow script | frame `name`, alphabetical (unless an explicit path arrow/line is selected) | primary (plugin's own docs) |
| Raw file `elements` array order | **not** used for presentation order anywhere found; it *is* used for paint/clip order and multiplayer reconciliation (see §3) | primary (source + dev docs) |

---

## 5. Behavior differences summary (excalidraw.com vs Excalidraw+ vs desktop vs Obsidian)

- **excalidraw.com**: frame element and containment semantics as in §1–§3 apply everywhere (they're part of the shared open-source data model/engine). No native presenting; manual pan/zoom/search only, ordered by Y-position in Search.
- **Excalidraw+**: same underlying frame data model, plus a proprietary presentation layer (live presenting, PDF/PPTX export, shareable slide links) with its own decoupled slide ordering, sitting on top of — not replacing — the `frame` element type. Paid feature.
- **Desktop app**: no officially maintained distinct app; deprecated Electron wrapper was a plain shell around the web app. No behavioral differences beyond whatever a given unofficial third-party wrapper might bolt on (unverified).
- **Obsidian Excalidraw plugin**: full local, offline frame-to-slideshow presenter that works on the plain, Excalidraw+-independent `.excalidraw` frame element — but it's a community script bundled with the plugin, not something Excalidraw Inc. builds or maintains, and it uses its own alphabetical-by-name ordering rule that has nothing to do with excalidraw.com's own Y-position rule or Excalidraw+'s decoupled slide list.

---

## 6. Conventional frame sizing for presentations

- **Aspect ratio**: 16:9 is the de facto convention. Directly evidenced by a user bug report against Excalidraw+ itself: "When using frames to develop a presentation, it looks like the default frame is approx. 16:9 ratio. This presents well on the equivalent screen when using presentation mode... When exporting either a PDF or PPTX you are provided with a file in a 4:3 ratio" — i.e., Excalidraw+'s own presentation frames default to 16:9, while its PDF/PPTX exporter was (as of that report) still mismatched at 4:3. Source: [Issue #8509](https://github.com/excalidraw/excalidraw/issues/8509), filed against Excalidraw+, Sept 2024. Labeled as a **user report**, not an official spec page, since no official "here is the canonical frame size" doc was found.
- **No built-in size presets** as of research date — a separate open feature request confirms this gap: "Feature request: predefined frame sizes," e.g. "16:9 1080p or 4k" ([Issue #8751](https://github.com/excalidraw/excalidraw/issues/8751), open). So there is no dropdown/preset in the product; users type dimensions manually or drag.
- **Concrete pixel convention**: the Obsidian plugin's Slideshow script defaults its "print to PDF" export to **1920×1080** ("Click to print slides at 1920x1080 / Hold SHIFT to print the presentation as displayed" — [`ea-scripts/Slideshow.md`](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/master/ea-scripts/Slideshow.md)). This is the one concrete, sourced numeric convention found. A web-search-engine synthesis also surfaced "1600×900" as used by an unrelated third-party community tool (`excalidraw-slides`), but that specific figure could not be verified against the tool's own README (404 at fetch time) — **flag as unverified, do not treat as a real convention**.
- **Bottom line for sizing**: treat **16:9** as the reliable convention (corroborated twice, independently, by Excalidraw+ default behavior and by general presentation practice), and **1920×1080** as a reasonable concrete default (sourced from the Obsidian plugin's own PDF export default), but there is no single "canonical" pixel size mandated anywhere in official Excalidraw documentation — pick one and be consistent.

---

## Sources consulted

Primary (source code / official docs):
- `packages/element/src/types.ts` — https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/types.ts
- `packages/element/src/frame.ts` — https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/frame.ts
- `packages/excalidraw/components/SearchMenu.tsx` — https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/components/SearchMenu.tsx
- `dev-docs/docs/codebase/frames.mdx` (published as docs.excalidraw.com/docs/codebase/frames) — https://github.com/excalidraw/excalidraw/blob/master/dev-docs/docs/codebase/frames.mdx
- Excalidraw+ deprecating-Electron blog post — https://plus.excalidraw.com/blog/deprecating-excalidraw-electron
- Excalidraw+ presentations product page — https://plus.excalidraw.com/use-cases/presentations
- Obsidian plugin Slideshow script docs (author's own repo) — https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/master/ea-scripts/Slideshow.md

GitHub issues (maintainer/user reports, labeled where used):
- #253 Presentation Mode (closed, maintainer comment) — https://github.com/excalidraw/excalidraw/issues/253
- #8731 Remove slides sidebar, use frames (open, user report) — https://github.com/excalidraw/excalidraw/issues/8731
- #8857 slideshow frames not displayed (closed, community fix pointer) — https://github.com/excalidraw/excalidraw/issues/8857
- #6915 frames should behave like rectangles (open, user report) — https://github.com/excalidraw/excalidraw/issues/6915
- #8509 Excalidraw+ presentation export ratio mismatch (user report) — https://github.com/excalidraw/excalidraw/issues/8509
- #8751 predefined frame sizes feature request (open) — https://github.com/excalidraw/excalidraw/issues/8751

Secondary (labeled explicitly in text, used only to corroborate, never as sole source of a claim):
- DeepWiki (AI-generated, code-derived) frames-and-containment page — https://deepwiki.com/excalidraw/excalidraw/3.5-frames-and-containment

Unresolved/unverified (explicitly flagged, not used as claims):
- `docs.excalidraw.com/docs/introduction/keybindings` — 404 at fetch time; could not confirm an official end-user keyboard-shortcuts page listing frame-specific bindings for free excalidraw.com.
- "1600×900" as a community slide-size convention — surfaced only via a search-engine synthesis of `scastiel/excalidraw-slides`, whose README returned 404 when fetched directly; not verified.
- Whether any unofficial third-party Excalidraw desktop wrapper adds its own presentation/navigation affordance — not investigated, out of scope for the time budget.
