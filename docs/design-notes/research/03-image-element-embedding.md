# 03 — Image element embedding: JSON shape and practical limits

Research for `../issues/03-image-element-embedding.md`.

## Bottom line

- **SVG vs PNG for a shipped icon set: use SVG.** Excalidraw accepts `image/svg+xml` as a native mime type for image elements (confirmed in source: `IMAGE_MIME_TYPES`). An SVG is stored verbatim (base64 inside the `dataURL`) and drawn via the browser's own SVG rasterizer on each canvas redraw, so — unlike a fixed-resolution PNG — it doesn't visibly pixelate as you zoom in on a frame. Caveat: this is not airtight. There are real GitHub bug reports of SVGs coming out pixelated in specific paths (SVG *export*, and one plugin-specific canvas-redraw bug), so treat "always crisp" as "true for canvas display of a clean, well-formed SVG in current excalidraw.com," not an absolute guarantee in every code path. For a static icon set (simple shapes, no filters/masks weirdness) SVG is the safer choice; fall back to PNG only for photographic/raster source art.
- **Payload budget for a 20-slide deck:** there's no documented hard cap on scene JSON size, but two real ceilings bite in practice: (1) **browser `localStorage`** is what excalidraw.com autosaves the current scene into, with a practical quota around 5–10 MB depending on the browser — a scene whose serialized JSON (elements + base64 files) exceeds that silently fails to autosave (`QuotaExceededError`) and can lose work; (2) the **live-collaboration file-sync path** caps each individual file upload at `FILE_UPLOAD_MAX_BYTES = 4 MiB` (source-verified). Base64 encoding inflates raw bytes by ~33%, so keep each *source* image well under ~1–2 MB (a few hundred KB is comfortable) and keep the total embedded-asset budget for a 20-slide deck under roughly 3–4 MB of base64 (~2.5–3 MB of source assets) to stay safely inside the localStorage ceiling with headroom for the element JSON itself. SVGs for icons are cheap (a few KB each) and barely dent this budget — that's the second reason to prefer them over raster icons.

---

## 1. JSON shape of an `image` element and its link to `files`

Primary source: `packages/element/src/types.ts` in `excalidraw/excalidraw` (GitHub, `master` branch).

```typescript
export type ExcalidrawImageElement = _ExcalidrawElementBase &
  Readonly<{
    type: "image";
    fileId: FileId | null;
    /** whether respective file is persisted */
    status: "pending" | "saved" | "error";
    /** X and Y scale factors <-1, 1>, used for image axis flipping */
    scale: [number, number];
    /** whether an element is cropped */
    crop: ImageCrop | null;
  }>;

export type FileId = string & { _brand: "FileId" };

export type ImageCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
};
```

`_ExcalidrawElementBase` supplies the standard shared fields every element has: `id`, `x`, `y`, `width`, `height`, `angle`, `strokeColor`, `backgroundColor`, `fillStyle`, `strokeWidth`, `strokeStyle`, `roughness`, `opacity`, `groupIds`, `frameId`, `index`, `roundness`, `seed`, `version`, `versionNonce`, `isDeleted`, `boundElements`, `updated`, `link`, `locked`.

The element links to the scene's `files` map purely by `fileId` — the file bytes are never inlined in the element itself. `scale` handles flip (`[-1,1]` etc.), not resizing (resizing is just `width`/`height`). `crop` is `null` unless the user has cropped the image in-app, in which case it stores the crop rectangle in the image's *natural* (unscaled) pixel space.

Ground truth from a real file on this machine, `/Users/bruno/Downloads/AI Architecture.excalidraw` (5.2 MB, 265 elements, 24 image elements, 5 distinct files):

