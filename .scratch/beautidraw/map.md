# Map: beautidraw — Excalidraw presentation skills

Label: `wayfinder:map`

## Destination

An installed, working Claude Code plugin at `~/Dev/beautidraw` whose skills turn either a markdown document or a topic string into a **sectioned Excalidraw canvas** — one file per topic, stacked section bands running top to bottom, each band wrapped in a numbered `frame`, opened and panned by hand. Done when the skills exist, are installed, and have produced a real canvas that survives inspection.

The layout unit is the **section band**, not the slide. `examples/al-1.excalidraw` is the reference artifact.

## Notes

**Execution effort — this map overrides wayfinder's "plan, don't do" default.** Tickets here may build, not only decide. The map ends at working software, not at a spec.

Domain: Excalidraw JSON authoring, visual argument design, agent skill authoring.

Skills every session should consult: `/grilling`, `/domain-modeling`, `mattpocock-skills:research` for research tickets, `superpowers:writing-skills` when authoring the skills themselves.

### Standing constraints (settled while charting — not open questions)

- **Distribution**: standalone plugin repo in `~/Dev/beautidraw`, same shape as `~/Dev/premium-presentations` (`.claude-plugin/plugin.json`, `skills/`, `commands/`, `scripts/`, `assets/`). Must be self-contained — no dependency on `~/.claude/skills/excalidraw-diagram`.
- **Clean-room visual system**: palette, typography, slide anatomy and layout rules are derived from Bruno's example `.excalidraw` files, not inherited from the existing `excalidraw-diagram` skill.
- **Two entry points**: a markdown/doc source, and a topic/prompt string.
- **Delivery**: the artifact is the canvas. A human opens the `.excalidraw` file on free excalidraw.com and pans and zooms by hand. No presenter mode, no Excalidraw+ dependency, no PNG/PDF/HTML deliverable. Settled by 09.
- **Self-validation is mandatory**: the skills render what they drew, look at the image, and fix defects in a loop before handing over. The renderer is an internal validation tool, not an output format.
- **Progressive disclosure in every skill**: thin `SKILL.md`, detail in `references/` loaded only when needed.
- **Imagery is both**: vector illustrations composed from Excalidraw primitives, *and* embedded assets chosen from a shipped asset folder with a description manifest the agent searches.
- **Structural inspiration**: `~/Dev/frm-ai-data-engineer/.claude/agents/domain/excalidraw-specialist.md` — its capability blocks, execution template, quality checklist and anti-pattern table are the shape to borrow.

### Frontier order override

*(Discharged)* **Take 11 (the metric oracle spike) before anything else.** Done — it **passed**, and the premise it was meant to test turned out never to have been at risk: Excalidraw's bound-text layout is reachable through a *public* export. Build-out is unblocked.

**Next: 01 (more examples) gates the visual system, not the mechanism.** The pipeline, the metric contract and the gating are now proven; the palette, legend shade sets and per-pattern geometry still rest on one poster.

*(Superseded)* **Take 10 before 05.** Pure number order would put it last. 10 decides the generator's output shape — sectioned canvas, sectioned canvas plus frames, or a true slide deck — and the first example file has zero frames, so the map's original frame-per-slide premise is not safe to build on. Designing the architecture (05) or the content pipeline (06) before 10 resolves risks designing for an artifact Bruno does not want.

### Tracker

