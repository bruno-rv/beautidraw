# Beautidraw Elite Product Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` to implement this plan task by
> task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Beautidraw's one-command authoring path complete, recoverable,
accessible, editor-faithful, and capable of producing three concept-first
mixed-media learning canvases at an elite product-quality bar.

**Architecture:** Preserve Excalidraw as the editor and presentation surface.
Add pure preflight, diagnostic, staging, receipt, and outline modules around
the existing generator/composer; make semantic text and image metadata flow
through one measured rendering contract; verify the real editor at two desktop
viewports. Migrate the three examples after the runtime contracts are locked,
then remove the hidden wallpaper/post-processing path.

**Tech Stack:** Node.js ESM, Node's built-in test runner, Playwright Chromium,
Excalidraw 0.18.1 offline bundle, React 19, PNG raster assets, JSON deck specs,
Markdown accessible outlines.

**Spec:**
`docs/superpowers/specs/2026-08-23-elite-product-polish-design.md`

## Global Constraints

- Preserve the current approved dirty baseline; never reset or overwrite it.
- Work on `codex/elite-product-polish`; do not push, merge, or publish.
- Use TDD: each behavior change begins with a focused test that is observed
  failing for the expected reason.
- Keep Excalidraw as the only editor/viewer; do not add a hosted or standalone
  presentation runtime.
- `node scripts/build-deck.mjs <spec> <out>` remains the golden path.
- A successful build emits `deck.excalidraw`, every `band-NN.png`, `scene.png`,
  `diagnostics.json`, `composition-manifest.json`, and `outline.md`.
- `visual.image` is the only image contract. `use` states the learning purpose;
  `description` is a separate mandatory accessible description.
- The overview is an unframed opening block containing the ordered frame map
  and the instruction to use frame navigation instead of fit-all. Existing
  frame and band counts remain unchanged.
- Semantic icon kinds are exactly `example`, `boundary`, `inspect`, and
  `warning`; every icon retains a visible text label.
- Handwritten text is short annotation only. Prose paragraphs use the prose
  role; commands, paths, literals, and measured values use the mono role.
- At 1600x900 and 1280x800, fit-frame effective text is at least 12 px and no
  text, image, or control is clipped or overlapped.
- At 1024x768 and 800x600, the accessible outline is the supported reading
  surface and the overview must say so clearly.
- Failed builds preserve the previous successful output and remove their own
  staging directory.
- Normal CLI failures omit stacks and arbitrarily large input values;
  `--debug` is the only stack-bearing mode.
- Performance guardrails on the reference machine: setup no-op <=0.25 s;
  audit <=0.05 s; generation <=1.0 s and <=600 MB RSS; 13-band composition
  <=2.2 s and <=850 MB RSS; full build <=3.5 s and <=850 MB RSS; offline
  probes <=9 s; composed output <40 MB.
- Generated `out/` directories are evidence only and remain ignored.
- Every task requires: worker self-review, assigned task reviewer approval,
  then a separate adversarial Codex approval. Important findings return to the
  original worker and both reviews repeat until reconciled.

---

## Controller setup before Task 1

The approved starting state is intentionally dirty. Before any worker runs,
the controller captures it as one branch-local checkpoint so later task diffs
contain only that worker's changes.

```sh
git add SKILL.md \
  decks/claude-code-artifacts/deck-spec.json \
  references/semantic-visuals.md \
  scripts/audit-deck-spec.mjs scripts/auto-compose.mjs \
  scripts/build-deck.mjs scripts/compose.mjs scripts/generate.mjs \
  scripts/setup.mjs scripts/embed-frame-backgrounds.mjs \
  decks/llm-token-flow decks/rag-vector-graph
git diff --cached --name-only | tee /tmp/beautidraw-approved-baseline-files.txt
if rg -q '/out/' /tmp/beautidraw-approved-baseline-files.txt; then
  echo "Refusing to checkpoint ignored generated output" >&2
  exit 1
fi
git diff --cached --check
git commit -m "chore: checkpoint current beautidraw work"
```

The controller records that commit in the SDD ledger. Before every task commit,
the worker runs `git diff --cached --name-only` and confirms every staged path
appears in that task's **Files** list. Workers stage exact paths; broad
`git add test`, `git add assets`, and `git add references` commands are
forbidden.

---

### Task 1: Shared CLI diagnostics and early preflight

**Files:**
- Create: `scripts/cli.mjs`
- Create: `scripts/preflight.mjs`
- Create: `test/cli.test.mjs`
- Create: `test/preflight.test.mjs`
- Create: `test/entrypoints.test.mjs`
- Create: `test/fixtures/minimal-deck.json`
- Modify: `package.json`
- Modify: `scripts/audit-deck-spec.mjs`
- Modify: `scripts/generate.mjs`
- Modify: `scripts/auto-compose.mjs`
- Modify: `scripts/compose.mjs`
- Modify: `scripts/setup.mjs`
- Modify: `scripts/build-bundle.mjs`
- Modify: `scripts/spike/run-all.mjs`
- Modify: `scripts/build-deck.mjs`
- Modify: `decks/claude-code-artifacts/deck-spec.json`
- Modify: `decks/claude-code-artifacts/image-asset-manifest.json`

**Interfaces:**
- Produces `CliError`, `parseCli()`, `formatDiagnostic()`, and `runCli()` from
  `scripts/cli.mjs`.
- Produces `CONTENT_BUDGETS`, `readJsonInput()`,
  `collectDeckPreflightFailures()`, and `preflightDeck()` from
  `scripts/preflight.mjs`.
- Later tasks consume the same diagnostic and preflight contracts; no later
  task may duplicate JSON parsing, content budgets, or asset validation.

- [ ] **Step 1: Add the built-in test entry point and minimal valid fixture**

```json
{
  "scripts": {
    "test": "node --test"
  }
}
```

The fixture contains a title, subtitle, and one valid structured frame using
the current deck schema. Do not add a test dependency.

- [ ] **Step 2: Write failing CLI behavior tests**

```js
test("help succeeds without positional arguments", () => {
  assert.deepEqual(parseCli(["--help"], config), {
    help: true,
    debug: false,
    values: {},
  });
});

test("normal diagnostics omit stacks and name recovery", () => {
  const message = formatDiagnostic(new CliError({
    command: "build-deck",
    stage: "preflight",
    input: "/tmp/missing.json",
    reason: "file does not exist",
    recovery: "Pass an existing deck-spec.json path.",
    cause: new Error("ENOENT internal stack"),
  }));
  assert.match(message, /stage: preflight/);
  assert.match(message, /recovery: Pass an existing/);
  assert.doesNotMatch(message, /at .*\.mjs:/);
});
```

Run `node --test test/cli.test.mjs`; expect module-not-found failure for
`scripts/cli.mjs`.

- [ ] **Step 3: Implement the minimal shared CLI contract**

