# Headless render path that respects frames

Research ticket: `../issues/04-headless-render-path.md`

## Bottom line

**Extend the existing local mechanism** (`~/.claude/skills/excalidraw-diagram/references/render_excalidraw.py`: Python + Playwright + headless Chromium, driving `@excalidraw/excalidraw`'s own `exportToSvg` inside a local HTML harness) rather than adopting a community CLI or driving excalidraw.com.

The decisive fact: `exportToCanvas`, `exportToBlob`, and `exportToSvg` — all three, exported directly from the **`@excalidraw/excalidraw`** npm package itself (not the stale `@excalidraw/utils`) — accept an **`exportingFrame: ExcalidrawFrameLikeElement | null`** option. Pass the full `elements` array plus the one frame element you want, and Excalidraw's own renderer filters to that frame's children and clips to its bounds. This is the real per-frame primitive; the current local script doesn't use it (it bounding-boxes the whole scene instead), but the fix is small — it already has the Playwright+browser+esm.sh plumbing this parameter needs, since these export functions require a DOM (canvas/SVG) and cannot run in bare Node.

Recommended setup command (mirrors the existing skill's pattern, no new dependency ecosystem):
```
cd ${CLAUDE_PLUGIN_ROOT}/skills/<this-skill>/references
uv sync
uv run playwright install chromium
```
Then loop `for frame in frame_elements: exportToSvg({ elements: allElements, appState, files, exportingFrame: frame })` inside **one** Playwright page/browser session (not one browser launch per frame) to amortize the ~1-3s cold-start and the esm.sh module fetch across all frames in a deck.

Required code change beyond today's script: (1) don't bbox the whole scene — enumerate `elements` where `type === "frame"` (or `"magicframe"`), (2) call `renderDiagram` once per frame passing `exportingFrame`, (3) size the viewport to that frame's own `width`/`height` instead of the scene bbox, (4) do this in a loop within a single page load instead of one process invocation per frame.

## Comparison table

| Path | a. Per-frame render | b. Embedded `files` images | c. Faithful hand-drawn fonts | d. Install footprint | e. ~20-frame render time |
|---|---|---|---|---|---|
| **Local script + `exportingFrame`** (recommended) | **Yes, natively** — official `exportingFrame` param | Yes — `files` param passed straight to `exportToSvg`, same as today's script already does for the whole scene | Yes by default — `exportToSvg` inlines Excalifont/Virgil font data into the SVG unless `skipInliningFonts: true` is passed | Python 3.11+, `uv`, Playwright's Python package, one headless Chromium binary (~150-300MB). No Node/npm needed locally — JS lib is fetched live from esm.sh inside the browser at render time (needs network) | Not benchmarked. Estimate: ~2-4s one-time browser+module cold start, then well under 1s/frame for simple decks if batched in one session — untested, treat as a guess |
| `@excalidraw/excalidraw` export utils via Playwright, general | Yes, same `exportingFrame` mechanism as above — this row is the same underlying API as the recommended row, just framed generically | Yes | Yes (see above) | Requires a DOM — cannot run in bare Node without a browser or DOM shim (jsdom won't cover canvas/SVG rendering faithfully). Playwright/Chromium (or Puppeteer) is the practical requirement either way | Same estimate as above — this is the same mechanism |
| `@excalidraw/utils` npm package | Unknown/unverified — package is essentially dormant | Unknown | Unknown | N/A — **do not use**: latest version is a `0.1.3-test32` prerelease published 2025-04-24, 38 versions total, all pre-release-looking tags. The real export API lives in `@excalidraw/excalidraw` (0.18.1, published 2026-04-20) instead | N/A |
| Community CLI: `tommywalkie/excalidraw-cli` | Not documented in README | Not documented | Not documented; uses **node-canvas + RoughJS reimplementation**, not Excalidraw's real renderer, so font/style fidelity is inherently at risk | Node + `node-canvas` native build (needs cairo/pango system libs; Alpine needs python/g++/cairo-dev) | Unknown |
| Community CLI: `excalirender` (`JonRC/excalirender`) | **Yes** — documented `-f/--frame <name>` flag | Not documented in README | Not documented; claims to use "the same libraries Excalidraw uses" but unverified | Standalone Bun-compiled binary or Docker image — no Python/Node install needed by the caller | Unknown |
| `excalidraw-render-mcp` (`bassimeledath/...`) | Not documented — no frame-specific option mentioned | Not documented | Not documented | Headless Chromium via Playwright, screenshots the SVG element (same technique as the local script) | Unknown |
| `excalidraw-brute-export-cli` (`realazthat/...`) | **No** — whole-file export only per README, no per-frame flag | Not documented | Not explicitly claimed but plausible (drives real Excalidraw export code in a real browser) | `npm install -g`, then `npx playwright install-deps && npx playwright install firefox`. Actively maintained (CI badge, v0.4.0, tested on Node 18-22) | Unknown |
| Driving excalidraw.com under Playwright | Would require replicating the app's own UI-driven single-frame export flow (file import + frame select + export dialog) — fragile, not evaluated in depth | Depends on the app's own import path for `files` | Yes (real production app) | Playwright + Chromium, no local Excalidraw JS dependency — but depends on a third-party website staying available/unchanged, and on faking file-import UI interactions headlessly | Unknown, and the network dependency on a third party plus UI automation brittleness make this the weakest candidate |

Everything under "Unknown" above is genuinely unverified — READMEs for the small/single-maintainer CLIs (`excalidraw-cli` on npm 0.0.2 published 2026-02-11, `@vraksha/excalidraw-cli` 0.6.0 published 2025-12-16, `@moona3k/excalidraw-export` 0.2.1 published 2026-02-06) do exist and are recent, but time budget did not allow deep-diving their source for frame/font/image handling, and none surfaced with meaningfully more traction (stars/downloads) than the Playwright-based options.

## Local ground truth: `render_excalidraw.py`

Read directly from `/Users/bruno/.claude/skills/excalidraw-diagram/references/`.

**Mechanism**: Python script uses `playwright.sync_api` to launch headless Chromium, navigates to a local `render_template.html` file (`file://` URL), waits for `window.__moduleReady`, then calls `window.renderDiagram(json)` via `page.evaluate()`. That JS function (defined inline in `render_template.html`) does:
```js
import { exportToSvg } from "https://esm.sh/@excalidraw/excalidraw?bundle";
const svg = await exportToSvg({ elements, appState: { ...appState, exportBackground: true }, files });
```
The resulting `SVGSVGElement` is appended to `#root`, then Playwright does `page.query_selector("#root svg").screenshot(path=...)` — an **element screenshot of the injected SVG**, not `exportToBlob`/canvas and not a full-page screenshot.

**Dependencies**: `pyproject.toml` declares only `playwright>=1.40.0` (Python package), managed via `uv` (there's a `uv.lock`). First-run setup per the script's own docstring:
```
uv sync
uv run playwright install chromium
```
No local Node/npm install — the Excalidraw JS bundle is pulled from the `esm.sh` CDN **at render time, inside the browser**, meaning every invocation needs network access and is not fully offline/hermetic.

**Frame handling: none.** `compute_bounding_box()` iterates every non-deleted element in `data["elements"]` uniformly (including `frame`-type elements, which it treats like any other element with x/y/width/height) to build one scene-wide bounding box. There is no filtering by `type == "frame"`, no `frameId` grouping, no `exportingFrame` parameter passed to `exportToSvg`, and no CLI flag to select a frame. It renders the **entire scene** as a single image, using the union bounding box + 80px padding as the viewport. Confirmed by full read of the script (`compute_bounding_box`, `render()`) and `render_template.html`'s `renderDiagram()` — neither ever inspects frame membership.

## Candidate A: `@excalidraw/excalidraw` export utils via Playwright (recommended direction)

- **Per-frame**: native support via `exportingFrame` on all three functions (`exportToCanvas`, `exportToBlob`, `exportToSvg`), confirmed from the current TypeScript signatures on Excalidraw's own docs mirror:
  ```ts
  function exportToSvg(options: {
    elements: readonly NonDeleted<ExcalidrawElement>[];
    appState?: Partial<AppState>;
    files?: BinaryFiles;
    exportPadding?: number;
    renderEmbeddables?: boolean;
    exportingFrame?: ExcalidrawFrameLikeElement | null;
    skipInliningFonts?: true;
    reuseImages?: boolean;
  }): Promise<SVGSVGElement>
  ```
  `exportToCanvas`/`exportToBlob` carry the same `exportingFrame` option. Pass the **full** elements array (so the renderer can resolve frame membership/clip children correctly, per Excalidraw's documented invariant that "frame children must appear before their parent frame in the elements array") and set `exportingFrame` to the one frame element you want rendered; the library filters and clips to that frame automatically. This supersedes doing your own bbox-crop.
- **Embedded images**: `files` (a `BinaryFiles` map, same shape the local script already threads through) is a first-class parameter on all three export functions — this is exactly what today's script already passes, just needs to keep working once per-frame export is added.
- **Fonts**: `exportToSvg` inlines font data into the SVG by default; you'd have to explicitly pass `skipInliningFonts: true` to *not* get faithful Excalifont/Virgil rendering. No evidence found that it silently falls back to a system font in normal use.
- **Node vs. browser**: these functions manipulate real `HTMLCanvasElement`/`SVGSVGElement` DOM objects — they require a DOM. They do **not** run in bare Node. Playwright/Chromium (what the local script already does) or an equivalent browser context is required either way.
- **Package**: import from `@excalidraw/excalidraw` (latest `0.18.1`, published 2026-04-20 — actively maintained), not `@excalidraw/utils` (see below — effectively abandoned).
- **Install footprint**: unchanged from what the local script already needs — Python + `uv` + Playwright + one Chromium binary — since the JS is loaded from esm.sh inside the browser rather than installed via npm. (An alternative, more hermetic variant would `npm install @excalidraw/excalidraw` and bundle it locally instead of hitting esm.sh at render time, trading a Node/npm install step for offline reliability — worth considering if network flakiness during rendering becomes a problem, but not required to get per-frame rendering working.)
- **Timing**: not benchmarked by this research (explicitly out of scope given the no-install constraint). For a 20-frame deck, the dominant one-time costs are browser launch (~1-2s) and the esm.sh module fetch (~1-2s on first load); each subsequent `exportToSvg` call within the same page should be well under a second for typical slide complexity if the loop reuses one browser/page instance. This is an estimate, not a measurement — flag as unverified until actually timed.

## Candidate B: `@excalidraw/utils` npm package

Effectively dead/pre-release-only: latest published version is `0.1.3-test32` (2025-04-24), and the full version history (38 entries) is all test/prerelease tags — there's no evidence of a stable 1.x. The real, maintained export API lives directly in `@excalidraw/excalidraw`. **Do not build on `@excalidraw/utils`.**

## Candidate C: Community CLIs

All are small, single-or-few-maintainer projects; none has meaningfully more adoption than rolling your own on top of Candidate A, and several are explicitly reimplementations rather than wrappers around Excalidraw's real renderer (fidelity risk):

- `tommywalkie/excalidraw-cli` — **stale**: last push 2023-01-09. Uses `node-canvas` + RoughJS to *reimplement* Excalidraw's rendering rather than call the real library, so visual/font fidelity is not guaranteed to match Excalidraw proper. No documented frame support.
- `excalirender` (`JonRC/excalirender`) — actively pushed (2026-02-10), small (34 stars, 2 open issues), ships as a Bun-compiled binary/Docker image. **Notable**: README documents a `-f/--frame <name>` flag for exporting one named frame — the only community CLI found with explicit per-frame support. Font/image fidelity not documented; claims to use "the same libraries Excalidraw uses" but this wasn't verified against source in the time available.
- `bassimeledath/excalidraw-render-mcp` — actively pushed (2026-03-02), very small (4 stars). Uses Playwright + headless Chromium + SVG element screenshot — the same core technique as the local script and Candidate A, just packaged as an MCP server. No documented frame support.
- `realazthat/excalidraw-brute-export-cli` — actively maintained (CI passing, v0.4.0, tested Node 18-22), uses **headless Firefox** via Playwright to drive Excalidraw's real export path ("brute force" — runs the actual app export code). No per-frame export documented; appears to be whole-file only.
- `excalidraw-cli` (npm, 0.0.2, published 2026-02-11), `@vraksha/excalidraw-cli` (0.6.0, published 2025-12-16), `@moona3k/excalidraw-export` (0.2.1, published 2026-02-06, notably **no-browser**: uses RoughJS + `@resvg/resvg-js` for SVG→PNG) — all recent, none deeply investigated for frame/image/font support within the time budget. Flagged as unknowns, not recommended over Candidate A given no clear advantage was found.

None of these beat directly using the officially-documented `exportingFrame` parameter on `@excalidraw/excalidraw` (Candidate A), which the plugin can drive itself with full control and no dependency on a third party's CLI staying maintained.

## Candidate D: Driving excalidraw.com under Playwright

Not recommended, not deeply evaluated. To do this you'd need to headlessly load a `.excalidraw` file into the live production app (via its file-import UI or `#json=` URL scheme, if still supported), then trigger the app's own frame-export UI action and screenshot or intercept the resulting download — all while depending on a third-party website's DOM/UI staying stable, its availability, and possibly its rate limits or terms of use. This adds fragility (UI automation instead of a documented function call) and an external network dependency for no capability gain over Candidate A, since Candidate A calls the exact same underlying export code (`exportToSvg`/`exportToCanvas` with `exportingFrame`) that excalidraw.com's UI itself presumably calls, but locally and directly.

## Open items / unverified

- Per-frame render timing is not measured — needs an actual benchmark once the frame loop is implemented.
- Whether `exportingFrame` filtering requires `frameId`-linked children to be literally present in the passed `elements` array (very likely yes, per the "children must precede frame in array order" invariant) vs. some other linkage — worth a quick empirical check when implementing, not just trusting the type signature.
- Whether hermetic/offline rendering (bundling `@excalidraw/excalidraw` via npm instead of esm.sh at runtime) is worth the added Node/npm install step was not decided — flagged as a follow-up, not blocking.
