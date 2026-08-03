# 05 — Skill architecture and plugin layout

Type: grilling
Status: resolved
Blocked by: —
Parent: ../map.md

## Question

How is this plugin split into skills, and what does each one own?

The shape to decide:

- How many skills, and where the seam falls. The obvious candidate, borrowed from `premium-presentations`: one fat methodology skill that owns the visual system and the build loop, plus thin entry points per input type (doc source, topic string). Is that right, or does each entry point deserve a full skill?
- Entry points as **skills**, as **commands**, or both — and what the user actually types.
- The progressive-disclosure split: what stays in `SKILL.md` versus what lives in `references/` and only gets read when needed. `SKILL.md` should be small enough to load every time without regret.
- Which structural devices from `excalidraw-specialist.md` earn their place: the capability blocks, the execution template, the quality checklist, the anti-pattern table — and which are ceremony that should be dropped for a skill (as opposed to an agent).
- Whether any part of the build runs as a subagent, and if so what it is handed and what it returns.
- Repo layout: `skills/`, `commands/`, `scripts/`, `assets/`, `examples/`, and where generated decks are written by default.

Resolving this unblocks the content pipeline (06) and makes the build-out specifiable.

## Answer

Answered by `../../PLAN.md` §12 (skill layout), §1 (three-stage pipeline) and §11 (spike), after eight rounds of adversarial review by Codex — transcript in `../../PLAN-REVIEW-LOG.md`.

One fat methodology skill (`skills/beautidraw/`) with thin `references/` loaded on demand, two thin commands (`beautidraw-from-doc`, `beautidraw-from-topic`), and `scripts/` holding the in-browser layout engine, linter, renderer and harness. The decisive architectural call: **the LLM never types a coordinate** — it emits a semantic `deck-spec.json` and a deterministic layout engine, running inside the same Playwright page as the renderer, computes all geometry. This overrides the existing `excalidraw-diagram` skill's explicit "don't write a generator script" guidance, on the evidence that 35 of 35 confirmed defects in the reference are arithmetic failures rather than taste failures.