```js
export class CliError extends Error {
  constructor({ command, stage, input, reason, recovery, cause } = {}) {
    super(reason, cause ? { cause } : undefined);
    Object.assign(this, { command, stage, input, reason, recovery });
  }
}

export function parseCli(argv, {
  command,
  usage,
  positional = [],
  options = ["--debug"],
} = {}) {}

export function formatDiagnostic(error, { debug = false } = {}) {}

export async function runCli(command, main, {
  argv = process.argv.slice(2),
  usage,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {}
```

`runCli()` returns a numeric status for tests and sets `process.exitCode` only
in the entry-point adapter.

- [ ] **Step 4: Write failing preflight tests for every observed bad input**

Test missing/malformed JSON, non-object bands, missing image, truncated PNG,
missing `visual.image.description`, oversized thesis/explanation/inspect/
footer/callout fields, and a 12,000-character heading. Assert field paths and
measured counts; assert that messages do not echo the large value.

```js
test("missing semantic image fails before browser work", async () => {
  const result = await preflightDeck({ specPath, spec: deckWithMissingImage });
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].stage, "preflight");
  assert.match(result.failures[0].reason, /visual\.image\.file/);
});
```

Run `node --test test/preflight.test.mjs`; expect missing exports.

- [ ] **Step 5: Extract the current audit rules into pure preflight functions**

```js
export const CONTENT_BUDGETS = Object.freeze({
  thesisChars: 120,
  footerChars: 560,
  inspectChars: 84,
  explanationWords: 140,
  calloutLabelChars: 72,
  calloutNoteChars: 180,
});

export async function readJsonInput(path, { label = "JSON input" } = {}) {}
export function collectDeckPreflightFailures(spec, { specPath, specDir } = {}) {}
export async function preflightDeck({ specPath, spec } = {}) {}
```

Validate the PNG signature, IHDR presence, positive dimensions, readable file,
deck-relative path, `use`, and `description`. Reuse `planDeck()` for the core
schema and call the pure semantic audit from both `preflightDeck()` and
`audit-deck-spec.mjs`.

- [ ] **Step 6: Wire every public entry point to shared help and diagnostics**

Commands covered by smoke tests are `build-deck.mjs`, `audit-deck-spec.mjs`,
`generate.mjs`, `auto-compose.mjs`, `compose.mjs`, `setup.mjs`,
`build-bundle.mjs`, and `scripts/spike/run-all.mjs`. `--help` must exit 0 and
print concrete usage. Invalid input must exit nonzero without a raw stack.

Run `node --test test/cli.test.mjs test/preflight.test.mjs
test/entrypoints.test.mjs`; expect all tests to pass.

- [ ] **Step 7: Migrate the incumbent Claude image descriptions**

Add a distinct `description` beside each existing `use` in both the spec and
manifest. Use these exact descriptions:

- `control-plane-hero.png`: “Paper-cut developer control room showing context,
  tools, trust, state, and extension sources around one working session.”
- `monorepo-city.png`: “Top-down repository city whose illuminated billing
  district shows how path-scoped instructions narrow to one package.”
- `settings-precedence-layers.png`: “Translucent configuration layers resolving
  into one value beside separate merge strands and a restrictive safety clamp.”
- `trust-boundary.png`: “Handcrafted scene contrasting soft guidance with a
  lockable enforcement gate and a deliberate human decision.”

Do not otherwise polish the Claude deck in this task.

- [ ] **Step 8: Run the existing audits and syntax gate**

```sh
node --check scripts/*.mjs scripts/*.js scripts/spike/*.mjs
node scripts/audit-deck-spec.mjs decks/claude-code-artifacts/deck-spec.json
git diff --check
```

The Claude audit must still pass; the LLM and RAG specs may remain failing
until Tasks 6 and 7.

- [ ] **Step 9: Commit the task**

```sh
git add package.json scripts/cli.mjs scripts/preflight.mjs \
  scripts/audit-deck-spec.mjs scripts/generate.mjs \
  scripts/auto-compose.mjs scripts/compose.mjs scripts/setup.mjs \
  scripts/build-bundle.mjs scripts/spike/run-all.mjs scripts/build-deck.mjs \
  decks/claude-code-artifacts/deck-spec.json \
  decks/claude-code-artifacts/image-asset-manifest.json \
  test/cli.test.mjs test/preflight.test.mjs test/entrypoints.test.mjs \
  test/fixtures/minimal-deck.json
git commit -m "feat: fail early with useful diagnostics"
```

---

### Task 2: Transactional build publication and success receipt

**Files:**
- Create: `scripts/staging.mjs`
- Create: `scripts/build-receipt.mjs`
- Create: `test/staging.test.mjs`
- Create: `test/receipt.test.mjs`
- Modify: `scripts/preflight.mjs`
- Modify: `scripts/generate.mjs`
- Modify: `scripts/audit-deck-spec.mjs`
- Modify: `scripts/compose.mjs`
- Modify: `scripts/spike/probe-09-mixed-lanes.mjs`
- Modify: `test/preflight.test.mjs`

**Interfaces:**
- Consumes `CliError`, `runCli()`, and `preflightDeck()` from Task 1.
- Produces `withStagedOutput()`, `publishStagedOutput()`,
  `collectBuildReceipt()`, and `formatBuildReceipt()`.
- Task 3 integrates these pure modules only after `outline.md` and the complete
  manifest contract exist.

- [ ] **Step 0: Resolve the carried manual-composition preflight ruling**

Task 1's five-round breaker left one real load-bearing regression: automatic
semantic validation was applied to the established manual-composition path.
Split the contract without weakening either mode:

```js
export async function preflightDeck({
  specPath,
  spec,
  mode = "automatic", // "automatic" | "core"
} = {}) {}
```

`core` validates deck shape, content budgets, and any semantic assets that are
actually declared, but permits a canvas band with no `visual` because a manual
composition spec supplies it later. `automatic` additionally requires the
semantic `visual` contract for every canvas band. `generate.mjs` uses `core`;
`build-deck` and `auto-compose` use `automatic`; audit uses `automatic` without
a manual composition path and `core` plus composition validation when one is
provided. Manual composition images still require distinct `use` and
`description` values.

Write RED tests proving a manual canvas without `visual` passes core preflight
but fails automatic preflight. Add descriptions to the manual image entries in
`probe-09-mixed-lanes.mjs`, then require both of these gates before continuing:

```sh
node scripts/spike/probe-09-mixed-lanes.mjs
pnpm spike
```

- [ ] **Step 1: Write failing rollback and receipt tests**

```js
test("failed build preserves the previous output", async () => {
  await fs.mkdir(outDir);
  await fs.writeFile(join(outDir, "sentinel.txt"), "last good build");
  await assert.rejects(() => withStagedOutput(outDir, async stageDir => {
    await fs.writeFile(join(stageDir, "partial.txt"), "partial");
    throw new Error("composition failed");
  }));
  assert.equal(await fs.readFile(join(outDir, "sentinel.txt"), "utf8"),
    "last good build");
  assert.equal(await pathExists(join(outDir, "partial.txt")), false);
});
```

