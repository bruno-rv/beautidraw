# 04 — Headless render path that respects frames

Type: research
Status: resolved
Blocked by: —
Parent: ../map.md

## Question

How does the plugin render an `.excalidraw` file to an image the agent can look at, per frame, without a human opening a browser tab?

Self-validation is mandatory for this effort, so this path has to exist and has to be reliable. Candidate approaches to evaluate rather than assume:

- `@excalidraw/excalidraw`'s `exportToCanvas` / `exportToBlob` / `exportToSvg` utilities driven from Node or from a page under Playwright.
- The `excalidraw_export` / `excalidraw-cli`-style community CLIs, if any are maintained.
- Driving excalidraw.com itself under Playwright and screenshotting.
- The approach already used by `~/.claude/skills/excalidraw-diagram/references/render_excalidraw.py` — read it and report what it actually does and whether it handles frames at all.

For whichever paths survive, report:

- Whether it can render **one named frame** to its own image, or only the whole scene.
- Whether embedded images from the `files` map render correctly.
- Whether it renders fonts faithfully (Excalifont / hand-drawn family vs system fallback).
- The install footprint (Node? Python? chromium? uv?) and the first-run setup command.
- Rough per-frame render time for a 20-frame deck.

Findings go in `../research/04-headless-render-path.md`.

## Answer

Full findings: `../research/04-headless-render-path.md`.

**Per-frame rendering is a first-class primitive.** `exportToCanvas`, `exportToBlob` and `exportToSvg` in `@excalidraw/excalidraw` (0.18.1, 2026-04-20) all accept `exportingFrame: ExcalidrawFrameLikeElement | null`. Hand them the whole elements array plus one frame element and Excalidraw's own renderer filters and clips to that frame. No cropping hacks needed.

**These functions need a DOM.** They cannot run in bare Node — Playwright + headless Chromium is the delivery vehicle, not an optional extra.

**Recommended path**: the plugin writes its own render script using this technique — one Playwright session, loop `exportingFrame` over the deck's frame elements, one image out per frame. Do NOT launch a browser per frame.

**Reference implementation to study, not to depend on**: `~/.claude/skills/excalidraw-diagram/references/render_excalidraw.py` already has the exact plumbing (Python + uv-managed Playwright + a local HTML harness). It computes one scene-wide bounding box and has zero frame awareness, so it does not solve this ticket as-is — but the harness pattern is proven. Reusing the *technique* does not conflict with the map's out-of-scope rule, which forbids the plugin depending on that skill, not learning from it.

**Portability defect to fix when building**: that script pulls `@excalidraw/excalidraw` from the esm.sh CDN at render time. A self-contained plugin must vendor the dependency instead — otherwise the validation loop breaks offline and pins to whatever esm.sh serves that day.

**Fonts**: `exportToSvg` inlines fonts by default, so Excalifont/Virgil render faithfully. Passing `skipInliningFonts` breaks that.

**Embedded images**: the `files` map threads through correctly.

**Rejected**: `@excalidraw/utils` (dead — last publish a `0.1.3-test32` prerelease, 2025-04-24); `excalidraw-cli` (stale since 2023); driving excalidraw.com under Playwright (same export call underneath, plus UI-automation fragility and a third-party runtime dependency, for no gain). `excalirender` is the only community CLI with a documented `--frame` flag and is active — a fallback if the in-house script proves painful, not the default.

**Confirmed empirically, 2026-08-02** — while rendering `examples/reference/al-1.excalidraw` to inspect it, the CDN defect predicted above fired immediately. `https://esm.sh/@excalidraw/excalidraw?bundle` (the URL in the existing skill's `render_template.html`) failed with a 404 on a transitive dependency: `@braintree/sanitize-url@6.0.2/es2022/dist/constants.mjs`. So the existing skill's renderer is **currently broken**, not merely fragile. `https://cdn.jsdelivr.net/npm/@excalidraw/excalidraw@0.18.1/+esm` worked first try and produced a 2725 × 1715 SVG. Working proof-of-concept: a plain HTML page importing `exportToSvg`, served over `python3 -m http.server` and screenshotted through the Playwright MCP — no `uv`, no local chromium install, no venv. That is a viable third path worth weighing against the vendored-npm approach when the renderer gets built.

**Unverified**: per-frame render time was not benchmarked. Measure it once the loop exists — it decides whether validation runs per frame or once per deck.
