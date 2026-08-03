# Design notes — historical record

**These are not current documentation.** They are the wayfinder map, the resolved decision
tickets and the spike research that produced the plugin, kept because they record *why* the
engine's constants hold and what was falsified along the way. They are frozen at the moment each
ticket closed and are deliberately not rewritten as the code moves.

Where they disagree with the shipped code, the code wins. Known divergences, so you do not have
to discover them by being misled:

| These notes say | Shipped |
|---|---|
| pattern `annotated-figure` (issue 06) | `checklist` — the vocabulary is in `docs/PLAN.md` §1 |
| `deck-spec.json` validated by a JSON Schema (issue 06) | hand-written validation in `generate.mjs`/`layout.mjs`; see PLAN §9 |
| a shipped asset folder with a description manifest (`map.md`) | never built; no `assets/` tree, and the engine writes `files: null` |
| commands named `beautidraw-from-doc` / `-topic` (issue 05) | `from-doc` / `from-topic`, invoked as `/beautidraw:from-doc` |
| bundle and manifest committed | generated locally by `scripts/setup.mjs`; see PLAN §11 |
| children must sit immediately before their frame (issue 02) | **falsified** by spike F6.4 — ordering is convention, not correctness |

Bundle hashes quoted in the spike notes are the values measured on 2026-08-02 against
`@excalidraw/excalidraw@0.18.1`. They are evidence of what was measured, not a current
assertion — `scripts/vendor/manifest.json` holds the live values.

Current documentation lives in `README.md`, `skills/beautidraw/SKILL.md` and its `references/`,
and `scripts/LAYOUT-CONTRACT.md`.