Also test injected publish failure restores the backup and removes the stage.
Receipt tests use a synthetic complete stage containing deck, scene,
diagnostics, manifest, and outline fixtures; test frame count, embedded file
count, recursive byte count, elapsed time, and all five absolute paths.

Run `node --test test/staging.test.mjs test/receipt.test.mjs`; expect missing
module failures.

- [ ] **Step 2: Implement rollback-safe sibling staging**

```js
export async function withStagedOutput(outDir, build, io = {}) {}
export async function publishStagedOutput(stageDir, outDir, io = {}) {}
```

Publish sequence: create a unique sibling stage, build there, rename any
existing output to a unique sibling backup, rename stage to output, restore the
backup if publication fails, then remove the backup only after success. Never
use `rm(outDir)` before the replacement is safely staged.

- [ ] **Step 3: Implement the compact receipt**

```js
export async function collectBuildReceipt(stageDir, {
  elapsedMs,
  publishedOutDir,
} = {}) {
  return {
    elapsedMs,
    frameCount: 0,
    embeddedAssetCount: 0,
    totalBytes: 0,
    paths: {
      deck: "",
      scene: "",
      diagnostics: "",
      manifest: "",
      outline: "",
    },
  };
}

export function formatBuildReceipt(receipt) {}
```

The formatted receipt prints elapsed time, frames, embedded assets, bytes, and
direct paths. Counts and byte sizes come from `stageDir`; every returned path
is resolved under `publishedOutDir`, never the temporary stage. The receipt is
formatted and printed only after publication succeeds. Tests assert no stage
directory token survives in any path. Do not create a redundant receipt JSON
artifact.

- [ ] **Step 4: Verify the pure publication modules without a product build**

Use temporary synthetic output trees to prove successful publication, failed
build cleanup, injected rename failure rollback, byte counting, and all receipt
paths. Do not modify `build-deck.mjs` in this task; Task 3 owns the integration
after the semantic deliverables are implemented.

- [ ] **Step 5: Run the focused unit tests**

Run `node --test test/staging.test.mjs test/receipt.test.mjs` and
`git diff --check`.

- [ ] **Step 6: Commit the task**

```sh
git add scripts/staging.mjs scripts/build-receipt.mjs \
  test/staging.test.mjs test/receipt.test.mjs \
  scripts/preflight.mjs scripts/generate.mjs scripts/audit-deck-spec.mjs \
  scripts/compose.mjs scripts/spike/probe-09-mixed-lanes.mjs \
  test/preflight.test.mjs
git commit -m "feat: add rollback-safe build staging"
```

---

### Task 3: Semantic outline, image descriptions, mono roles, and icons

**Files:**
- Create: `scripts/outline.mjs`
- Create: `test/outline.test.mjs`
- Create: `test/semantic-visuals.test.mjs`
- Create: `test/build-recovery.test.mjs`
- Modify: `scripts/audit-deck-spec.mjs`
- Modify: `scripts/auto-compose.mjs`
- Modify: `scripts/compose.mjs`
- Modify: `scripts/layout.mjs`
- Modify: `scripts/generate.mjs`
- Modify: `scripts/build-deck.mjs`
- Modify: `scripts/LAYOUT-CONTRACT.md`
- Modify: `references/deck-spec.md`
- Modify: `references/semantic-visuals.md`
- Modify: `references/visual-system.md`

**Interfaces:**
- Consumes the staged output and preflight contracts from Tasks 1-2.
- Produces `buildOutline(spec, context)`, `fontForRole(role)`, role-bearing
  semantic text descriptors, and callouts with `kind`.
- Example tasks consume the locked schema: `visual.image.description` and
  `callouts[].kind`.

- [ ] **Step 1: Write failing outline and semantic-schema tests**

```js
test("outline preserves the full ordered learning content", () => {
  const markdown = buildOutline(spec, {
    frameNames: ["01 Context", "02 Boundary"],
    compositionManifest,
  });
  assert.match(markdown, /^# Deck title/m);
  assert.ok(markdown.indexOf("## 01 Context") < markdown.indexOf("## 02 Boundary"));
  assert.match(markdown, /Image: A layered system/);
  assert.match(markdown, /`\/context`/);
  assert.match(markdown, /\[Inspect source\]\(https:\/\//);
});
```

Add tests that missing descriptions fail, unsupported icon kinds fail, every
icon has a label, and mono roles route to the declared mono font. Run the two
test files; expect missing exports/behavior.

- [ ] **Step 2: Implement the pure outline generator**

```js
export function buildOutline(spec, {
  frameNames = [],
  compositionManifest = {},
} = {}) {}
```

Emit deck title/subtitle, overview/frame map, ordered frame headings, thesis,
mechanism, example, boundary, inspection text, callout kinds/labels, image
descriptions, commands as fenced or inline code, and only real URLs as links.
Write `outline.md` inside the stage before final diagnostics and receipt.

The unframed overview is generated from existing fields rather than introducing
a deck-spec field:

```js
export function buildOverview(spec) {
  return {
    title: spec.title,
    subtitle: spec.subtitle,
    frames: spec.bands.map((band, index) => ({
      name: `${String(index + 1).padStart(2, "0")} ${band.heading}`,
    })),
    navigation: "Use Excalidraw frame navigation for reading; use outline.md on smaller screens.",
  };
}
```

Render the overview into the existing unframed opening block, include its text
in font requirements and bounds checks, and mirror it in the outline. Frame and
band counts stay unchanged. `layoutDeck()` emits stable IDs
`deck-overview-map`, `deck-overview-navigation`, and
`deck-overview-small-screen`. The map begins below the existing subtitle,
stays within `[PAGE_X + MARGIN, PAGE_X + PAGE_WIDTH - MARGIN]`, and pushes the
first frame down rather than overlapping it. `generate.mjs` includes the three
IDs in browser bounds/legibility diagnostics and tests assert they precede the
first frame.

- [ ] **Step 3: Make text roles explicit and measured**

```js
export const FONT = { prose: 6, mono: 3, handwritten: 5 };
export const FONT_NAME = {
  prose: "Nunito",
  mono: "Cascadia",
  handwritten: "Excalifont",
};

export function fontForRole(role) {
  const normalized = role === "mono" || role === "handwritten" ? role : "prose";
  return { family: FONT[normalized], name: FONT_NAME[normalized] };
}
```

Carry `role` through font requirement collection, converter skeletons,
`measureNatural()`, `measureBoundHeight()`, auto-composition text descriptors,
and diagnostics. Inspect commands/paths are mono. Paragraphs are prose.
Handwriting is limited to short annotations.

- [ ] **Step 4: Add the four labelled semantic icons**

```js
const SEMANTIC_KINDS = new Set(["example", "boundary", "inspect", "warning"]);

function semanticIcon(kind, { id, x, y, size, frameId }) {
  return { elements: [], labelAnchor: { x, y } };
}
```

Use native line/ellipse/diamond/triangle primitives with one stroke weight.
Attach `customData.semanticKind` and `frameId`; keep the visible label. Do not
wrap the icon and label in a new card.

