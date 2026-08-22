# Choosing a pattern

Six structured patterns plus the `canvas` allocation pattern. The structured vocabulary trades
reach for deterministic layout. Use `canvas` when the visual treatment map calls for a composed or
hybrid frame rather than forcing the idea into a native pattern.

Pick by **what the content is**, not by how it looks.

| Pattern | Use when | Node count that works |
|---|---|---|
| `flow` | order matters and each step feeds the next | 2–7 |
| `row-of-stages` | parallel items of equal weight, no sequence | 3–5 |
| `comparison` | the same question answered differently across categories | 2–4 columns |
| `timeline` | events positioned along time | 4–8 |
| `tree` | one thing decomposes into parts | 2–4 roots |
| `checklist` | a list of questions or checks to work through | 6–10 |
| `canvas` | a composed or hybrid frame assembled after base generation | body height 240–1000 |

## `canvas`

`canvas` is not a seventh visual template. It allocates frame geometry and preserves narrative
order so `scripts/compose.mjs` can insert a bespoke composition. It has `height` instead of
`nodes`. Read `composition-spec.md` before using it. Every canvas band must be filled before
delivery.

## `flow`

The only pattern with connectors, so it is the only one that asserts causality. Use it when
reversing two nodes would be *wrong*, not merely odd.

Every flow band must declare `relation: "causal"`, `"dependency"`, or `"temporal"`. Settings
precedence, instruction scope, hierarchy, and priority do not qualify: they describe layering or
resolution, not one step causing the next. Use a comparison, field, matrix, map, threshold, or
illustration for those relationships.

Cards are narrow and centred rather than page-wide, which is why a flow band is tall. Seven
nodes is near the height cap — past that, split into two bands or switch to `row-of-stages`.

Do not use `flow` for a list that happens to be numbered. If the arrows are decoration, the
content is a `row-of-stages`.

## `row-of-stages`

The workhorse. Columns are chosen automatically from the node count (`n`, then `⌈n/2⌉`, then 2 —
first that fits), so 5 short nodes go in one row and 6 long ones may wrap to two.

Nodes may be label-only. A row of five bare labels is a legitimate band — an opening question
with its answer options, for example.

Content that reads as a sequence but has no real dependency belongs here, not in `flow`.

## `comparison`

Each node becomes a column: header plus a bulleted list. The `tone` field recolours a single
column, which is the whole point — green/amber/red across three columns is a governance model
in one glance.

Keep the item lists parallel in length and grammar. Three items in one column and eight in
another makes the columns look broken rather than different.

## `timeline`

Spacing is **even**, not proportional to the `at` values. It shows order and labels, not
duration. If duration is the argument, the deck needs a different band.

Every node needs an `at` string, even if it is just `"1"`.

## `tree`

Root row, children stacked beneath. Two levels only — there is no grandchild layout. Deeper
hierarchies get flattened into two bands or become a `flow`.

## `checklist`

Two columns, rows read `• label — note`. The label carries the question and the note the example
answer. Reserve it for the "now go do this" band: it is dense and reads as work, which is right
at the end of a deck and wrong at the start.

## Across the deck

- **Rotate the accent.** Two adjacent bands in the same colour read as one band. The palette has
  six entries; use them.
- **Vary the pattern.** Five `row-of-stages` bands in a row is a wall. Alternate shape as well
  as colour.
- **6–12 bands** is a session. One band is a diagram, not a deck.
- A band with a single node is almost always a heading that should have been folded into its
  neighbour.

For 8 or more bands, the pattern engine is the minority treatment: at most half the bands may be
structured, at least one band in every three must be a filled `canvas`, and no structured pattern
may appear more than twice. The `canvas` bands are where the argument changes visual form; they must
contain an actual map, scene, transformation, tension, or network rather than a card stack moved
onto a dark surface.
