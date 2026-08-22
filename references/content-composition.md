# Content and composition

Use this reference before planning a substantive Beautidraw presentation. Its purpose is to stop
the two recurring failure modes: shallow content and visually repetitive frames.

## The depth brief

Write the brief before choosing patterns or generating images.

```text
Audience:
Change in understanding or action:
Central claim:
Supporting claims:
Evidence and sources:
Concrete examples:
Mechanisms or causal explanations:
Trade-offs, exceptions, and boundaries:
Decision or implication:
Uncertainty and exclusions:
```

The brief is sufficient only when another person could explain why each supporting claim is true,
where it applies, and why it matters. Topic names and generic benefits are not supporting claims.

## Band content contract

Each band performs one audience job. It needs a claim and enough support to make that claim useful.
Support may be a fact, source-backed observation, example, contrast, mechanism, failure mode,
boundary, or consequence.

Depth does not mean filling every frame with prose. Develop the reasoning across bands, then make
each frame locally scannable. A difficult mechanism can use several bands: one to establish the
problem, one to show how it works, and one to reveal the boundary or decision it creates.

### Weak-to-strong examples

| Weak | Stronger |
|---|---|
| “Benefits of RAG” | “Retrieval gives the model evidence it did not have in the prompt” |
| “Challenges” | “More retrieved context can bury the passage that actually answers the question” |
| “Process” | “Relevance selection happens before generation, so retrieval quality limits answer quality” |
| “Next steps” | “Evaluate retrieval separately before tuning answer style” |

## Visual treatment map

Write one row per band:

| Band | Audience job | Claim/support | Visual thesis | Lane | Composition | Asset/data | Density/order |
|---|---|---|---|---|---|---|---|

The map is a design commitment, not a list of colours. “Blue background with cards” is not a
composition. “A central retrieval lens selects three evidence pages from a noisy field, with one
annotation at each decision point” is.

## Composition families

Choose from the content rather than cycling mechanically through this list.

- **Hero metaphor:** one dominant visual object with a few direct annotations.
- **Spatial system:** actors or components positioned by their real relationship.
- **Transformation:** a meaningful before/after or raw-to-usable change.
- **Tension:** opposing forces, trade-offs, thresholds, or decision boundaries.
- **Evidence collage:** source fragments organized around the claim they support.
- **Worked example:** one concrete scenario unfolding through the frame.
- **Map or network:** non-linear relationships, neighborhoods, dependencies, or influence.
- **Data view:** chart, matrix, table, or distribution built from trustworthy values.
- **Structured diagram:** flow, comparison, timeline, tree, checklist, or peer set.
- **Synthesis landscape:** earlier ideas brought together into one model or decision.

Do not use a generated illustration for exact quantitative relationships. Build the chart from
real data and attach a source note. Use generated imagery for intuition, metaphor, invisible
systems, human situations, and conceptual relationships.

## Choosing a lane

Use `structured` when the native pattern directly expresses the relationship and the audience
needs to inspect labels or values precisely.

Use `composed` when the visual itself carries the explanation and fixed containers would obscure
it. Keep textual annotations few and direct.

Use `hybrid` when intuition and precise inspection are both necessary. Assign clear visual zones;
do not layer a full-screen illustration under the same template as every other band.

## Deck rhythm

Review the treatment map before building:

- Are at least three composition families present in a substantial deck?
- Does scale change—hero moments, dense inspection, and quiet synthesis?
- Are two adjacent bands visually similar because the comparison requires it, or by accident?
- Does every image have a content-specific visual thesis?
- Is any band using a flow only because the source contained a list?
- Could the bands be shuffled without changing the argument? If so, strengthen the narrative.

## Composition budget

Beautidraw has a deterministic card engine because some relationships need exact inspection. It is
not a license to make every band a row of cards. For a deck with 8 or more bands:

- use structured patterns for at most half of the bands;
- use at least one composed or hybrid frame per three bands;
- use any one structured pattern no more than twice;
- break structured runs after two bands;
- give every canvas frame at least two visual relationship primitives beyond text and its surface.

The budget is enforced by `scripts/audit-deck-spec.mjs`. A failed audit means the treatment map is
still a topic inventory or a template rotation. Add a real scene, map, tension, transformation,
worked example, or evidence collage; do not satisfy the gate with extra borders or decorative
arrows around the same cards. Describe each canvas frame with a semantic `visual` object and let
`scripts/auto-compose.mjs` own the geometry. The derived composition spec is evidence, not input.

## Acceptance review

Reject and revise when:

- the deck can be summarized as “title, subtitle, cards” repeated vertically;
- removing the images would reveal the same generic template underneath every frame;
- removing the text would reveal imagery unrelated to the claim;
- the content contains claims without support or examples;
- the visuals imply facts, trends, or causality that the source does not establish;
- visual variety is only colour rotation;
- the final frame says “Questions?” instead of synthesizing the argument or enabling action.

Approval requires both content depth and visual explanation. Passing layout validation alone is
never enough.
