# beautidraw

A Claude Code plugin that turns a document or a topic into a single `.excalidraw` presentation:
one continuous canvas, sections stacked top to bottom, each wrapped in a numbered frame. Opened
and panned by hand on excalidraw.com — no slideshow, no export, no presenter mode.

The design decision the whole thing rests on: **the model never types a coordinate.** It writes
semantic content into a `deck-spec.json`; a deterministic layout engine running inside a real
browser computes every coordinate from Excalidraw's own text measurement.

## Setup

**Prerequisites: Node 20+ and [pnpm](https://pnpm.io/installation).** The dependency tree is
pinned with `pnpm-lock.yaml`, so pnpm is required and setup will not bootstrap it for you —
installing global tooling behind your back is worse than failing with a message.

Three further things are required and none are committed: dependencies, a Chromium binary, and
the 27 MB vendored Excalidraw bundle. One idempotent command provides all three:

```
node scripts/setup.mjs        # from a clone of this repo; or: pnpm setup
```

From anywhere else — including a plugin install — give the full path:
`node /path/to/beautidraw/scripts/setup.mjs`. The skill uses
`"${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs"`.

Re-running it on a provisioned tree prints `already provisioned` and does nothing. It is safe
to call on every invocation, which is what the commands do. It re-checks rather than trusting a
marker: dependency versions against the pins, `pnpm-lock.yaml` against the last completed
install, and the vendored bundle and fonts against the pinned package's own bytes.

## Use

As a plugin: invoke the `beautidraw` skill, or `/beautidraw:from-doc` and
`/beautidraw:from-topic`. Installed plugins namespace their commands, hence the prefix.

Directly — the script path must be reachable from wherever you are, so give it in full:

```
node /path/to/beautidraw/scripts/generate.mjs <spec.json> <outdir>
```

Writes `deck.excalidraw`, one `band-NN.png` per band, `scene.png`, and `diagnostics.json`. The
script resolves its *own* root from `import.meta.url`, so it finds the bundle and harness no
matter where it is invoked from; the two arguments are yours and resolve against your cwd.

Try it against the worked example, from a clone of this repo:

```
node scripts/generate.mjs examples/hr-ai/deck-spec.json examples/hr-ai/out
```

## Layout

```
.claude-plugin/plugin.json     plugin manifest
skills/beautidraw/             SKILL.md + references/ — how to write a deck-spec
commands/                      two thin entry points
scripts/                       layout engine, generator, harness, setup, bundler
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