Local markdown tracker. Tickets in `./issues/`. Research findings land in `./research/NN-<slug>.md` (this repo is not a git repo, so no `research/<name>` branch).

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [11 — The metric oracle spike](./issues/11-metric-oracle-spike.md) — **passed**. `convertToExcalidrawElements` is public and does real bound-text layout, so nothing non-public is vendored and the plan's largest risk was imaginary. **Viewer parity is exact** against live excalidraw.com (100/100 font measurements across four character repertoires, zero-delta scene round-trip). Falsified four plan assumptions: lazy font loading changes *wrap points* not just widths; `lineHeight` is derived from `fontFamily`; per-frame export applies neither padding nor a label band (so `BAND_HEIGHT_CAP` 1170 → 1211); and child-before-frame ordering is not load-bearing, contra research 02. Findings: [`research/11-spike-findings.md`](./research/11-spike-findings.md).
- [05 — Skill architecture and plugin layout](./issues/05-skill-architecture.md) + [06 — Content pipeline](./issues/06-content-pipeline.md) — both answered by `../../PLAN.md`, Codex-APPROVED after eight adversarial rounds (`../../PLAN-REVIEW-LOG.md`). One methodology skill + two thin commands; LLM emits a geometry-free `deck-spec.json` and a deterministic layout engine running inside the renderer's own browser page computes every coordinate. Revision is regeneration from the spec.
- [10 — What shape is a beautidraw presentation](./issues/10-deck-shape.md) — sectioned canvas **plus** frames. One file per topic, section bands stacked top to bottom exactly like `al-1.excalidraw`, each band additionally wrapped in a numbered `frame`. Frames are invisible scaffolding: they cost nothing visually, give free zoom-to-frame, and let the validation loop render one section at a time via `exportingFrame`.
- [09 — Which surface is the deck presented on](./issues/09-presentation-surface.md) — none. No presenter mode needed: the file is opened and panned by hand on free excalidraw.com. Delivery constraint firms up, export stays out of scope, no Excalidraw+ dependency. Exposes 10 as the real question.
- [02 — Frame element semantics and live frame navigation](./issues/02-frame-semantics-and-navigation.md) — frames carry only `name`; membership is an explicit `frameId` on each child, never geometry; frames don't nest; children must sit immediately before their frame in the `elements` array or clipping breaks. Free excalidraw.com has **no presentation mode** — that's an Excalidraw+ feature, and the three surfaces order frames three different ways (Y-position / slide-list / alphabetical). Mitigation: zero-padded numeric name prefixes plus top-to-bottom Y layout. 16:9 is the de facto slide ratio.
- [03 — Image element and the `files` map](./issues/03-image-element-embedding.md) — `image` element points at a `files` entry by `fileId`, which is the SHA-1 of the raw bytes. SVG is accepted and stays resolution-independent (re-rasterised per redraw, not converted to primitives). Ceilings: 4 MiB per file for collab sync, and a silent ~5–10 MB localStorage autosave quota. Budget a 20-slide deck under ~3–4 MB base64. `.excalidrawlib` items are ordinary elements — vendoring is concatenation with regenerated ids.
- [04 — Headless render path that respects frames](./issues/04-headless-render-path.md) — per-frame render is native: `exportToSvg`/`exportToCanvas`/`exportToBlob` take an `exportingFrame` argument. Needs a DOM, so Playwright + headless Chromium. Plugin writes its own script looping frames in one browser session, and vendors `@excalidraw/excalidraw` rather than pulling it from a CDN at render time.

## Not yet specified

- **Slide anatomy** — what a single frame contains, its safe area, title placement, density ceiling, how a frame's content relates to the frame's bounds. Blocked on the example files (01).
- **Deck grammar** — the vocabulary of slide types (title, section divider, workflow, concept, comparison, evidence, close) and the rules for sequencing them. Blocked on 01 and on slide anatomy.
- **Typography and palette under presentation** — sizes that stay readable at frame-fit zoom, hierarchy levels, colour semantics. Blocked on 01.
- **Evidence-artifact sourcing for the topic entry point** — where facts come from when the input is a bare topic (MCP research, web, context7), and how they become on-slide artifacts. Partially depends on the content pipeline (06).
- **Build-out** — specified by `../../PLAN.md` and **no longer gated**: ticket 11 passed. The visual system itself (palette, legend shade sets, per-pattern role tables, the six patterns' layout functions) is still fog: the plan fixes the *mechanism*, the type ramp and the font roles, while the concrete palette and pattern geometry still wait on more examples (ticket 01).
- **Install and portability** — how the plugin gets installed locally, and the portability audit before it is shareable.

## Out of scope

- **PNG / PDF / HTML export as a deliverable** — the file itself is the deliverable, opened and panned by hand. Export was only a candidate if presenter mode were needed; 09 established it is not. Rendering to PNG survives strictly as an internal validation step.
- **Reusing or retiring `~/.claude/skills/excalidraw-diagram`** — the visual system is clean-room; the old skill is left untouched and continues to serve one-off diagrams.
- **The Excalidraw MCP chat canvas** (`mcp__claude_ai_Excalidraw__*`) as a delivery path — it streams a view into chat and has no frame support; it is not how these decks are produced or shown.