- [ ] **Step 5: Make manifests portable and descriptive**

Composition manifest image entries contain deck-relative `path`, SHA-1,
dimensions, `use`, and `description`. Excalidraw file entries include the
type-required `created` field. No absolute source path may appear in the
manifest or outline.

- [ ] **Step 6: Integrate the complete transactional golden path**

`build-deck.mjs` preflights before setup, runs every child stage against the
sibling stage directory, writes `outline.md`, final diagnostics, manifest, and
receipt metadata, then publishes and prints the final-path receipt. A
structured-only deck receives an explicit empty
manifest:

```json
{
  "version": 1,
  "bands": [],
  "images": []
}
```

Child output is captured; a failure becomes one `CliError`. Add
`test/build-recovery.test.mjs` to prove a missing asset preserves an existing
sentinel with no staging residue and a successful Claude build replaces it
only with all six deliverables.

- [ ] **Step 7: Reconcile the layout contract**

Update `scripts/LAYOUT-CONTRACT.md` with the three text roles, overview bounds,
converter-derived measurement rule, 1280x800 fit-frame requirement, and the
prohibition on approximate character-count widths.

- [ ] **Step 8: Run focused and existing verification**

```sh
node --test test/outline.test.mjs test/semantic-visuals.test.mjs
node --test test/build-recovery.test.mjs
node scripts/spike/probe-07-text-geometry.mjs
node scripts/spike/probe-08-font-gate.mjs
git diff --check
```

- [ ] **Step 9: Commit the task**

```sh
git add scripts/outline.mjs scripts/audit-deck-spec.mjs \
  scripts/auto-compose.mjs scripts/compose.mjs scripts/layout.mjs \
  scripts/generate.mjs scripts/build-deck.mjs scripts/LAYOUT-CONTRACT.md \
  references/deck-spec.md \
  references/semantic-visuals.md references/visual-system.md \
  test/outline.test.mjs test/semantic-visuals.test.mjs \
  test/build-recovery.test.mjs
git commit -m "feat: emit accessible semantic learning output"
```

---

### Task 4: Editor fidelity and accessible harness states

**Files:**
- Create: `test/harness.browser.test.mjs`
- Create: `test/fixtures/editor-fidelity-deck.json`
- Create: `scripts/spike/probe-10-editor-fidelity.mjs`
- Modify: `scripts/outline.mjs`
- Modify: `scripts/preflight.mjs`
- Modify: `scripts/harness.html`
- Modify: `scripts/harness-runner.mjs`
- Modify: `scripts/vendor-entry.js`
- Modify: `scripts/auto-compose.mjs`
- Modify: `scripts/compose.mjs`
- Modify: `scripts/spike/run-all.mjs`
- Modify: `scripts/LAYOUT-CONTRACT.md`
- Modify: `test/outline.test.mjs`
- Modify: `test/semantic-visuals.test.mjs`

**Interfaces:**
- Consumes role-aware measured elements from Task 3.
- Produces `withHarness(fn, { viewport })`, `window.__bdLoadScene(scene)`, and
  `window.__bdWaitForImages(fileIds)`.
- Produces `window.__bdReportFidelity(elements, viewport)` with one record per
  frame: `fitZoom`, `minimumEffectiveTextPx`, `clippedElementIds`,
  `overlapElementIds`, and `obscuredByChromeElementIds`.
- Later example tasks use the browser test to prove their real editor output.

- [ ] **Step 0: Resolve the three carried Task 3 breaker rulings**

Task 3 exhausted five rounds with three load-bearing residuals. Resolve them
before the new harness work:

1. Derive the exact composition-page font corpus from emitted text descriptors
   after semantic composition: every role, font family, actual font size, and
   full text string. In the composition harness, call `document.fonts.load()`
   and `document.fonts.check()` for every exact tuple before converter
   measurement; fail with the missing tuple rather than measuring fallback
   fonts. Add prose, mono, and handwritten browser regressions using actual
   emitted sizes.
2. Route frame headings through a heading-safe Markdown formatter so authored
   link syntax cannot create a link. Reject `~/path` and `~user/path` as
   nonportable home paths while preserving explicit supported slash commands,
   relative repository paths, and real HTTPS links. Add direct injection/home
   path regressions.
3. In direct auto-compose, distinguish an omitted `kind` (temporary legacy
   compatibility) from an explicitly empty/whitespace `kind` (structured
   preflight failure). Add entrypoint and pure-validation regressions.

These are Rulings carried from Task 3, not optional Task 4 polish. Task 4 cannot
complete until its assigned reviewer and adversarial reviewer verify all three.

- [ ] **Step 1: Write the failing dual-viewport browser test**

Test loading -> ready/error visibility, status live semantics, main-menu name,
keyboard traversal, image readiness, frame navigation cue, fit-frame effective
text >=12 px, and no text/image clipping at 1600x900 and 1280x800.

`test/harness.browser.test.mjs` reads
`test/fixtures/editor-fidelity-deck.json`, a checked-in one-frame scene with
prose text, mono text, a bound label, and one embedded 1x1 red PNG. The `deck`
variable below is that parsed fixture, not an ambient global.

```js
for (const viewport of [
  { width: 1600, height: 900 },
  { width: 1280, height: 800 },
]) {
  test(`editor fidelity at ${viewport.width}x${viewport.height}`, async () => {
    await withHarness(async ({ page }) => {
      const result = await page.evaluate(deck => window.__bdLoadScene(deck), deck);
      assert.equal(result.state, "ready");
      assert.equal(result.missingImages.length, 0);
      for (const frame of result.frames) {
        assert.ok(frame.minimumEffectiveTextPx >= 12);
        assert.deepEqual(frame.clippedElementIds, []);
        assert.deepEqual(frame.overlapElementIds, []);
        assert.deepEqual(frame.obscuredByChromeElementIds, []);
      }
    }, { viewport });
  });
}
```

Run `node --test test/harness.browser.test.mjs`; expect failures for missing
status UI, APIs, parameterized viewport, and clipping.

- [ ] **Step 2: Add visible and semantic harness states**

`harness.html` starts with a visible loading region, promotes it to
`role="status"`/ready, or replaces it with `role="alert"` containing the error
and recovery. The main menu trigger receives an accessible name without
patching the vendored bundle.

`__bdLoadScene()` catches restore, file-load, decode, timeout, and fidelity
errors and returns:

```js
{
  state: "error",
  error: {
    reason: "Image red did not render before the 2000ms deadline.",
    recovery: "Verify the embedded data URL and rebuild the deck.",
  },
}
```

The browser test supplies one invalid image fixture, asserts this exact shape,
and verifies the visible `role="alert"` text plus keyboard-reachable recovery.

- [ ] **Step 3: Add the deterministic scene/image readiness API**

