# Task 3 RED/GREEN report

## Scope

Implemented the semantic outline, overview chrome, role-aware measurement,
semantic callouts, portable image manifest, and transactional `build-deck`
golden path from `task-3-brief.md`.

## RED

- Added `test/outline.test.mjs`, `test/semantic-visuals.test.mjs`, and
  `test/build-recovery.test.mjs` before production changes.
- `node --test test/outline.test.mjs test/semantic-visuals.test.mjs` initially
  failed with `ERR_MODULE_NOT_FOUND` for `scripts/outline.mjs` and a missing
  `fontForRole` export, proving the new tests exercised absent behavior.
- The first integration run failed at the intended new overview legibility
  gate; the check was corrected to use fit-frame zoom rather than fit-all
  scene zoom for a tall deck.
- The first composed run exposed mono inspect-text geometry and semantic
  callout placement overlaps; placement and measurement were adjusted until
  the existing no-overlap and body-bounds validators passed.

## GREEN

Focused and full verification:

```text
node --test test/outline.test.mjs test/semantic-visuals.test.mjs
  6 passed
node --test test/build-recovery.test.mjs
  2 passed
node --test
  50 passed, 0 failed
node scripts/spike/probe-07-text-geometry.mjs
  all assertions hold
node scripts/spike/probe-08-font-gate.mjs
  all assertions hold
node --check scripts/*.mjs scripts/spike/*.mjs
node --check test/*.mjs
git diff --check
  clean
```

The real Claude successful build completed through `build-deck` and emitted
14 frames, 14 band PNGs, `deck.excalidraw`, `scene.png`, `diagnostics.json`,
`composition-manifest.json`, and `outline.md`. The recovery test also proved a
missing asset preserves an existing sentinel and leaves no stage/backup
residue.

## Contract evidence

- `layoutDeck()` emits unframed `deck-overview-map`,
  `deck-overview-navigation`, and `deck-overview-small-screen` elements and
  records their converted bounds in diagnostics before frame 01.
- `FONT`/`FONT_NAME` now include prose, mono, and handwritten roles;
  `fontForRole()` defaults unknown roles to prose. Role metadata is carried in
  requirements, converter skeletons, composition text descriptors, and
  diagnostics. Inspect text is mono.
- Semantic callouts accept only `example`, `boundary`, `inspect`, and
  `warning`; each carries `customData.semanticKind` and a visible label using
  native ellipse/diamond/line/triangle primitives.
- Composition manifests contain versioned `images` plus compatibility `assets`
  entries with deck-relative `path`, SHA-1, dimensions, use, and description.
  Embedded Excalidraw files include `created` metadata. Structured-only builds
  emit exactly `{ "version": 1, "bands": [], "images": [] }`.
- `build-deck` preflights before setup, captures child output, performs all work
  in a sibling stage, writes outline/final diagnostics/manifest before receipt,
  publishes atomically, and prints final published paths. Publication cleanup
  warnings are surfaced explicitly.

## Remaining concerns

- The current example specs omit explicit `kind` on legacy callouts; the locked
  runtime compatibility rule treats omitted kinds as `example` while rejecting
  unsupported explicit kinds. Example-spec migration can make every kind
  explicit in its owning task.
- `Excalifont` is exposed as the handwritten role and measured when used; the
  current font setup gate only needs to load it if a spec actually emits a
  handwritten annotation.

## Fix Round 1 evidence

Reviewer findings were addressed with focused RED tests first:

- `buildOutline()` now includes canvas family/focus/caption/nodes/axes,
  threshold decision fields, band relations, and timeline `at` values. The
  outline fixture asserts each authored field survives in order.
- Canvas strings now enter role-aware font requirements; composed descriptors,
  bound labels, and final converted text elements carry prose/mono/handwritten
  roles and measured family ids. Inspect commands use mono; prose remains
  prose. The Claude integration test checks final roles and semantic kinds.
- Omitted legacy callout kinds and legacy string callouts have an explicit,
  tested temporary `example` compatibility rule. Unsupported explicit kinds
  still fail. `semanticIcon()` is used for inspect primitives and preserves a
  visible label.
- Markdown headings collapse authored newlines and escape heading/link syntax;
  POSIX and Windows absolute-path regressions pass. Composition image paths
  reject absolute paths and `..` traversal before reading, while auto-compose
  stages source-relative copies and emits portable manifest paths.
- `build-deck` validates every final artifact and exact `band-NN.png` count
  before receipt/publication, records a `band-png` deliverable category, and
  has a rollback regression for a deliberately missing final artifact.

Fix-round verification:

