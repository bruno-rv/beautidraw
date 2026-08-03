# 09 — Which Excalidraw surface is the deck actually presented on?

Type: grilling
Status: resolved
Blocked by: —
Parent: ../map.md

## Question

Surfaced by ticket 02, which invalidated an assumption the map was charted on.

The map's delivery constraint reads "live frame navigation inside Excalidraw", and export was ruled out of scope on that basis. Research then established that **free excalidraw.com has no presentation mode at all** — presenting is an Excalidraw+ feature. On the free app, "navigating frames" means Ctrl/Cmd+F Search-menu jumps or hand zooming, in front of an audience.

So: where does Bruno actually stand when presenting?

- **Excalidraw+** (paid) — real slide presentation exists. Does he have it? If yes, the map's delivery constraint stands unchanged and the generator targets Excalidraw+'s slide-list ordering.
- **Free excalidraw.com** — accept manual navigation as the presenting experience, or reconsider whether export back into scope is the honest answer.
- **Obsidian Excalidraw plugin** — has a community Slideshow script that sorts frames alphabetically by name. A real presentation mode, free, but binds the deck to Obsidian.

Whatever the answer, the generator can hedge cheaply: zero-padded numeric frame-name prefixes plus a top-to-bottom Y layout make alphabetical order and Y-position order agree, satisfying both the Obsidian script and the excalidraw.com Search menu. That mitigation should go in regardless — the decision here is about which surface the *design* targets and whether PNG/PDF export comes back off the out-of-scope list.

## Answer

Bruno: *"I will not really present, but just open the file and 'present' it, meaning no presenter mode needed."*

**No presenter mode is required.** The artifact is the canvas. A human opens the `.excalidraw` file and pans and zooms through it by hand. Nobody stands in front of an audience driving a slideshow.

Consequences:

- **No Excalidraw+ dependency.** Free excalidraw.com is the target surface, and the absence of a native presentation mode there costs nothing.
- **The map's delivery constraint stands, and firms up.** It is no longer "under review".
- **PNG/PDF/HTML export stays out of scope.** It was only ever a candidate to return if presenter mode were needed; it is not.
- **The frame-name/Y-position ordering mitigation from ticket 02 loses most of its urgency.** It costs nothing, so keep it as a convention, but no design decision now hangs on satisfying three surfaces' sort orders.

**What this exposes instead**: if there is no slideshow, "presentation" may not mean frame-per-slide at all. The example file Bruno supplied has zero frames — see ticket 10, which is now the live question.
