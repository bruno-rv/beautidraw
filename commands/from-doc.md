---
description: Build an Excalidraw presentation from a document, transcript or link
argument-hint: <path-or-url> [--out-dir <dir>]
---

Build an Excalidraw deck from: $ARGUMENTS

Everything before `--out-dir` is the source. If `--out-dir` is absent, write to
`decks/<slug>/out/`, keeping the spec at `decks/<slug>/deck-spec.json` so it stays
tracked (only `out/` is gitignored).

Use the `beautidraw` skill. Steps:

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs"` — idempotent, and a no-op once
   provisioned.
2. Read the source. If it is a URL that renders client-side (a chat share link, a docs site),
   fetch it with a real browser rather than a plain HTTP get — a title-only result means the
   page was not rendered.
3. Extract the substance. If the source is advice *about* presenting something, build the deck
   from what that advice is about — see "Write the presentation, not a script for it" in the
   skill.
4. Write `deck-spec.json`, generate, and look at the rendered PNGs before handing anything over.
