# Semantic visuals

`canvas` bands are authored in `deck-spec.json`; the model describes the relationship and the
automatic composer computes coordinates. Do not write normalized positions in ordinary deck work.

```jsonc
{
  "pattern": "canvas",
  "height": 720,
  "visual": {
    "family": "illustration",
    "focus": "the central idea or system",
    "nodes": [
      { "label": "short label", "note": "why this node matters" }
    ],
    "explanation": "the mechanism or consequence in two sentences",
    "example": "a concrete repository or command-level scenario",
    "evidence": ["a concrete example or source-backed observation"],
    "tradeoff": "the boundary or decision this creates",
    "inspect": "the command or file that verifies the claim",
    "callouts": [{ "label": "short label", "note": "why it matters" }],
    "image": { "file": "assets/topic-scene.png", "side": "left", "use": "what the scene explains" },
    "caption": "one sentence that explains the relationship",
    "surface": "light"
  }
}
```

## Families

Choose the family by relationship, not by colour:

| Family | Visual argument | Useful inputs |
|---|---|---|
| `illustration` | a topic-specific raster scene carries the intuition while callouts add precision | `image`, `focus`, `callouts`, depth fields |
| `orbit` | several levers converge on one focal system | `focus`, `nodes` |
| `field` | options sit on two meaningful dimensions | `nodes`, `axisX`, `axisY` |
| `spotlight` | one focal idea is surrounded by reasons and implications | `focus`, `callouts` |
| `constellation` | related ideas form a neighborhood without a forced order | `nodes`, `focus` |
| `evidence` | a claim is surrounded by sources, examples, or observations | `focus`, `nodes`, `evidence` |
| `matrix` | options become legible on two decision dimensions | `focus`, `nodes`, `axisX`, `axisY` |
| `threshold` | a boundary separates two meanings or decisions | `left`, `middle`, `right`, `nodes` |
| `map` | a hub connects a non-linear neighborhood | `focus`, `nodes` |

`pipeline` and `journey` remain available for genuinely sequential claims, but they are legacy
families and are not part of the automatic rotation. `tension` is also retained for compatibility;
prefer `threshold` when the visual argument is a boundary rather than a process.

`nodes` may be short strings or `{label, note}` objects. Keep labels scannable and put the depth in
`explanation`, `example`, `evidence`, `tradeoff`, `inspect`, or `callouts`, not in a tiny label. The composer wraps
labels, rotates palette roles, alternates shape types, and uses connectors only when the family
needs them.

## What the composer owns

- normalized coordinates and spacing;
- shape choice and palette variants;
- connector paths and arrow direction;
- surface colour and readable text colour;
- Excalidraw conversion, frame membership, and validation.

The generated `auto-composition-spec.json` is an inspection artifact. It is not the input contract.
Only reach for the low-level `composition-spec.json` when a frame needs a custom image placement or
one-off element that the semantic families cannot express.

For a 10+ band deck, use at least two `illustration` frames with different visual metaphors. The
automatic composer reads each PNG's dimensions and fits a side zone without hand-authored geometry.
Keep the asset text-free and review it before building the deck.
