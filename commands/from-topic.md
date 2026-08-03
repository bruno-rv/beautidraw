---
description: Build an Excalidraw presentation from a topic, with no source document
argument-hint: <topic> [--out-dir <dir>]
---

Build an Excalidraw deck about: $ARGUMENTS

Everything before `--out-dir` is the topic. If `--out-dir` is absent, write to `decks/<slug>/`.

Use the `beautidraw` skill. First run `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs"` —
idempotent, and a no-op once provisioned.

There is no source document here, so the content is yours to establish. Before writing
`deck-spec.json`, settle two things and say what you settled on:

- **Who is in the room.** The same topic makes a different deck for engineers and for
  executives.
- **The argument.** A deck that lists facts about a topic is a wall. Decide what it is
  *claiming*, then let the bands carry that claim.

Ask the user only if getting it wrong would waste the whole deck; otherwise state your
assumption and build.

Then write the spec, generate, and look at the rendered PNGs before handing anything over.
