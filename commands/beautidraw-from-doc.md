---
description: Build an Excalidraw presentation from a document, transcript or link
argument-hint: <path-or-url> [output-dir]
---

Build an Excalidraw deck from: $ARGUMENTS

Use the `beautidraw` skill. Steps:

1. Read the source. If it is a URL that renders client-side (a chat share link, a docs site),
   fetch it with a real browser rather than a plain HTTP get — a title-only result means the
   page was not rendered.
2. Extract the substance. If the source is advice *about* presenting something, build the deck
   from what that advice is about — see the "Write the presentation, not a script for it"
   section in the skill.
3. Write `deck-spec.json`, generate, and look at the rendered PNGs before handing anything over.

If no output directory was given, write to `decks/<slug>/` beside the source.