```js
window.__bdLoadScene = async scene => {
  const elements = window.__bdApi.restoreElements(scene.elements, null);
  window.__bdEditor.updateScene({ elements, appState: scene.appState });
  window.__bdEditor.addFiles(Object.values(scene.files || {}));
  await window.__bdWaitForImages(
    scene.files || {},
    elements.filter(element => element.type === "image"),
  );
  await new Promise(resolve => requestAnimationFrame(() =>
    requestAnimationFrame(resolve)));
  return {
    state: "ready",
    missingImages: [],
    frames: window.__bdReportFidelity(elements, {
      width: innerWidth,
      height: innerHeight,
    }),
  };
};
```

The wait checks successful decode/readiness, not only `getFiles()` membership.
It times out with a named recovery rather than using a fixed sleep.

The harness installs an `Image` constructor wrapper before importing the vendor
bundle. It returns native `HTMLImageElement` instances unchanged while recording
their eventual `load` or `error` state keyed by `img.src`. Because Excalidraw's
own cache loader calls the wrapped constructor, `__bdWaitForImages(files,
imageElements)` observes the exact image instances used by the editor, not an
independent decode. After all referenced data URLs report `load`, it waits two
animation frames. `withHarness()` then compares deterministic cropped canvas
hashes for each image bound against a placeholder-only render of the same scene;
every loaded region must differ from its placeholder hash and remain stable for
two consecutive frames. This rendered-region check proves the editor stopped
painting placeholders without reading a private Excalidraw cache API.

`__bdReportFidelity()` uses the same usable chrome insets as
`LAYOUT-CONTRACT.md`. For each frame it calculates fit zoom from usable
viewport/frame bounds, multiplies every contained text element's font size by
that zoom, compares converted text metrics with serialized width/height, checks
every child bound against its frame, runs pairwise overlap checks using the
same allowlist as composition, and transforms fixed toolbar bounds into scene
coordinates to find obscured elements. It returns element IDs for every
failure; browser tests do not depend on screenshot OCR.

- [ ] **Step 4: Fix editor clipping at the responsible measurement layer**

Remove approximate character-count wrapping and unmeasured manual widths from
auto-composed text. Let Excalidraw conversion determine text metrics for the
loaded role font, then size containers from converted bounds plus explicit
padding. Do not widen frames to hide the defect. Preserve the geometry and
overlap gates.

- [ ] **Step 5: Add `probe-10-editor-fidelity.mjs`**

The probe builds/loads a mixed-media fixture, verifies image readiness, compares
serialized text to editor-visible measured bounds, checks both viewports, and
writes one compact JSON report under `.scratch/spike-artifacts/`. Add it to the
offline probe list.

Update `scripts/LAYOUT-CONTRACT.md` with the fidelity-report tuple, usable
viewport calculation, image-readiness barrier, and element-ID failure report.

- [ ] **Step 6: Run the browser, spike, and detector gates**

```sh
node --test test/harness.browser.test.mjs
pnpm spike
node /Users/bruno/.codex/plugins/cache/impeccable/impeccable/4.0.2/skills/impeccable/scripts/detect.mjs --json scripts/harness.html scripts/vendor-entry.js
```

No screenshot assertion may run before `__bdLoadScene()` reports ready.

- [ ] **Step 7: Commit the task**

```sh
git add scripts/harness.html scripts/harness-runner.mjs \
  scripts/vendor-entry.js scripts/auto-compose.mjs scripts/compose.mjs \
  scripts/spike/run-all.mjs scripts/spike/probe-10-editor-fidelity.mjs \
  scripts/LAYOUT-CONTRACT.md test/harness.browser.test.mjs \
  test/fixtures/editor-fidelity-deck.json
git commit -m "fix: make editor output readable and deterministic"
```

---

### Task 5: Polish the Claude Code exemplar

**Files:**
- Create: `test/claude-code-artifacts.test.mjs`
- Modify: `scripts/harness.html`
- Modify: `scripts/layout.mjs`
- Modify: `scripts/auto-compose.mjs`
- Modify: `scripts/compose.mjs`
- Modify: `scripts/LAYOUT-CONTRACT.md`
- Modify: `test/harness.browser.test.mjs`
- Modify: `decks/claude-code-artifacts/deck-spec.json`
- Modify: `decks/claude-code-artifacts/image-asset-manifest.json`
- Modify only if its source image fails visual review:
  `decks/claude-code-artifacts/assets/control-plane-hero.png`
- Modify only if its source image fails visual review:
  `decks/claude-code-artifacts/assets/monorepo-city.png`
- Modify only if its source image fails visual review:
  `decks/claude-code-artifacts/assets/settings-precedence-layers.png`
- Modify only if its source image fails visual review:
  `decks/claude-code-artifacts/assets/trust-boundary.png`

**Interfaces:**
- Consumes the image-description, icon, mono, outline, and harness contracts.
- Produces the reference mixed-media deck for later documentation and final QA.

- [ ] **Step 0: Resolve the carried Task 4 bound-label fidelity ruling**

Task 4 exhausted five rounds with one load-bearing false-ready path. For bound
text, derive fresh converter measurement from the bound text element's own
serialized `text`, `originalText`, `fontSize`, `fontFamily`, line height, and
alignment tuple. Explicitly reject disagreement between that element and the
container's duplicated `label` before comparing geometry. Add a browser
regression that lengthens only the bound text element while leaving the
container label/metadata stale; `geometryElementIds` must name both sides of
the mismatch and the scene must not reach Ready.

This is a Ruling carried from Task 4 and must pass the assigned and adversarial
Task 5 reviews before exemplar polish is accepted.

- [ ] **Step 1: Write the failing exemplar contract test**

Add `test/claude-code-artifacts.test.mjs` requiring:
four image descriptions, portable manifest paths, at least one labelled inspect
icon, mono inspection commands, an overview frame map, and all 14 stable frame
names. Run it and observe the missing-icon/mono/overview failures.

- [ ] **Step 2: Tighten the opening overview and every frame's focal hierarchy**

Keep 14 frames. Tighten the title and frame headings so Task 3's generated
unframed overview is concise and accurate. Verify it contains the ordered map
and navigation instruction. Remove duplicated explanation, decorative
callouts, and any primitive that does not carry a relationship.

- [ ] **Step 3: Complete image and semantic metadata**

Verify the Task 1 `use`/`description` pairs remain distinct and precise. Add
semantic icon kinds only where the label already conveys example, boundary,
inspection, or warning. Mark commands and paths for the mono role.

- [ ] **Step 4: Build and inspect every frame in one batched round**

```sh
node scripts/audit-deck-spec.mjs decks/claude-code-artifacts/deck-spec.json
node scripts/build-deck.mjs decks/claude-code-artifacts/deck-spec.json \
  /tmp/beautidraw-claude-polish
```

Use the harness at 1600x900 and 1280x800. Inspect all 14 band PNGs and the
scene together. Fix text clipping, the known explanation-zone marker overlap,
dark/light inconsistency, small paragraphs, and decorative shape repetition.

The real generated deck, not only the fidelity fixture, must pass. If the
1280x800 fit zoom makes the shared 18 px note role smaller than 12 effective
pixels, raise the shared note/body ramp at the responsible layout/composition
layer and update `LAYOUT-CONTRACT.md`; do not special-case the Claude spec. Fit
and position frames against measured editor chrome so headings are not hidden
under the toolbar or bottom navigation at either required viewport.