```json
{
  "id": "KOwoFa3d90DqRSNYUQ6N1",
  "type": "image",
  "x": 422.3351134023319,
  "y": 422.2960496661125,
  "width": 119.57421875,
  "height": 119.57421875,
  "angle": 0,
  "fileId": "cdf98e2692de1886214c18100033d7ddf7b94375",
  "status": "saved",
  "scale": [1, 1],
  "crop": null
}
```
All 24 image elements in that file had `status: "saved"`, `scale: [1,1]`, and `crop: null` — i.e. real-world excalidraw.com output is much simpler than the type allows for.

Source: [`packages/element/src/types.ts`](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/types.ts) (fetched via raw.githubusercontent.com); local file `/Users/bruno/Downloads/AI Architecture.excalidraw`.

## 2. Shape of a `files` entry, and `fileId` derivation

Primary source: `packages/excalidraw/types.ts`.

```typescript
export type DataURL = string & { _brand: "DataURL" };

export type BinaryFileData = {
  mimeType:
    | ValueOf<typeof IMAGE_MIME_TYPES>
    | typeof MIME_TYPES.binary;
  id: FileId;
  dataURL: DataURL;
  /** Epoch timestamp in milliseconds */
  created: number;
  /** Indicates when the file was last retrieved from storage to be loaded onto the scene */
  lastRetrieved?: number;
  version?: number;
};

export type BinaryFiles = Record<ExcalidrawElement["id"], BinaryFileData>;
```

Ground truth, the `files` entry matching the element above:

```json
{
  "mimeType": "image/png",
  "id": "cdf98e2692de1886214c18100033d7ddf7b94375",
  "dataURL": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABAAAAAQACAYAAA...",
  "created": 1780408571062,
  "lastRetrieved": 1780408571062
}
```
`dataURL` is a standard `data:` URI: `data:<mimeType>;base64,<payload>` — the raw file bytes, base64-encoded, no extra Excalidraw-specific wrapping. All 5 files in that sample carried `dataURL`s from 759 KB to 1.15 MB.

**`fileId` derivation** — `packages/excalidraw/data/blob.ts`, function `generateIdFromFile`:
```typescript
const hashBuffer = await window.crypto.subtle.digest(
  "SHA-1",
  await blobToArrayBuffer(file),
);
return bytesToHexString(new Uint8Array(hashBuffer)) as FileId;
```
with a fallback if `crypto.subtle` is unavailable:
```typescript
catch (error: any) {
  console.error(error);
  // length 40 to align with the HEX length of SHA-1 (which is 160 bit)
  return nanoid(40) as FileId;
}
```
So `fileId` is normally a **SHA-1 hex digest of the file's raw bytes** (40 hex chars) — a genuine content hash, which gives automatic dedup (same bytes ⇒ same id) — with a random 40-char `nanoid` fallback that intentionally matches SHA-1's length so downstream code doesn't need to special-case it. This matches the ground truth: all 5 fileIds in the sample file are 40 lowercase-hex characters.

