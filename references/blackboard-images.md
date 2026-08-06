# Colored Blackboard Image Reference

Use this reference whenever a deck needs colored-blackboard illustrations. The goal is a
reproducible visual system, not a loose request for "something hand-drawn".

> **Status: style and placement contract.** `deck-spec.json` still has no image field and
> `generate.mjs` still writes `files: null`, so a subsequent regeneration can remove embedded
> images. For a finished presentation handoff, post-process the generated `.excalidraw` with
> the accepted PNGs, preserve the manifest, and render the final file before delivery. The
> placement rules below are part of the visual contract: an image is not finished while it is
> still a loose thumbnail on the canvas.
>
> The PNGs remain useful as a separate deliverable, but when the user asks for an embedded
> handoff, include them in the final `.excalidraw` and say that regeneration must preserve or
> reapply the embedding step.

## Canonical visual contract

- Output one self-contained **16:9** image at **1536 × 864**.
- Use a dark charcoal-green chalkboard ground, never a white canvas or a photographic scene.
- Use lightly dusty, imperfect chalk linework with clear silhouettes and generous margins.
- Use restrained chalk colors: powder blue, mint green, lavender violet, warm amber, coral red,
  and off-white. Keep the background dark and the linework brighter than the board.
- Compose a single left-to-right metaphor: source → transformation → reviewed/reusable outcome.
- Keep the main objects inside a 5% safe margin and make the drawing readable when reduced to
  roughly 320 × 180 px.
- Use symbols, cards, arrows, checkmarks, grids, documents, charts, folders, locks, and simple
  human figures where useful. Do not add a title or caption inside the image.
- Do **not** use readable words, letters, numbers, logos, branded UI, interface screenshots,
  photorealism, glossy 3D, gradients, or stock-photo styling.

## Canonical prompt prefix

Start every image prompt with this exact style direction, then append only the subject:

> Create a cohesive presentation illustration in a colored-blackboard drawing style: dark
> charcoal-green chalkboard background, subtle chalk dust and hand-drawn texture, bright
> restrained chalk marks in powder blue, mint green, lavender violet, warm amber, coral red,
> and off-white. Use simple clean hand-drawn line art, generous margins, no photorealism, no
> logos, no interface screenshots, no readable words, no letters, no numbers. The illustration
> should feel practical, intelligent, friendly, and human-centred. Keep the drawing well inside
> the frame and make it legible as a 16:9 card.

The prefix carries the style and nothing else — the deck's domain belongs in the subject line
below it, never in the prefix. A prefix that names one deck's subject silently reframes every
illustration in every other deck.

Subject prompts should describe the visual metaphor, not ask the model to render text. For example:

> Subject: one approved source document in the center branching into a chat bubble, an internal
> email envelope, a public announcement megaphone, and a social post card. Show the branching
> with arrows and small approval checkmarks; emphasize one source becoming several controlled
> variants. Keep it as a single self-contained chalkboard panel.

Motifs that work, as shapes rather than subjects: a source becoming several controlled variants;
a raw table becoming a decision; a rough idea becoming a packaged set of artifacts; assistance
passing through review into a human-only gate. Each is a left-to-right transformation, which is
what the composition rule above asks for.

## Frame-native placement contract

- Never place a dark image as a free-floating thumbnail on the white canvas. The image must
  either fill a deliberate side zone or be a true background for its entire parent frame.
- The 16:9 size above is the standalone-card default. When the image fills a frame or side zone,
  regenerate the composition for that target aspect ratio and normalize the PNG to the target
  pixel dimensions. Do not letterbox a 16:9 card inside a wider or taller frame.
- **Side mode:** use the full height of the left or right body column, flush to the frame's
  content bounds. Generate a vertical or square composition when the column requires it; do not
  add an inset panel, white padding, or a second dark border.
- **Background mode:** make the image exactly the parent frame's width and height, place it
  behind every other child with the same `frameId`, and reduce opacity enough for the deck's
  typography and cards to remain primary. It must bleed to the frame edges so it reads as a
  frame surface, not an object placed on top of it.
- A compact row/checklist band generally needs background mode; a two-column workflow band
  generally needs side mode. Choose based on the actual frame geometry, not on an arbitrary
  thumbnail size.
- If neither mode has a clean slot, reflow the deck or regenerate the asset. Never use an
  arbitrary leftover gap merely to make an image fit.

## Production and acceptance protocol

1. Generate each asset with the canonical prefix and one motif-specific subject prompt.
2. View every candidate before wiring it into the deck. Reject it if the background is not a
   chalkboard, the linework becomes polished vector art, the colors drift, the subject is
   clipped, or readable text appears.
3. Normalize standalone copies to 1536 × 864; normalize frame-native copies to the exact target
   frame or side-zone dimensions. Keep the PNGs beside the handoff deck in the requested output
   folder (or in the deck's `assets/` directory when the generator owns the output folder).
   Record the final pixel dimensions and placement mode in the manifest.
4. Record `file`, raw-byte `sha1`, `suggestedBand`, and a one-sentence `use` in
   `blackboard-asset-manifest.json`, beside the assets.

5. Use the raw-byte SHA-1 as the Excalidraw `fileId` and `files` key. The file entry must
   contain the matching `id`, `mimeType: "image/png"`, and a `dataURL`.
6. Put the image element inside the intended frame with a unique id, `status: "saved"`,
   `scale: [1, 1]`, `crop: null`, `boundElements: []`, and the full standard Excalidraw base
   properties. In side mode, use the image itself as the flush visual zone. In background mode,
   place it before the frame's other children, set its opacity deliberately, and do not add a
   decorative panel rectangle around it.

A prompt-only handoff is not enough: the assets, the manifest and the rendered deck must agree,
and every image must have been viewed before it ships.