```text
node --test
  56 passed, 0 failed
node scripts/spike/probe-07-text-geometry.mjs
  all assertions hold
node scripts/spike/probe-08-font-gate.mjs
  all assertions hold
node --check scripts/*.mjs test/*.mjs
git diff --check
  clean
```

## Fix Round 2 evidence

The final Markdown/path-safety blocker was fixed narrowly after RED coverage
for arbitrary POSIX roots (`/srv`, `/data`), punctuation-adjacent paths,
Windows drive paths, escaped UNC paths, `file://` URLs, and preserved
single-token slash commands (`/context`, `/memory`, `/tasks`). The outline now
uses token-aware general detection: web URLs are excluded from filesystem
checks, file URLs are always rejected, and multi-segment POSIX/UNC/drive paths
are rejected without treating slash commands as path escapes.

Verification after the fix:

```text
node --test
  58 passed, 0 failed
node --test test/outline.test.mjs test/semantic-visuals.test.mjs test/build-recovery.test.mjs
  16 passed, 0 failed
node scripts/spike/probe-07-text-geometry.mjs
  all assertions hold
node scripts/spike/probe-08-font-gate.mjs
  all assertions hold
node --check scripts/*.mjs test/*.mjs
git diff --check
  clean
```

The real Claude build/recovery tests passed, including final artifact
validation and prior-output preservation.

## Fix Round 3 evidence

Added no-whitespace regressions for `=/srv/private/secret`,
`foo,/srv/private/secret`, `foo:/srv/private/secret`, parenthesized and quoted
forms, plus allowed `/context` and `https://example.com/path`. The POSIX
detector now uses a token boundary that accepts arbitrary punctuation before a
multi-segment absolute path while refusing slashes embedded in legitimate
relative paths such as `apps/web/.claude/skills`.

Final Fix Round 3 verification:

```text
node --test
  60 passed, 0 failed
node --test test/outline.test.mjs test/semantic-visuals.test.mjs test/build-recovery.test.mjs
  18 passed, 0 failed
node scripts/spike/probe-07-text-geometry.mjs
  all assertions hold
node scripts/spike/probe-08-font-gate.mjs
  all assertions hold
node --check scripts/*.mjs test/*.mjs
git diff --check
  clean
```

The real Claude build/recovery path passed after the boundary correction.

## Fix Round 4 evidence

### RED

- Added regressions for `/etc`, `/tmp`, and `/private`, authored backticks and
  newlines, string/array annotation forms, escaping semantic/manual image
  symlinks, final role/font-family parity, converter-sized containers, and
  preservation of a long authored callout plus handwritten annotations.
- The focused suite first failed on the missing singleton-root rejection,
  trusted backtick path, missing annotation export, missing handwritten corpus,
  and missing symlink containment. The annotated real-build regression then
  failed until composition rendered annotations and full text.

### GREEN

- Auto-composed text no longer uses character-count wrapping, `fitChars`, or
  ellipsis. Text roles are sent to Excalidraw conversion; labels are measured
  with their declared role/font and containers receive converter-derived bounds
  plus padding. Long direct text uses a measured transparent text container,
  preserving authored text while respecting the body zone.
- Final composition/layout assertions enforce role-to-font-family parity and
  measured label geometry. `visual.annotation` and `visual.annotations` are
  normalized in order, rendered as short handwritten elements with role,
  font-family, custom metadata, and frame membership, and emitted in outline
  order.
- Outline path checks reject singleton POSIX roots while retaining slash
  commands, remove trusted backtick delimiters, normalize newlines, and keep
  generated code spans under formatter ownership.
- Semantic, manual, and frame-background asset reads/copies resolve realpaths
  and reject broken or escaping symlink targets before I/O; portable manifest
  paths remain source-relative.

Verification:

```text
node --test test/outline.test.mjs test/semantic-visuals.test.mjs test/build-recovery.test.mjs
  25 passed, 0 failed
node --test
  67 passed, 0 failed
node scripts/spike/probe-07-text-geometry.mjs
  all assertions hold
node scripts/spike/probe-08-font-gate.mjs
  all assertions hold
node --check scripts/*.mjs scripts/spike/*.mjs
node --check test/*.mjs
git diff --check
  clean
```

The real Claude build and annotated Claude build both completed through
transactional recovery with all deliverables. Remaining risk: annotations and
very long prose are fail-closed if converter-derived bounds cannot fit their
declared visual zone; no approximation or truncation is reintroduced.

### Self-review

- Scope stayed within Task 3 semantic/composition/outline/asset paths plus the
  existing manual frame-background reader needed to close the same asset trust
  boundary. No generated deck outputs or unrelated cleanup were changed.
- Existing structured layout, role defaults, error routing, body bounds,
  contrast, overlap, and recovery gates remain enabled; all current tests and
  probes pass.
