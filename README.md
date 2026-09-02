# beautidraw

A Claude Code plugin that turns a document or a topic into a single `.excalidraw` presentation:
one continuous canvas, sections stacked top to bottom, each wrapped in a numbered frame. Opened
and panned by hand on excalidraw.com — no slideshow, no export, no presenter mode.

The design decision the whole thing rests on: **the model never types a coordinate.** It writes
semantic content plus a visual thesis into one `deck-spec.json`; a deterministic layout engine and
automatic visual composer running inside a real browser compute every coordinate from Excalidraw's
own text measurement.

## Setup

**Prerequisites: Node 20+ and [pnpm](https://pnpm.io/installation).** Setup will not bootstrap
pnpm for you — installing global tooling behind your back is worse than failing with a message.

No lockfile is committed. Every direct dependency is pinned to an exact version in
`package.json` and setup verifies each one after installing; the transitive tree is whatever
pnpm resolves at install time and is **not** pinned. The versions that decide geometry —
`@excalidraw/excalidraw`, `react`, `react-dom`, `esbuild` — are all direct.

Three further things are required and none are committed: dependencies, a Chromium binary, and
the 27 MB vendored Excalidraw bundle. One idempotent command provides all three:

```
node scripts/setup.mjs        # from a clone of this repo; or: pnpm setup
```

From anywhere else — including a plugin install — give the full path:
`node /path/to/beautidraw/scripts/setup.mjs`. The skill uses
`"${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs"`.

Re-running it on a provisioned tree prints `already provisioned` and does nothing. It is safe
to call on every invocation, which is what the commands do. It re-checks rather than trusting a
marker:

- dependency versions against the exact pins in `package.json`
- the vendored **fonts** against the pinned package's own bytes, by exact filename
- the vendored **JS and CSS** against the digests recorded when they were built, plus the
  hashes of `vendor-entry.js` and `build-bundle.mjs`, so an edited bundle source forces a
  rebuild rather than silently reusing stale code

## Authoring: Semantic Deck Spec

Decks are authored as structured JSON in `deck-spec.json`. Bands declare either native structured
card patterns (`comparison`, `checklist`, `flow`, etc.) or semantic `canvas` frames. Raster
illustrations are declared directly inside `visual.image` with distinct `use` and `description`
fields:

```json
{
  "title": "RAG, Vectors & Graphs",
  "subtitle": "How systems find evidence, connect facts, and ground answers",
  "footer": "Use frame navigation to follow the retrieval mechanism.",
  "bands": [
    {
      "heading": "RAG means relevance-selected evidence",
      "deck": "A generation architecture, not a synonym for every external tool call",
      "pattern": "canvas",
      "accent": "blue",
      "relation": "causal",
      "height": 780,
      "visual": {
        "family": "illustration",
        "surface": "light",
        "thesis": "RAG is an architecture for relevance-selected evidence, not a synonym for every tool call.",
        "explanation": "A user question queries a retrieval engine over a bounded evidence space, filters candidate documents, and injects selected passages into context.",
        "example": "Searching a policy knowledge base returns two exact clauses instead of dumping entire manuals into context.",
        "tradeoff": "Retrieval latency and relevance noise trade against generation accuracy and groundedness.",
        "inspect": "retriever.search(query, top_k=5) then score relevance",
        "callouts": [
          { "kind": "boundary", "label": "Bounded context", "note": "only relevant evidence is placed in prompt" },
          { "kind": "inspect", "label": "Score cutoff", "note": "discard hits below similarity threshold" }
        ],
        "image": {
          "file": "assets/evidence-selection.png",
          "side": "left",
          "use": "Show a user question moving through an evidence space to select a grounded context for generation.",
          "description": "A query enters an evidence collection, filters irrelevant material, and selects a compact context bundle to support generation."
        }
      }
    }
  ]
}
```

## The One-Command Build

Build any deck with a single transactional command:

```bash
node scripts/build-deck.mjs <spec.json> <outdir>
```

The build preflights the spec, compiles deterministic frames, composes semantic canvas visuals,
embeds content-hashed assets, writes an accessible outline, and publishes atomically. On success,
it prints the exact compact receipt:

```text
BUILD DECK OK — /path/to/out
elapsed: 2403 ms
frames: 15
embedded assets: 4
bytes: 27604176
deck: /path/to/out/deck.excalidraw
scene: /path/to/out/scene.png
diagnostics: /path/to/out/diagnostics.json
manifest: /path/to/out/composition-manifest.json
outline: /path/to/out/outline.md
```

### Exemplar Decks

Three production-grade learning canvases illustrate the complete authoring contract:

```bash
# 1. Claude Code Artifacts (developer control plane & architecture)
node scripts/build-deck.mjs decks/claude-code-artifacts/deck-spec.json decks/claude-code-artifacts/out

# 2. LLM Token Flow (tokenization, vector lookup, transformers & sampling)
node scripts/build-deck.mjs decks/llm-token-flow/deck-spec.json decks/llm-token-flow/out

# 3. RAG, Vectors & Graphs (retrieval systems, semantic search & knowledge graphs)
node scripts/build-deck.mjs decks/rag-vector-graph/deck-spec.json decks/rag-vector-graph/out
```

## Accessible Outline & Frame Navigation

- **Accessible Reading Surface (`outline.md`):** Beside `deck.excalidraw`, every build emits
  `outline.md` containing ordered frame headings, visual theses, mechanisms, examples, boundaries,
  and inspect commands. It serves as the linear reading surface for screen readers and small screens.
- **Frame Navigation:** In Excalidraw, frames are named sequentially (`01 Heading`, `02 Heading`).
  Navigate sequentially using Excalidraw's built-in frame navigation sidebar or keyboard frame
  jumping (`F`).
- **Error Recovery:** Preflight and presentation audits fail closed with structured `CliError`
  diagnostics containing the exact offending field path, failure reason, and recovery steps.
  Staging uses transactional sibling directories (`.stage-XXX` and `.backup-XXX`); any build or
  publication error rolls back cleanly without leaving staging residue or corrupting previous output.

## Layout

The repo root *is* the skill — `plugin.json` declares `"skills": ["."]`, so `SKILL.md` and
`references/` sit at the top level and nothing is nested for the sake of it.

```
SKILL.md                       what Claude reads; the build procedure
references/                    deck-spec schema, semantic visuals, patterns, visual system, images
scripts/                       layout engine, automatic composer, generator, harness, setup, bundler
scripts/spike/                 measurement probes; probe-06 is the viewer-drift gate
.claude-plugin/plugin.json     plugin manifest
```

## Verification & Maintenance

The engine's geometry and contracts are verified continuously:

```bash
pnpm test             # fast unit and contract test suite (node --test)
pnpm verify           # full suite: unit tests + 9 offline probes
pnpm spike            # 9 offline probes, ~8s
pnpm spike:network    # adds probe-06, which measures against live excalidraw.com
```

`pnpm spike:network` detects live viewer drift against excalidraw.com. When viewer drift occurs,
re-pin `@excalidraw/excalidraw`, rebuild the bundle via `pnpm bundle`, and verify with `pnpm spike`.
`scripts/LAYOUT-CONTRACT.md` records every engine constant and measurement rule.