**Does Excalidraw reject a mismatched id?** No evidence of validation found. `loadSceneOrLibraryFromBlob` and the scene-restore path parse and load `files`/`elements` without recomputing or checking the hash against `dataURL` content — a `fileId` is trusted as an opaque key, so nothing stops a hand-authored file from using an arbitrary string (Excalidraw itself just won't produce one that way).

Source: [`packages/excalidraw/types.ts`](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/types.ts), [`packages/excalidraw/data/blob.ts`](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/data/blob.ts) (both fetched via raw.githubusercontent.com); local file ground truth as above.

## 3. Accepted mime types; does SVG stay vector or get rasterised?

Primary source: `packages/common/src/constants.ts`:
```typescript
export const IMAGE_MIME_TYPES = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
  jfif: "image/jfif",
} as const;
```
So: SVG, PNG, JPEG, GIF, WebP, BMP, ICO, AVIF, JFIF are all valid `mimeType` values for a `files` entry.

**Vector vs rasterised**: an imported SVG is *not* converted into native Excalidraw vector primitives (rectangle/line/path elements) — it becomes an `image` element whose `files` entry has `mimeType: "image/svg+xml"` and whose `dataURL` carries the original SVG XML, base64-encoded, unmodified. On canvas, the browser decodes that data URL through its normal SVG rasteriser and Excalidraw draws it into the 2D canvas via `drawImage` (confirmed general pattern in `packages/excalidraw/renderer/staticScene.ts`, which uses `context.drawImage(...)` for image-like content, and an `imageCache` referenced in `packages/excalidraw/scene/types.ts` that holds decoded `HTMLImageElement`s per file). Because SVG has no fixed intrinsic pixel resolution, each redraw re-rasterises at the size Excalidraw's renderer requests (which tracks zoom) — practically, this behaves close to "stays crisp while zooming," unlike a PNG/JPEG whose bitmap resolution is fixed at import time.

This is *not* an absolute guarantee, though:
- On **SVG export**, GitHub issue [#7767](https://github.com/excalidraw/excalidraw/issues/7767) ("svg export returns pixelated images for SVG inserts") reports a copy-pasted SVG being embedded as a pixelated raster in the *exported* SVG file — root-caused in that thread to the source SVG-editing tool (Inkscape) emitting a malformed SVG, not to Excalidraw rasterising by design; the reporter's own conclusion: "browsers render the svg correctly." Still, it shows fragility with certain SVG inputs.
- Community/forum reports (not verified against source, flag as such) describe imported SVGs behaving "similar to raster images" in that they can only be moved/resized as one block rather than edited element-by-element (source: [GitHub Discussion #6082](https://github.com/excalidraw/excalidraw/discussions/6082), [Issue #1924](https://github.com/excalidraw/excalidraw/issues/1924)) — true, but this is about *editability*, not pixel quality.
- One plugin-specific bug ([excalidraw/excalidraw #6650](https://github.com/excalidraw/excalidraw/issues/6650)) reports SVG blurriness after an update, but that's in the third-party Obsidian-Excalidraw plugin, a different codebase, not excalidraw.com — kept here as a caution, not evidence against excalidraw.com itself.

**Verdict**: on excalidraw.com's canvas, an embedded SVG is stored and rendered as a vector-sourced raster (browser rasterises the SVG fresh on each draw call, so it scales cleanly instead of showing fixed-resolution pixels) but is *not* an editable Excalidraw vector shape, and there are known edge-case bugs around export fidelity. For a shipped icon set with clean, simple SVGs, this is reliable in practice; don't assume every third-party or complex SVG round-trips perfectly through export.

Source: [`packages/common/src/constants.ts`](https://github.com/excalidraw/excalidraw/blob/master/packages/common/src/constants.ts), [`packages/excalidraw/renderer/staticScene.ts`](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/renderer/staticScene.ts), [`packages/excalidraw/scene/types.ts`](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/scene/types.ts); GitHub issues [#7767](https://github.com/excalidraw/excalidraw/issues/7767), [#6082](https://github.com/excalidraw/excalidraw/discussions/6082), [#1924](https://github.com/excalidraw/excalidraw/issues/1924) (forum/community evidence, labeled).

## 4. File-size behaviour and hard caps

No single documented "max scene size" exists in the docs. What's real, source-verified:

- **`FILE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024` (4 MiB)** — `excalidraw-app/app_constants.ts`, with the comment "should be aligned with MAX_ALLOWED_FILE_BYTES." This is the cap `encodeFilesForUpload` (`excalidraw-app/data/FileManager.ts`) enforces **per individual file** when syncing embedded files through excalidraw.com's live-collaboration/Firebase storage path — exceeding it throws `t("errors.fileTooBig", { maxSize: "4MB" })`. This governs sharing/collab, not local single-user editing.
- **`localStorage` quota (~5–10 MB depending on browser)** is what excalidraw.com uses to autosave the working scene (elements + appState) between sessions; binary files/library items go through IndexedDB instead (source: community/DeepWiki summary of the storage architecture, cross-checked against the app's known local-persistence design — labeled as secondary-source-derived, not line-quoted from source in this pass). When the serialized state exceeds the browser's localStorage quota, the save throws `QuotaExceededError`, Excalidraw sets a `localStorageQuotaExceededAtom` flag and shows an alert — it does **not** hard-refuse to load an existing scene, but new edits silently stop persisting locally until the payload shrinks. See GitHub issues [#8395](https://github.com/excalidraw/excalidraw/issues/8395) ("Going over the local storage limit ... can lead to unintended data loss") and [#711](https://github.com/excalidraw/excalidraw/issues/711) ("Migrate away from localStorage").
- No evidence found of a documented **hard cap distinguishing Excalidraw+ (paid) from the free excalidraw.com app** for embedded-image size — searches turned up only third-party pricing-comparison sites (not primary sources, not cited as fact here) and no official statement. Treat "Excalidraw+ has higher per-file caps" as **unconfirmed**.
- Performance guidance (source: GitHub Discussion [#8913](https://github.com/excalidraw/excalidraw/discussions/8913), a maintainer comment): there's no hard canvas/element-count limit — it depends on "the browser and client machine" — but the recommendation is to keep a scene to "a few thousand elements" for smooth performance. 24 image elements / 5 files / 5.2 MB (our sample file) loaded and behaved normally.
- An older/related report ([Issue #9485](https://github.com/excalidraw/excalidraw/issues/9485)) shows a user hitting a "File is too large. The maximum permitted size is 3MB" error on paste in some historical version — consistent with there having been a smaller per-image cap before/aside from the current 4 MiB collab constant; exact origin of that 3 MB figure wasn't pinned down to a specific current source file in this pass.

Practical rule of thumb for this project: keep total embedded-asset payload (base64, summed across `files`) for a deck comfortably under ~3–4 MB, and no single raster asset over ~1–2 MB pre-base64, to stay clear of both the collab 4 MiB per-file cap and the localStorage autosave ceiling.

Source: [`excalidraw-app/app_constants.ts`](https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/app_constants.ts), [`excalidraw-app/data/FileManager.ts`](https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/data/FileManager.ts), [`excalidraw-app/data/index.ts`](https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/data/index.ts); GitHub issues/discussions [#8395](https://github.com/excalidraw/excalidraw/issues/8395), [#711](https://github.com/excalidraw/excalidraw/issues/711), [#8913](https://github.com/excalidraw/excalidraw/discussions/8913), [#9485](https://github.com/excalidraw/excalidraw/issues/9485) (community reports, labeled).

## 5. Does an embedded image survive a round trip (open/edit/save)?

Not independently tested live in this pass (out of scope for the 10-minute budget), but the data model supports lossless round-tripping by design: the `files` entry stores the original `dataURL` bytes verbatim and is keyed by content hash; as long as the element's `fileId` still resolves to an entry in `files`, opening, editing unrelated elements, and re-saving/exporting the `.excalidraw` JSON does not require re-encoding the image — it's just carried through as an opaque base64 blob referenced by id. `BinaryFileData.lastRetrieved` (optional) exists specifically to track when a file was last pulled from storage, which is consistent with a cache/retrieval model rather than a re-encode-on-save model. Local evidence: the sample file's 5 `files` entries all show `created === lastRetrieved`, meaning the export snapshot's retrieval timestamp equals the original creation timestamp — i.e. this particular export did not touch/re-fetch the files since creation.

The known failure mode isn't re-encoding — it's the `status: "pending"` / `"error"` states in `ExcalidrawImageElement`, which exist because a file can become orphaned (e.g. `fileId` present in an element but missing from `files`, common when only elements — not files — get copy-pasted between scenes, or a library item references a file that wasn't vendored along with it). That's a "survives roundtrip on the same file" story, not a re-encoding one.

Source: type definitions and field semantics as in §1–2 above; no live browser test performed (flagged as unverified empirically, only via source/data-model reasoning).

## 6. `.excalidrawlib` format, library items vs scene elements, and vendoring

**File-level format** (confirmed via search results cross-referencing DeepWiki's structural summary of `excalidraw/excalidraw-libraries`, and the `LibraryItem` type from the main repo, fetched directly):
```json
{
  "type": "excalidrawlib",
  "version": 2,
  "source": "https://excalidraw.com",
  "libraryItems": [ /* LibraryItem[] */ ]
}
```
`version: 1` libraries used a legacy format (a plain array of element-arrays, no `LibraryItem` wrapper); current format is `version: 2`.

**`LibraryItem` type**, `packages/excalidraw/types.ts` (source-verified):
```typescript
/** v2 library item */
export type LibraryItem = {
  id: string;
  status: "published" | "unpublished";
  elements: readonly NonDeleted<ExcalidrawElement>[];
  /** timestamp in epoch (ms) */
  created: number;
  name?: string;
  error?: string;
};
export type LibraryItems = readonly LibraryItem[];
```
So a library item is a thin wrapper: `{ id, status, created, elements[], name? }` — `elements` is a plain array of ordinary `ExcalidrawElement` objects (the same shapes used in a scene's top-level `elements` array), not some separate schema. Note there's no `files` map inside a `LibraryItem` or `.excalidrawlib` — if a library item includes an `image` element, its `fileId` needs a matching `files` entry supplied through some other channel (the app associates library preview images separately); vendoring an image-bearing library item is not purely self-contained JSON concatenation unless the files map travels with it too.

**Is vendoring a library item into a scene "just concatenation with id regeneration"?** Yes, confirmed directly in source. `packages/excalidraw/components/LibraryMenuItems.tsx`, the insert-onto-canvas path:
```typescript
elements: duplicateElements({
  type: "everything",
  elements: item.elements,
  randomizeSeed: true,
  preserveFrameChildrenOrder: true,
}).duplicatedElements,
```
with the code comment: *"duplicate each library item before inserting on canvas to confine ids and bindings to each library item. See #6465."* So: yes — inserting a library item is element-array concatenation onto the scene's `elements`, with `duplicateElements(..., randomizeSeed: true)` regenerating element `id`s (and re-seeding, to avoid Rough.js rendering collisions) and remapping internal bindings so the library copy doesn't collide with, or accidentally re-link to, anything already on the canvas. This confirms the ticket's hypothesis directly from source, not by inference.

Source: [`packages/excalidraw/types.ts`](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/types.ts) (LibraryItem, source-verified), [`packages/excalidraw/components/LibraryMenuItems.tsx`](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/components/LibraryMenuItems.tsx) (source-verified insertion/duplication logic); `.excalidrawlib` top-level shape via [DeepWiki: Library Files (.excalidrawlib)](https://deepwiki.com/excalidraw/excalidraw-libraries/2.2-library-files-(.excalidrawlib)) (secondary source summarizing the `excalidraw-libraries` repo — labeled, not independently re-verified against raw JSON in this pass).

---

## Minimal literal example (image element + matching `files` entry)

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [
    {
      "id": "KOwoFa3d90DqRSNYUQ6N1",
      "type": "image",
      "x": 100,
      "y": 100,
      "width": 120,
      "height": 120,
      "angle": 0,
      "fileId": "cdf98e2692de1886214c18100033d7ddf7b94375",
      "status": "saved",
      "scale": [1, 1],
      "crop": null
    }
  ],
  "files": {
    "cdf98e2692de1886214c18100033d7ddf7b94375": {
      "mimeType": "image/png",
      "id": "cdf98e2692de1886214c18100033d7ddf7b94375",
      "dataURL": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
      "created": 1780408571062,
      "lastRetrieved": 1780408571062
    }
  }
}
```
(`fileId`, `dataURL` prefix, and timestamps taken from a real image element/file pair in `/Users/bruno/Downloads/AI Architecture.excalidraw`, with `x`/`y`/`width`/`height` simplified for readability.)