- [ ] **Step 5: Confirm the complete contract**

Assert 14 band PNGs, four embedded assets with matching SHA-1 file IDs,
portable manifest paths, `outline.md` frame order, no absolute paths, and no
editor clipping at either viewport.

- [ ] **Step 6: Commit the task**

```sh
git add decks/claude-code-artifacts/deck-spec.json \
  decks/claude-code-artifacts/image-asset-manifest.json \
  decks/claude-code-artifacts/assets/control-plane-hero.png \
  decks/claude-code-artifacts/assets/monorepo-city.png \
  decks/claude-code-artifacts/assets/settings-precedence-layers.png \
  decks/claude-code-artifacts/assets/trust-boundary.png \
  test/claude-code-artifacts.test.mjs scripts/harness.html \
  scripts/layout.mjs scripts/auto-compose.mjs scripts/compose.mjs \
  scripts/LAYOUT-CONTRACT.md test/harness.browser.test.mjs
git commit -m "feat: polish the Claude Code learning canvas"
```

---

### Task 6: Rebuild the LLM token-flow exemplar

**Files:**
- Create: `test/llm-token-flow.test.mjs`
- Modify: `decks/llm-token-flow/deck-spec.json`
- Create: `decks/llm-token-flow/image-asset-manifest.json`
- Create: `decks/llm-token-flow/assets/pipeline-mechanism.png`
- Create: `decks/llm-token-flow/assets/vector-lookup-space.png`
- Create: `decks/llm-token-flow/assets/probability-selection.png`
- Delete: `decks/llm-token-flow/assets/backgrounds/background-01-whole-pipeline.png`
- Delete: `decks/llm-token-flow/assets/backgrounds/background-02-tokenizers.png`
- Delete: `decks/llm-token-flow/assets/backgrounds/background-03-embedding-vector.png`
- Delete: `decks/llm-token-flow/assets/backgrounds/background-04-transformer-block.png`
- Delete: `decks/llm-token-flow/assets/backgrounds/background-05-next-token.png`
- Delete: `decks/llm-token-flow/assets/backgrounds/background-06-sampling-controls.png`
- Delete: `decks/llm-token-flow/assets/backgrounds/background-07-generation-loop.png`
- Delete: `decks/llm-token-flow/assets/backgrounds/background-08-mental-model.png`
- Delete: `decks/llm-token-flow/assets/blackboard-asset-manifest.json`

**Interfaces:**
- Consumes the locked semantic runtime and ImageGen raster-asset workflow.
- Produces an eight-frame source spec with six canvas frames and two structured
  frames; no hidden post-processing.

- [ ] **Step 1: Write the failing eight-frame contract test**

Require exactly eight stable frames, six canvas compositions, at most two
consecutive uses of one family, explicit relations for causal/temporal flows,
three image descriptions, and no reference to `assets/backgrounds` or a
blackboard manifest in `test/llm-token-flow.test.mjs`. Run the test and current
audit; observe the failures.

- [ ] **Step 2: Generate three thesis-specific raster scenes with ImageGen**

Use these exact content briefs while matching the established tactile,
editorial learning-illustration language and keeping labels out of the image:

```text
pipeline-mechanism.png — A prompt entering as written language, separating
into discrete token pieces, moving through a layered transformer mechanism,
and emerging as one selected next token. Wide composition, open center-right
for Excalidraw labels, no text, no UI chrome, no generic glowing AI brain.

vector-lookup-space.png — A single token identifier selecting one row from a
large embedding table and becoming a high-dimensional vector placed in a
meaningful spatial field. Wide composition, open right-side annotation zone,
no text, no matrix wallpaper.

probability-selection.png — A final vector producing a varied probability
landscape over candidate tokens, with one candidate selected while the rest
remain visible as alternatives. Wide composition, open left-side annotation
zone, no text, no casino or roulette metaphor.
```

Normalize each to the exact frame target, verify PNG dimensions, compute SHA-1,
and record source path, use, description, and dimensions in the manifest.

- [ ] **Step 3: Convert the eight frames to the locked semantic plan**

Frames 1-5 and 7 become canvas: pipeline illustration, tokenizer threshold,
vector illustration, transformer map/orbit, probability field, and generation
journey. Frame 6 remains a structured comparison of temperature/top-p/top-k.
Frame 8 remains a structured mental-model checklist. Every sequence declares
its causal or temporal relation.

- [ ] **Step 4: Remove wallpaper and rebuild through the golden path**

Delete the eight background strips and blackboard manifest. Do not run or
retain a background embedding step. Audit and build into
`/tmp/beautidraw-llm-polish`.

- [ ] **Step 5: Batched visual and editor review**

Inspect eight bands and the scene at both viewports. Require three distinct
images used once each, readable explanations, causal continuity, no repeated
flow-row template, and an outline that accurately explains tokenization,
embedding lookup, transformer blocks, sampling, and generation.

- [ ] **Step 6: Commit the task**

```sh
git add decks/llm-token-flow/deck-spec.json \
  decks/llm-token-flow/image-asset-manifest.json \
  decks/llm-token-flow/assets/pipeline-mechanism.png \
  decks/llm-token-flow/assets/vector-lookup-space.png \
  decks/llm-token-flow/assets/probability-selection.png \
  test/llm-token-flow.test.mjs
git add -u decks/llm-token-flow/assets/backgrounds/background-01-whole-pipeline.png \
  decks/llm-token-flow/assets/backgrounds/background-02-tokenizers.png \
  decks/llm-token-flow/assets/backgrounds/background-03-embedding-vector.png \
  decks/llm-token-flow/assets/backgrounds/background-04-transformer-block.png \
  decks/llm-token-flow/assets/backgrounds/background-05-next-token.png \
  decks/llm-token-flow/assets/backgrounds/background-06-sampling-controls.png \
  decks/llm-token-flow/assets/backgrounds/background-07-generation-loop.png \
  decks/llm-token-flow/assets/backgrounds/background-08-mental-model.png \
  decks/llm-token-flow/assets/blackboard-asset-manifest.json
git commit -m "feat: rebuild the token-flow learning canvas"
```

---

### Task 7: Rebuild the RAG, vector, and graph exemplar

**Files:**
- Create: `test/rag-vector-graph.test.mjs`
- Modify: `decks/rag-vector-graph/deck-spec.json`
- Create: `decks/rag-vector-graph/image-asset-manifest.json`
- Create: `decks/rag-vector-graph/assets/evidence-selection.png`
- Create: `decks/rag-vector-graph/assets/vector-meaning-space.png`
- Create: `decks/rag-vector-graph/assets/graph-traversal.png`
- Modify: `decks/rag-vector-graph/assets/retriever-fanout.png`
- Delete: `decks/rag-vector-graph/blackboard-asset-manifest.json`
- Delete: `decks/rag-vector-graph/assets/graph-database.png`
- Delete: `decks/rag-vector-graph/assets/hybrid-retrieval.png`
- Delete: `decks/rag-vector-graph/assets/rag-pipeline.png`
- Delete: `decks/rag-vector-graph/assets/rag-vs-lookup.png`
- Delete: `decks/rag-vector-graph/assets/vector-space.png`

