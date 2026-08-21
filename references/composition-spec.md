# `composition-spec.json`

Use this file to fill `canvas` bands after the base deck is generated. It is the executable
contract for composed and hybrid frames.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/compose.mjs" <deck.excalidraw> <composition-spec.json> <outdir>
```

The composer embeds PNG assets, converts custom skeletons through Excalidraw’s browser API,
preserves frame membership and narrative order, writes a composition manifest, and rerenders the
continuous scene and every band.

## Schema

```jsonc
{
  "bands": [
    {
      "band": 1,                       // zero-based band index
      "lane": "composed" | "hybrid",
      "surfaceColor": "#10231f",      // contrast surface for direct text
      "image": {                       // optional when Excalidraw elements carry the visual
        "file": "assets/retrieval-lens.png",
        "mode": "scene" | "side" | "focal" | "background",
        "use": "Show evidence selection as the central visual argument",
        "x": 0.0, "y": 0.0,           // normalized to the canvas body
        "width": 1.0, "height": 1.0,
        "opacity": 100
      },
      "elements": [
        {
          "id": "retrieval-callout",
          "type": "text",
          "x": 0.08, "y": 0.28,
          "text": "Only the selected evidence reaches the model",
          "fontSize": 30,
          "strokeColor": "#f8fafc"
        },
        {
          "id": "decision-boundary",
          "type": "rectangle",
          "x": 0.56, "y": 0.22,
          "width": 0.36, "height": 0.3,
          "strokeColor": "#047857",
          "backgroundColor": "#d1fae5",
          "label": { "text": "Evidence is present", "fontSize": 26 }
        }
      ]
    }
  ]
}
```

All `x`, `y`, `width`, and `height` values are fractions of the band body beneath the heading and
deck line. Elements must remain inside `0..1`. IDs use lowercase letters, digits, and hyphens; the
composer prefixes them with the band id.

`surfaceColor` is required and must be a six-digit hex colour. The composer renders it as the body
surface behind the composition, so direct-text contrast is checked against a real element rather
than an unverified declaration.

Supported skeletons are the shapes accepted by Excalidraw’s
`convertToExcalidrawElements`, including `text`, `rectangle`, `ellipse`, `diamond`, `line`, and
`arrow`. For a `line` or `arrow`, provide normalized `x`, `y`, `width`, `height`, and `points` whose
point coordinates are fractions of that element’s width and height.

## Image contract

- Assets are PNG files resolved relative to `composition-spec.json`.
- `mode` and a one-sentence `use` are required.
- `mode` is limited to `scene`, `side`, `focal`, or `background`; opacity is from 1 to 100.
- The PNG aspect ratio must match its target zone within two percent. Regenerate or crop it for the
  zone; the composer refuses distortion.
- The same asset may be reused only when the visual thesis genuinely repeats.
- `scene` images carry the explanation; `background` images remain contextual and are not the
  default.

## Completeness and idempotence

Every `canvas` band in the base deck must have exactly one composition entry. The composer rejects
missing, duplicate, or non-canvas targets. Running it again replaces elements marked as Beautidraw
composition content rather than stacking duplicates.

Before writing output, the composer validates the converted/restored elements rather than trusting
declared geometry. It fails closed on body overflow, duplicate frame children, unresolved bound
text, text below the 12px fit-zoom floor, insufficient text contrast, and unintended overlap.
Images in `scene` or `background` mode may intentionally sit behind annotations; `side` and `focal`
images may not overlap other composition elements. Direct text may not sit unbacked over an image;
use a filled callout with bound text when an annotation must overlap arbitrary imagery. Connector
paths still require visual QA because line/arrow crossings may be intentional.

The output directory receives the completed `deck.excalidraw`, final `scene.png`, one PNG per band,
and `composition-manifest.json` with asset hashes, dimensions, modes, uses, and lane assignments.
