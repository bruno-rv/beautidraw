# beautidraw

A Claude Code plugin that turns a document or a topic into a single `.excalidraw` presentation:
one continuous canvas, sections stacked top to bottom, each wrapped in a numbered frame. Opened
and panned by hand on excalidraw.com — no slideshow, no export, no presenter mode.

The design decision the whole thing rests on: **the model never types a coordinate.** It writes
semantic content into a `deck-spec.json`; a deterministic layout engine running inside a real
browser computes every coordinate from Excalidraw's own text measurement.

## Install

```
pnpm install
pnpm bundle       # builds scripts/vendor/ from the pinned @excalidraw/excalidraw
```

`scripts/vendor/` is a 27 MB build artifact and is not committed. Nothing runs until
`pnpm bundle` has produced it.

## Use

As a plugin, invoke the `beautidraw` skill, or the `/beautidraw-from-doc` and
`/beautidraw-from-topic` commands.

Directly:

```
node scripts/generate.mjs <spec.json> <outdir>
```

Writes `deck.excalidraw`, one `band-NN.png` per band, `scene.png`, and `diagnostics.json`.
Resolves its own root, so it runs from any working directory.

Try it against the worked example:

```
node scripts/generate.mjs examples/hr-ai/deck-spec.json examples/hr-ai/out
```

## Layout

```
.claude-plugin/plugin.json     plugin manifest
skills/beautidraw/             SKILL.md + references/ — how to write a deck-spec
commands/                      two thin entry points
scripts/                       layout engine, generator, harness, bundler
scripts/spike/                 measurement probes; probe-06 is the viewer-drift gate
examples/                      a worked deck-spec, and the reference artifact
docs/                          PLAN.md, its 15-round review transcript, design notes
```

## Maintenance

The engine's geometry is only correct as long as the pinned bundle agrees with what
excalidraw.com actually renders. That is verified, not assumed:

```
pnpm spike           # 7 offline probes, ~12s
pnpm spike:network   # adds probe-06, which measures against live excalidraw.com
```

`pnpm spike:network` is the **only** thing that detects viewer drift — the build is hermetic, so
a normal run cannot. Re-run it on a schedule. A failure blocks; see the remediation order in
`docs/PLAN.md`.

`scripts/LAYOUT-CONTRACT.md` records every engine constant and the measurement behind it. Read
it before changing any of them.
