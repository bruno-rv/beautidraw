# 03 — Image element and the `files` map

Type: research
Status: resolved
Blocked by: —
Parent: ../map.md

## Question

How are raster and SVG assets embedded in an `.excalidraw` file, and what are the practical limits?

Specifically:

- The JSON shape of an `image` element and its link to the file's `files` map (`fileId`, `status`, `scale`, `crop`?).
- The shape of a `files` entry: `mimeType`, `dataURL` encoding, `created`, `lastRetrieved`, and how `fileId` is derived (content hash? arbitrary?).
- Which mime types Excalidraw accepts, and specifically whether an SVG stays vector on canvas or is rasterised.
- File-size behaviour: how much base64 payload a deck can carry before excalidraw.com becomes sluggish or refuses to load, and whether there is a hard cap.
- Whether an embedded image survives a round trip through excalidraw.com (open, edit, save) without re-encoding.
- What `.excalidrawlib` libraries are at the file level, how a library element differs from a scene element, and whether vendoring a library into a scene is just element concatenation.

Findings go in `../research/03-image-element-embedding.md`.

## Answer

Full findings: `../research/03-image-element-embedding.md`. Verified against the `excalidraw/excalidraw` source and against a real 265-element file on this machine (`~/Downloads/AI Architecture.excalidraw`, 24 image elements, 5 files entries).

**Image element**: `{type:"image", fileId, status:"pending"|"saved"|"error", scale:[x,y], crop:ImageCrop|null}` plus the usual base element fields.

**Files entry**: `{mimeType, id, dataURL, created, lastRetrieved?, version?}`.

**`fileId` is the SHA-1 hex digest of the raw file bytes** (`crypto.subtle.digest("SHA-1", …)`, falling back to `nanoid(40)`). Nothing validates it — it is trusted as an opaque key — but the generator should compute it properly anyway so identical assets dedupe across a deck instead of bloating it.

**SVG is accepted** (alongside png, jpg, gif, webp, bmp, ico, avif, jfif). It is stored verbatim and re-rasterised by the browser on every canvas redraw — so it scales cleanly in practice, but it does not become editable vector primitives on the canvas. Issue #7767 records pixelation edge cases with malformed source SVGs, so "always crisp" is not an absolute guarantee — a normalisation step over vendored SVGs (ticket 08) is worth the effort.

**Size ceilings** — no documented global cap, but two real ones:
- `FILE_UPLOAD_MAX_BYTES = 4 MiB` per file, for live-collab sync.
- Browser `localStorage` autosave quota (~5–10 MB), which fails *silently* with `QuotaExceededError` rather than refusing to load. This is the dangerous one: a deck can look fine and quietly stop autosaving.

**Budget**: keep total embedded payload for a 20-slide deck under ~3–4 MB base64. Base64 inflates ~33%, so plan against the encoded size, not the file size on disk.

**Round trip**: not empirically tested. The data model (content-hash key + opaque `dataURL`) implies lossless round trips; the realistic failure mode is orphaning (`status:"error"`), not re-encoding. Flagged as unverified — worth one real test during build-out.

**`.excalidrawlib`**: `{type:"excalidrawlib", version:2, source, libraryItems:[{id, status, elements, created, name?, error?}]}`. Library `elements` are ordinary scene elements, and vendoring is literal concatenation through `duplicateElements({elements, randomizeSeed:true})` — ids and seeds get regenerated to avoid collisions. So shipping vector components as a library and splicing them into a deck is cheap and needs no special format handling.

**Consequence for ticket 07**: SVG is the recommended format for the shipped icon set — smallest payload, resolution-independent, and the only format where recolouring to a deck palette is even conceivable (by rewriting `fill`/`stroke` in the SVG source before encoding). Whether to actually do that recolouring is 07's call.
