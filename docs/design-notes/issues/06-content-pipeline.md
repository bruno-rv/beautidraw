# 06 — Content pipeline: topic or doc to a slide plan to frames

Type: grilling
Status: resolved
Blocked by: 05
Parent: ../map.md

## Question

What happens between "here is a markdown file" or "here is a topic" and the first frame being drawn?

To decide:

- Is there an intermediate **slide plan** artifact — a written outline the user can approve or edit before any JSON is generated — or does the skill go straight from source to canvas? `premium-presentations` uses a slide-spec; that precedent is worth arguing with rather than copying.
- If there is a plan, what format, where it is written, and whether approval is a hard gate.
- How the source is decomposed into slides: what governs slide count, what forces a split, what earns its own frame.
- The narrative arc — whether the skill imposes one (open, context, deep dive, resolve) or follows the source's own structure.
- How the two entry points differ before they converge: the topic path needs a research stage the doc path does not.
- How a deck gets **revised**. Regenerating from scratch loses hand edits made on canvas; patching a single frame in place is harder. Which one, and what happens to the other case.

## Answer

Answered by `../../../PLAN.md` §1, §9 and §8.

There **is** an intermediate artifact: `deck-spec.json`, semantic and geometry-free, validated against a JSON Schema before layout runs and written to disk beside the output. Slide decomposition is governed by a closed pattern vocabulary (`timeline`, `flow`, `row-of-stages`, `comparison`, `tree`, `annotated-figure`), each with declared node limits and bounded failure behaviour — no silent truncation. The two entry points differ only in that the topic path runs a research stage before emitting the spec. Revision is **regeneration from the spec**, never in-place patching; reproducibility is claimed from the triple `(deck_spec_hash, layout_params_hash, repair_history)` plus the pinned runtime, which is the honest claim once a visual judgement gate exists.
