# Choosing a pattern

Six patterns. The vocabulary is closed — it trades reach for the guarantee that every band is
laid out correctly. If nothing fits, the content is usually wrong for a band, not the other way
round.

Pick by **what the content is**, not by how it looks.

| Pattern | Use when | Node count that works |
|---|---|---|
| `flow` | order matters and each step feeds the next | 2–7 |
| `row-of-stages` | parallel items of equal weight, no sequence | 3–5 |
| `comparison` | the same question answered differently across categories | 2–4 columns |
| `timeline` | events positioned along time | 4–8 |
| `tree` | one thing decomposes into parts | 2–4 roots |
| `checklist` | a list of questions or checks to work through | 6–10 |

## `flow`

The only pattern with connectors, so it is the only one that asserts causality. Use it when
reversing two nodes would be *wrong*, not merely odd.

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
