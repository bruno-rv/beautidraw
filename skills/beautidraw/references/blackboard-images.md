# Colored Blackboard Image Reference

Use this reference whenever a deck needs the colored-blackboard illustrations used by the
`hr-ai` presentation. The goal is a reproducible visual system, not a loose request for
"something hand-drawn".

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
> should feel practical, intelligent, friendly, and human-centred for an HR AI workflow
> presentation. Keep the drawing well inside the frame and make it legible as a 16:9 card.

Subject prompts should describe the visual metaphor, not ask the model to render text. For example:

> Subject: one approved source document in the center branching into a chat bubble, an internal
> email envelope, a public announcement megaphone, and a social post card. Show the branching
> with arrows and small approval checkmarks; emphasize one source becoming several controlled
> variants. Keep it as a single self-contained chalkboard panel.

## Reference motifs for the HR workflow deck

| Asset | Motif | Deck band |
|---|---|---:|
| `blackboard-01-blank-page-to-finished-work.png` | blank source → lightbulb → reusable work artifacts | 2 |
| `blackboard-02-source-to-channel-variants.png` | one approved source → controlled communication channels | 6 |
| `blackboard-03-spreadsheet-to-insight.png` | spreadsheet → validated analysis → decision insight | 7 |
| `blackboard-04-idea-to-workshop-package.png` | rough idea → agenda, notes, handout, flow, collection | 8 |
| `blackboard-05-source-grounded-evidence.png` | scanned source → structured table → verified evidence | 9 |
| `blackboard-06-human-in-the-loop-guardrails.png` | AI assistance → review → human-only decision gate | 10 |

## Production and acceptance protocol

1. Generate each asset with the canonical prefix and one motif-specific subject prompt.
2. View every candidate before wiring it into the deck. Reject it if the background is not a
   chalkboard, the linework becomes polished vector art, the colors drift, the subject is
   clipped, or readable text appears.
3. Normalize accepted copies to 1536 × 864. Keep the image as a standalone PNG in the deck's
   `out/` directory.
4. Record `file`, raw-byte `sha1`, `suggestedBand`, and a one-sentence `use` in
   `blackboard-asset-manifest.json`.
5. When embedding, use the raw-byte SHA-1 as the Excalidraw `fileId` and `files` key. The file
   entry must contain the matching `id`, `mimeType: "image/png"`, and a `dataURL`.
6. Put the image element inside the intended frame with a unique id, `status: "saved"`,
   `scale: [1, 1]`, `crop: null`, `boundElements: []`, and the full standard Excalidraw base
   properties. Place it in an unused region of the frame; never cover a heading, label, arrow,
   or note merely to make room for an image.

The reference is successful only when the generated files, manifest, embedded file map, and
rendered deck all agree. A prompt-only handoff is not enough.