**Interfaces:**
- Consumes the same locked runtime and asset contract as Task 6.
- Produces a fifteen-frame source spec with relationship-specific composition
  and no repeated wallpaper mapping.

- [ ] **Step 1: Write the failing fifteen-frame contract test**

Require exactly fifteen stable frames, at least ten canvas frames, no more than
50% structured frames, no repeated image across unrelated claims, four image
descriptions, explicit relations, and one-use asset paths. Run the test and
current audit; observe the failures. The same test asserts the asset directory
contains exactly the four manifest-listed PNGs, so orphaned legacy art fails.

- [ ] **Step 2: Generate four thesis-specific raster scenes with ImageGen**

```text
evidence-selection.png — A user question moving through a retrieval system
that searches a bounded evidence collection, selects a small grounded context,
and supports an answer. Wide tactile editorial illustration, open right-side
annotation zone, no text, no chatbot UI.

vector-meaning-space.png — Documents represented as points whose proximity
reflects meaning rather than spelling, with one query point revealing a nearby
semantic neighborhood. Wide tactile editorial illustration, open left-side
annotation zone, no text, no generic network globe.

graph-traversal.png — A question beginning at one entity and following named
relationships through a small knowledge graph to reach evidence that vector
similarity alone would not expose. Wide tactile editorial illustration, open
bottom annotation zone, no text, no decorative node cloud.

retriever-fanout.png — One question routed into vector, graph, keyword, and
current-state retrieval paths, then reconciled into a small evidence bundle.
Wide tactile editorial illustration, open center annotation zone, no text, no
dashboard UI.
```

Normalize, dimension-check, hash, describe, and manifest them as in Task 6.

- [ ] **Step 3: Convert all fifteen frames to relationship-specific layouts**

Use canvas frames for evidence selection, RAG-vs-lookup threshold, offline/
online handoff, vector meaning space, chunk-size trade-off, retrieval dials,
graph traversal, retriever fan-out, retrieval methods matrix, raw-hits journey,
memory-choice map, and answer-honesty evidence boundary. Keep only the three
comparisons/checklists whose tabular structure carries the argument.

- [ ] **Step 4: Remove repeated wallpaper and hidden post-processing inputs**

Delete the old reuse manifest and every superseded background. Each retained
or new image may support exactly one thesis. Audit and build into
`/tmp/beautidraw-rag-polish` through `build-deck` only.

- [ ] **Step 5: Batched visual and editor review**

Inspect fifteen bands and the scene at both viewports. Require visible
distinctions between RAG, lookup, vector similarity, graph traversal, hybrid
retrieval, and current-state tools; readable text; no generic box rows; no
reused scene; and a complete accessible outline.

- [ ] **Step 6: Commit the task**

```sh
git add decks/rag-vector-graph/deck-spec.json \
  decks/rag-vector-graph/image-asset-manifest.json \
  decks/rag-vector-graph/assets/evidence-selection.png \
  decks/rag-vector-graph/assets/vector-meaning-space.png \
  decks/rag-vector-graph/assets/graph-traversal.png \
  decks/rag-vector-graph/assets/retriever-fanout.png \
  test/rag-vector-graph.test.mjs
git add -u decks/rag-vector-graph/assets/graph-database.png \
  decks/rag-vector-graph/assets/hybrid-retrieval.png \
  decks/rag-vector-graph/assets/rag-pipeline.png \
  decks/rag-vector-graph/assets/rag-vs-lookup.png \
  decks/rag-vector-graph/assets/vector-space.png \
  decks/rag-vector-graph/blackboard-asset-manifest.json
git commit -m "feat: rebuild the retrieval learning canvas"
```

---

### Task 8: Remove legacy paths and reconcile the product documentation

**Files:**
- Delete: `scripts/embed-frame-backgrounds.mjs`
- Modify: `README.md`
- Modify: `SKILL.md`
- Modify: `references/blackboard-images.md`
- Modify: `references/content-composition.md`
- Modify: `references/deck-spec.md`
- Modify: `references/semantic-visuals.md`
- Modify: `references/visual-system.md`
- Modify: `package.json`
- Modify: `test/entrypoints.test.mjs`

**Interfaces:**
- Consumes the final one-command runtime and all three verified exemplars.
- Produces one non-contradictory authoring contract and no legacy embedding
  entry point.

- [ ] **Step 1: Write the failing documentation/portability assertions**

Test that no tracked source mentions `embed-frame-backgrounds`,
`scene-with-backgrounds`, or a blackboard asset manifest; no source manifest
contains an absolute `/Users/` path; README's probe count matches the runner;
and every documented command responds to `--help`.

- [ ] **Step 2: Delete the hidden post-processing path**

Remove `scripts/embed-frame-backgrounds.mjs` and every source reference to it.
Keep blackboard imagery guidance only as optional ImageGen style guidance;
remove claims that semantic specs cannot declare images or that generation
writes `files: null`.

- [ ] **Step 3: Rewrite the golden-path documentation**

README and SKILL must show: install/setup, semantic deck spec with `use` and
`description`, one `build-deck` command, exact output receipt, outline usage,
frame-navigation guidance, error recovery, tests, offline probes, live parity,
and the three example commands.

- [ ] **Step 4: Add package verification scripts without duplicating logic**

```json
{
  "scripts": {
    "test": "node --test",
    "verify": "node --test && node scripts/spike/run-all.mjs"
  }
}
```

Do not add a wrapper that merely renames existing commands.

- [ ] **Step 5: Run source reconciliation**

```sh
rg -n "embed-frame-backgrounds|scene-with-backgrounds|blackboard-asset-manifest|files: null" \
  README.md SKILL.md references scripts decks test
node --test test/entrypoints.test.mjs
git diff --check
```

The search must return no stale contract claim. Style-guidance uses of the word
“blackboard” are allowed only when they do not describe a second build path.

- [ ] **Step 6: Commit the task**

```sh
git add README.md SKILL.md package.json test/entrypoints.test.mjs \
  references/blackboard-images.md references/content-composition.md \
  references/deck-spec.md references/semantic-visuals.md \
  references/visual-system.md
git add -u scripts/embed-frame-backgrounds.mjs
git commit -m "docs: make the golden path unmistakable"
```

---

### Task 9: Live-viewer parity and reproducible performance evidence

**Files:**
- Create: `scripts/benchmark.mjs`
- Create: `scripts/verify-parity-negatives.mjs`
- Create: `test/benchmark.test.mjs`
- Create: `test/parity-negatives.test.mjs`
- Modify only after green behavior: `scripts/spike/probe-06-viewer-parity.mjs`

**Interfaces:**
- Consumes the final runtime and three examples.
- Produces `runBenchmark(config)` and a caller-selected JSON result path.
- Produces a fresh viewer-parity report in the plan's SDD workspace; the source
  pin changes only after behavioral equality and negative-control proof.

- [ ] **Step 1: Write failing benchmark parser and report tests**

```js
test("benchmark report records reproducible samples and machine metadata", async () => {
  const report = await runBenchmark({
    specPath,
    samples: 3,
    warmups: 1,
    outputPath,
  });
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.machine.node, process.version);
  assert.equal(report.samples.fullBuildMs.length, 3);
  assert.equal(report.summary.fullBuildMs.statistic, "median");
  assert.ok(report.summary.maxRssBytes.maximum > 0);
});
```

Use fixture command output to test macOS `/usr/bin/time -l` maximum-resident-set
parsing without running a real build. Run the test and observe the missing
module failure.

- [ ] **Step 2: Implement the benchmark command**

`node scripts/benchmark.mjs <spec> --samples 3 --warmups 1 --output <path>`
runs these exact stage commands in isolated directories:

```text
setup:       node scripts/setup.mjs
audit:       node scripts/audit-deck-spec.mjs <spec>
generation:  node scripts/generate.mjs <spec> <sample>/generate
composition: node scripts/auto-compose.mjs <spec> <sample>/generate
fullBuild:   node scripts/build-deck.mjs <spec> <sample>/build
offline:     node scripts/spike/run-all.mjs
```

Generation completes before the composition sample in the same sample root;
full build uses a separate empty sibling. It records OS, CPU, physical memory,
Node, pnpm, Excalidraw version,
stage command, warmup count, three wall-time samples, median time, per-sample
maximum RSS from `/usr/bin/time -l`, maximum RSS, and artifact bytes. On a
non-Darwin host it exits with a concise unsupported-measurement diagnostic
instead of inventing comparable RSS data.

Every warmup and measured sample receives its own `mkdtemp()` output directory.
The benchmark asserts the directory is initially empty, never reuses it, and
removes it in `finally`. Unit tests inject the temp-directory factory and prove
unique paths plus cleanup after both success and failure.

Tests require sample arrays and median/maximum summaries for all six stages,
artifact-byte samples for generation/composition/full build, and explicit
guardrail failures. The 2.2-second composition budget is the reference Claude
deck's 13 canvas bands; reports record `canvasBandCount`, and every deck with
13 or fewer canvas bands must meet that ceiling.

- [ ] **Step 3: Prove the live parity gate and its negative controls**

Implement `verifyParityNegativeControls({ runProbe, readReport })`. It runs the
unmodified probe first and stores its report as the baseline. A baseline may be
green or may contain only the identified viewer-version drift. It then runs all
seven hooks, copies each report before the next run, and requires a
hook-specific report delta beyond the baseline:

```js
const expected = {
  BD_NEG_SCENE: { mismatchField: "width" },
  BD_NEG_FP: { failure: /font metric drift/ },
  BD_NEG_FIELD: { mismatchField: "textAlign" },
  BD_NEG_NULLFIELD: { mismatchField: "fontFamily" },
  BD_NEG_FPKEY: { failure: /fingerprint key set wrong|fingerprint entry was missing/ },
  BD_NEG_DUP: { failure: /duplicate/i },
  BD_NEG_BOUND: { mismatchField: "boundElements" },
};
```

For mismatch hooks, the new report's `writtenSceneParity` or ordering mismatch
must name that exact field and be absent from the baseline report. For failure
hooks, the matching failure must be absent from baseline failures. Exit code
alone is never accepted as proof. `test/parity-negatives.test.mjs` uses fixture
reports to prove a drift-only nonzero baseline cannot satisfy any hook.

Then run the unmodified live probe. Preserve its JSON report in the SDD
workspace. The behavioral report is green only when scene mismatches are empty,
font delta is within tolerance, bound-text geometry matches, and the only
failure is the identified viewer-version drift. Only then update
`PINNED_VIEWER_BUILD` to the reported live version and rerun the full network
probe to exit 0. Any behavioral mismatch returns to Task 4's worker; never
repin around it.

- [ ] **Step 4: Measure all three decks and enforce the approved guardrails**

Write three benchmark reports under the plan's SDD workspace. Require three
samples after one warmup for each deck. Compare medians and maximum RSS/artifact
bytes against the Global Constraints; a breach is a task failure, not a note.

Use these exact ignored evidence paths:

```text
.superpowers/sdd/2026-08-23-elite-product-polish/evidence/task-9-claude-benchmark.json
.superpowers/sdd/2026-08-23-elite-product-polish/evidence/task-9-llm-benchmark.json
.superpowers/sdd/2026-08-23-elite-product-polish/evidence/task-9-rag-benchmark.json
.superpowers/sdd/2026-08-23-elite-product-polish/evidence/task-9-viewer-parity-baseline.json
.superpowers/sdd/2026-08-23-elite-product-polish/evidence/task-9-viewer-parity-final.json
```

- [ ] **Step 5: Run focused verification and commit**

```sh
node --test test/benchmark.test.mjs test/parity-negatives.test.mjs
node scripts/verify-parity-negatives.mjs
pnpm spike
pnpm spike:network
git diff --check
git add scripts/benchmark.mjs scripts/verify-parity-negatives.mjs \
  test/benchmark.test.mjs test/parity-negatives.test.mjs \
  scripts/spike/probe-06-viewer-parity.mjs
git commit -m "test: prove viewer parity and performance budgets"
```

---

## Whole-product acceptance after Task 9

The controller runs these gates after every task has passed its worker review
and separate adversarial review:

```sh
node --test
node --check scripts/*.mjs scripts/*.js scripts/spike/*.mjs
node scripts/audit-deck-spec.mjs decks/claude-code-artifacts/deck-spec.json
node scripts/audit-deck-spec.mjs decks/llm-token-flow/deck-spec.json
node scripts/audit-deck-spec.mjs decks/rag-vector-graph/deck-spec.json
node scripts/build-deck.mjs decks/claude-code-artifacts/deck-spec.json /tmp/beautidraw-final-claude
node scripts/build-deck.mjs decks/llm-token-flow/deck-spec.json /tmp/beautidraw-final-llm
node scripts/build-deck.mjs decks/rag-vector-graph/deck-spec.json /tmp/beautidraw-final-rag
pnpm spike
pnpm spike:network
git diff --check
```

Then:

1. Inspect every generated band and all three scenes in two batched screenshot
   rounds at 1600x900 and 1280x800.
2. Verify keyboard order, focus visibility, status semantics, image readiness,
   frame navigation, outline order, and copyable commands in the harness.
3. Measure setup, audit, generation, composition, full build, probes, RSS, and
   artifact sizes against the global guardrails.
4. Run Impeccable's detector once over the changed UI targets.
5. Generate a whole-branch review package from the approved spec, plan, merge
   base, and final head. Dispatch the most capable adversarial reviewer.
6. Send all final findings to one worker, run one scoped re-review, and surface
   any residual load-bearing finding rather than declaring completion.
