# Plan Review Log: beautidraw — generator for sectioned Excalidraw lesson canvases

Started 2026-08-02 ~10:20 WEST. MAX_ROUNDS=5. PLAN_FILE=PLAN.md.

Reviewer: Codex CLI 0.144.0, read-only every round.
Basis: `PLAN.md` round 0, derived from a five-lens adversarially-verified critique of
`examples/al-1.excalidraw` (38 findings raised, 35 confirmed, 3 refuted).

---

## Round 1 — Codex

Thread: `019fc1c4-a4db-7432-b39e-1db248de4469`. Verdict: **REVISE**.

### Blockers
- The fixed ramp `36/28/22/18/14` violates its own ratio rule: `22/18 = 1.222`, below `1.25`. The "scale the ramp" fallback also contradicts "fixed."
- "No size used once" rejects a normal deck: the single title necessarily uses its title size once, while each size maps to exactly one role.
- The text metric is not Excalidraw's metric. Font family `3` is Cascadia; Excalidraw measures each line with browser `measureText`, normalizes tabs, and soft-wraps. `len(line) x constant` cannot cover proportional fonts, Unicode, fallback glyphs, or browser/font-version differences. Make the pinned Excalidraw browser implementation authoritative.

### Major
- The universal text-width assertion conflicts with bound-text behaviour. `ev_sft_t` is stored `240x55` inside a `260x75` container; the natural-width model gives a different width while Excalidraw wraps and measures visual lines. Distinguish natural / wrapped / container geometry.
- The fit-zoom gate rejects the reference-scale canvas: `1600/2700 = 0.59`, so `14`-unit text renders at ~`8.3`, below `12`. Define a maximum page width and solve width, wrapping and type scale together.
- Page geometry is circular: shrinking `PAGE_WIDTH` after layout changes wrapping, heights, union bbox and computed centre. Use ordered passes with a fixed page rectangle and bounded relayout.
- Full-width bands, the <=1.6 width ratio, and "no empty rectangle >15%" can reject sparse but intentional sections. Define per-pattern occupancy or demote to warnings.
- "Container sized to text" conflicts with equal peer width/height for rows of differing label lengths. Size rows from maximum peer requirement.
- Frame membership is underspecified: headings/decks/dividers/cross-band connectors unaddressed.
- Per-frame rendering cannot validate the unframed title, subtitle, footer, dividers, or whole-canvas whitespace. Render both.
- "Every connector is an arrow with bindings" contradicts the reference's legitimate `line` elements (`conn_2017`, `conn_2026`, `residual1`). Classify connector kinds.
- The renderer decision is not closed: no pinned package/font/browser versions, and research still marks offline bundling and frame-export unverified. Pin and test before gating on it.
- "Loop until clean" has no retry cap, defect schema, artifact log or escalation path.
- `deck-spec.json` has no formal schema or bounded failure rules (long labels, too many nodes, duplicate years, cycles, deep trees).
- Hard thresholds are derived from one example while the catalogue is explicitly incomplete.
- Contrast thresholds applied to scene-unit `fontSize`, but legibility is judged after `fitZoom`; transparent fills have no defined contrast target.

### Minor/nit
- `2705x1695` is the scene bbox, `2725x1715` the padded export size — label them.
- One-to-one legend conflicts with substituting lighter shades for one role.
- "Deterministic" covers coordinates only; ids, seeds, timestamps and LLM variability unaddressed.

### Claude's response

**Accepted, and they change the architecture.**

1. *Ramp arithmetic + fit-zoom + page width are one coupled problem.* Codex is right that these cannot be chosen independently. Solved together: `PAGE_WIDTH = 2280`, band height cap `1200`, ramp `48/38/30/23/18`. Check: ratios 1.263 / 1.267 / 1.304 / 1.278, all above 1.25. Legibility: `z = 1600/2280 = 0.702`, so the ramp floor renders at `18 x 0.702 = 12.6` css px, clearing the 12 gate. The height cap keeps width the binding constraint (`850/1200 = 0.708 > 0.702`). The ramp is now genuinely fixed — no scaling fallback.
2. *Text metrics.* Accepted in full, and it collapses a whole layer: since a browser is already required to render, the layout engine moves **into** that browser and calls Excalidraw's own measurement. Stage B becomes JavaScript in the Playwright page rather than Python guessing a constant. The `0.60` advance constant is deleted, not corrected.
3. *Natural vs wrapped vs container geometry* — accepted as three distinct quantities.
4. *Singleton chrome roles* — exempted.
5. *Circular page geometry* — fixed page rectangle, no post-hoc shrink, bounded relayout passes.
6. *Connector taxonomy, frame membership, whole-scene render, retry cap, deck-spec JSON Schema, renderer pinning, contrast at rendered size, transparent-fill target* — all accepted.

**Partially rejected, with reason.**

- *"Sparse sections may be intentional."* The empty lower-right quadrant is the highest-severity finding in the critique, raised independently by two lenses, on a file its own author called "needs improving." Treating it as intentional would preserve the defect this project exists to remove. Compromise: the **band-fills-page-width** rule stays a hard gate, since it is the direct cause; the **global empty-rectangle** check is demoted to a warning, since with the first rule enforced it is redundant. The `<=1.6` width-ratio rule is deleted — with a fixed page width all bands are the same width by construction.
- *"Thresholds derived from one example."* Accepted as a real risk, mitigated rather than removed: thresholds that encode arithmetic (contrast, metrics, ramp ratios, overflow) stay hard because they are not taste; thresholds that encode composition (occupancy, band aspect) ship as warnings until more examples arrive. Example catalogue remains open as ticket 01.

---

## Round 2 — Codex

Verdict: **REVISE**. Opens by confirming the coupled arithmetic now holds: ramp ratios clear 1.25, `min(1600/2280, 850/1200) = 0.701754…`, `18 × z ≈ 12.63`.

### Blockers
- **Browser metric authority is not executable.** The public Excalidraw entry point exposes export helpers and `setCustomTextMetricsProvider`, not `measureText`/`wrapText`. The plan names no bundle or import path. Fix: pin and bundle a concrete adapter around Excalidraw's actual bound-text layout, proven by fixtures, before it becomes the linter oracle.
- **Gate sequencing contradicts itself.** Structural lint gates before the renderer spike passes, but text metrics, wrapping and effective zoom are unproven until that spike. Fix: metric-based lint becomes conditional on the spike; pre-spike checks cover only schema, ids, ordering and references.

### Major
- "Exactly five sizes" still rejects valid decks — a deck may have no hero or annotation role, a single hero is a likely singleton, and subtitle/footer have no assigned size.
- Wrapped geometry remains circular for free text: wrapping needs a container width, the container is chosen from the wrapped result, and the rule is applied to unbound chrome too.
- The `z=.702` proof is not tied to emitted frames — it ignores frame bounds, frame labels, export padding and UI margins.
- Fixed page width does not fix the page *axis*: chrome centres on the union bbox, so asymmetric content recreates the old drift. The page-fill gate checks only the right edge.
- Connector assertions are not jointly satisfiable: a leader must end within 4 units of its referent, yet no connector may intersect any text bbox inflated by 4 units.
- The 2-unit binding tolerance conflicts with Excalidraw's binding geometry, which uses a 5-unit base gap plus stroke contribution.
- Deterministic ids can collide: hashing `(band, role, content)` gives identical ids for repeated labels in one band.
- The renderer spike lacks a decisive frame fixture and an offline implementation path.
- Font pinning does not guarantee metric determinism — canvas measurement can run before bundled fonts load, producing fallback widths.

### Minor/nit
- Diagnostics omit per-element natural/wrapped/container dimensions, chosen wrap width, actual zoom and font readiness.
- No concrete Excalidraw/Chromium/font versions are named.

### Claude's response

**All findings accepted this round — none were wrong.** Two of them change the shape of the plan rather than its numbers:

1. *The metric oracle may not be callable.* This is the sharpest finding in either round. My round-1 fix assumed Excalidraw's measurement was reachable from the public API; Codex checked and it is not. The honest response is to stop asserting it and demote it to the thing the spike must prove, with a named fallback (a bundled adapter over the internal bound-text path, verified against fixtures rendered by Excalidraw itself). Until that passes, no metric-dependent assertion may gate.
2. *Font readiness.* A pinned Chromium and a pinned font archive still produce fallback metrics if measurement runs before `document.fonts.ready`. Every measurement is now gated on font readiness plus per-face `document.fonts.check`, and the loaded-font fingerprint is recorded in diagnostics so a metric drift can be explained rather than guessed at.

Also adopted: `PAGE_X` as an explicit page rectangle origin with chrome centred on `PAGE_X + PAGE_WIDTH/2` and both edges asserted; natural geometry for unbound text with pattern-chosen wrap widths for bound text; `z_actual` computed from emitted frame bounds including the frame label and export padding; a terminal-zone exemption for callout leaders; binding validated through the pinned library's own gap semantics rather than an invented 2-unit threshold; ids hashed over `(pattern path, ordinal, kind, role, canonicalised content)` with a hard fail on collision; a two-frame renderer fixture and a versioned local bundle; concrete versions named.

No counter-position logged this round — there was nothing to defend.

---

## Round 3 — Codex

Verdict: **REVISE**. Opens: "Round 2 fixes the arithmetic and the old x-axis-centering defect."

### Blocker
- **The two-tier gate is fail-open.** "Tier 2 gates only once the oracle passes" permits an implementation to skip Tier 2 and ship after Tier 1. Fix: make oracle state explicit — `passed` enables Tier 2; `unproven`/`failed` blocks artifact delivery rather than skipping geometric validation.

### Major
- Width-first breaks only the local wrap/container loop — column count can still change during the allowed reflow, so the budget stays text-dependent. Also, Excalidraw's bound-text width is shape-specific; ellipses, diamonds and arrows do not use `container.width - 10`.
- Unbound chrome still has no overflow contract: a long title can stay centred while extending outside the page.
- The three metric routes are not equivalent fallbacks. Route 1 needs vendored internals (the package exposes no runtime `element/*` subpaths) and the bound-text routine mutates scene state. Route 2 exposes only `getLineWidth` — no wrapping, no container geometry — is process-global, and is not serialised into the file. Route 3 renders current element state rather than discovering logical soft wraps; raster extents cannot recover stored text boxes or line breaks.
- The custom-provider route can pass by self-consistency while disagreeing with the consumer: layout and rendering share the injected provider, but the delivered file opens in excalidraw.com, which never sees it.
- Frame-label legibility is contradictory: a `frame` carries only `name` and has no font-size field, and Excalidraw draws the label at a fixed 14 units — about 9.8 px at `z ≈ 0.702` — yet the plan assigned it ramp size 18.
- `z_actual` is undefined for unframed chrome, though the effective-size and contrast gates apply to title, subtitle and footer.
- Visual validation has no pass/fail contract — nothing says who decides whether a visual defect triggers a retry.

### Minor/nit
- "Within 8% of `PAGE_X`" is ambiguous when `PAGE_X = 0`, and the one-sided tolerance permits a 16% narrower band.
- The edge assertion does not define the probe set (backgrounds? frames? dividers? body only?).

### Claude's response

**All accepted; three of them were holes I had opened while fixing round 2.**

1. *Fail-open gating* — the round-2 fix traded one failure mode for a worse one. Replaced with an explicit oracle state table where `unproven` and `failed` **block delivery** rather than waive Tier 2. No path now ships geometry nobody checked.
2. *Frame labels* — I assigned a ramp size to something with no font-size field. Native frame labels are removed from the ramp and from the legibility contract entirely; the visible section title is the band heading text element at 38, and the frame `name` is navigational metadata only.
3. *Provider self-consistency* — the sharpest finding of the round. A pipeline that injects its own metric provider into both layout and rendering agrees with itself and disagrees with the viewer the file is actually opened in. Route 2 is now restricted to reading the viewer's **native** metrics, and the spike must open a generated file in the pinned viewer and confirm parity.

Also adopted: routes ranked by role rather than preference (1 = hard-gate implementation, 2 = width backend only, 3 = calibration/diagnostics); bound text restricted to rectangles, deleting three shape-specific formulas at no cost since the reference binds text only to rectangles; text-independent column counts chosen from a finite pre-enumerated candidate set so reflow cannot re-derive the width budget from the text; explicit overflow contracts for every unbound chrome role (one ramp step down, then hard fail); `z_scene` defined for chrome with chrome exempt from the ≥12 gate but not from contrast; `ε = 0.08 × PAGE_WIDTH` as an absolute tolerance asserted on both edges, with an explicit probe set; and a structured pass/defect verdict as the visual gate's contract, escalating to a human on retry exhaustion rather than passing by default.

No counter-position logged. Three rounds, no finding worth defending against — the arithmetic and API claims have been checkable every time, and they checked out.

---

## Round 4 — Codex

Verdict: **REVISE**. No blockers. Opens: "Round 3 fixes the page-axis/header drift and makes the three oracle routes coherently ranked. The arithmetic also holds."

### Major
- Oracle gating is fail-closed only for the three exact states — missing, malformed, unknown or stale `passed` has no defined behaviour and no binding to the current bundle/font/viewer.
- Finite candidates bound the search but do not specify it: candidate order, tie-breaking, acceptance and the one-relayout limit are unstated.
- Unbound overflow rules remain contradictory: footer and annotation already sit at the ramp floor, so "step down exactly once" is impossible; heading/deck overflow is uncovered; and "wrap a long label" contradicts "unbound text is never wrapped."
- Zoom selection contradicts the contrast assertion — `z_actual` is limited to framed content, yet contrast still computes `fontSize × z_actual`.
- The zoom equations are not reproducible: `z_actual`, `sceneHeight`, export padding and the relationship between the 1200 cap and inflated frame bounds lack exact formulas; diagnostics omit `z_scene`.
- The visual verdict is not a machine contract — no schema, no defect-class enum, no target identifier, no evidence field, no malformed/timeout behaviour.
- Retries have no defined repair operation: re-running deterministic layout on the same spec reproduces the same image, and letting the reviewer alter the spec would break the reproducibility contract.
- The metric contract omits role-level `fontFamily`, `lineHeight`, `autoResize` and wrapping settings, which are part of Excalidraw's text geometry model.

### Minor/nit
- "No artifact is written" reads as conflicting with the diagnostics directory.
- The claim that chrome carries the two largest ramp sizes is false — subtitle and footer are 23 and 18, and the 38 band heading is framed.

### Claude's response

**All accepted. The retry finding is the one that mattered most.**

A deterministic layout engine re-run against an unchanged spec produces a byte-identical image, so "retry on visual defect" was either an infinite loop or an unstated licence for the reviewer to edit the spec — which would have silently broken the reproducibility contract established one section earlier. Fixed by separating the two hashes: retry never touches `deck-spec.json`, and instead applies one of four enumerated **layout-parameter** operators selected by defect class (`R1` grow row, `R2` next column candidate, `R3` reroute leaders, `R4` widen gutters), each bumping a `layout_params_hash` while `deck_spec_hash` stays fixed. Defect classes with no operator — `wrong-pattern`, `other` — escalate immediately without consuming the budget, because those are content problems and no amount of relayout fixes them.

Fixing the zoom equations exposed a second arithmetic error of my own: with `EXPORT_PAD = 10` and a 24-unit frame-label band, a 1200-unit cap gives `850/1244 = 0.683`, which is **below** `1600/2300 = 0.6957` — so height would have bound, not width, contradicting the design intent stated three lines earlier. `BAND_HEIGHT_CAP` is now **1170**, giving `850/1214 = 0.7002 > 0.6957`. Width binds, and the ramp floor lands at 12.52 css px.

Also adopted: the oracle record is a signed document hash-bound to bundle, fonts, viewer version and metric tuple, with every non-matching state — including missing and unrecognised — treated as blocking; a fully specified first-fit candidate search with immutable per-candidate widths; a per-role overflow table with explicit ramp-floor failure behaviour and wrapping confined to rectangle-bound labels; `z_effective(el)` as the single zoom function used by every legibility and contrast computation; a versioned `beautidraw.visual-verdict/1` JSON schema with a defect-class enum, evidence field and fail-closed handling of malformed or absent verdicts; the complete per-role metric tuple in constants, fixtures and fingerprint; blocked delivery distinguished from permitted diagnostics; and the false "two largest ramp sizes" rationale deleted rather than patched.

---

## Round 5 — Codex

Verdict: **REVISE**. No blockers. Opens: "Round 4 gets the arithmetic right: `2300` framed width, `1214` framed height, `0.6957 < 0.7002`, and `18 × z = 12.52`. Width binds for a full-width capped band."

### Major
- The oracle hash omits pinned browser inputs — no Playwright/Chromium revision or launch configuration, so one `passed` record could validate different browser metrics.
- Repair operators are bounded but not guaranteed to progress: `R3` has no ordered variant set, multiple defects have no deterministic priority, and `R1`/`R4` can mint a new hash without fixing anything.
- The two-hash split contradicts the remaining determinism claim — the same spec can produce different outputs after different visual verdicts, while §10 still claimed byte-reproducibility from the spec alone.
- Candidate selection still conflicts with the relayout limits: first-fit over `[1,2,3]` may need multiple advances, but only one advance per pass was permitted.
- The per-role overflow table is incomplete: `body` and free labels absent, `annotation/evidence` boundness unresolved, and the `hero node` row conflicts with shape-specific unbound labels.
- `z_scene` may not be based on rendered scene bounds — `sceneHeight` uses the union of serialised elements while native frame labels are renderer-owned.

### Minor/nit
- "Text-independent column count" is now technically false: candidate widths are text-independent, selection is not.
- The 75-character deck cap is not a pixel-width guarantee under native metrics.

### Claude's response

**All accepted. The determinism contradiction was the one I should have caught myself.**

Round 4 introduced repair operators to fix the non-progressing retry, and in doing so quietly falsified §10 — which still claimed byte-reproducibility from the spec, one section after making the output depend on a model's visual judgement. Rather than weaken the repair mechanism to preserve the claim, the claim is narrowed to what is true: reproducibility holds for the **triple** `(deck_spec_hash, layout_params_hash, repair_history)` plus the pinned runtime, and a run that needed no repair remains reproducible from the spec alone. Overstating it would have been exactly the kind of unverifiable assertion this review exists to remove.

Also adopted: `oracle_hash` extended to the complete runtime manifest — Playwright version, Chromium revision, launch flags and device pixel ratio alongside bundle, fonts, viewer and metric tuple — with signature verification against a pinned key; repair operators given finite ordered monotonic state lists, deterministic defect ordering, one repair per iteration, mandatory Tier 2 re-run after each, no-op detection by geometry hash, and rollback-and-escalate when a repair introduces a new violation; candidate selection redefined as one finite pass over the whole ordered list; the role table replaced by a completeness *mechanism* — an unlisted role is a build failure — plus explicit chrome and body tables consistent with rectangles-only binding; `renderedBounds()` made renderer-inclusive so native frame labels are counted; and both nits taken verbatim.

**Note on the round budget.** The skill's default `MAX_ROUNDS=5` was reached here. The loop was extended past it on Bruno's explicit instruction to run "until reconciliation", and because rounds 4 and 5 produced no blockers and progressively finer contract gaps rather than fundamental objections — a convergence signal, even without an APPROVED token.

---

## Round 6 — Codex

Verdict: **REVISE**, but the scope has collapsed. Codex explicitly confirms resolved: cap arithmetic (width binds at 0.6957, height 0.7002, ramp floor 12.52px); monotonic states + deterministic ordering + no-op detection + rollback + the 3-iteration cap guaranteeing progress or escalation; the reproducibility triple as "a legitimate narrowed claim, not merely concealment"; finite ordered first-fit candidate selection; consistent `z_effective`; the role-table mechanism.

### Major (2)
- `oracle_hash` still does not cover the **full geometry runtime** — it names the Excalidraw bundle but not our own route-1 adapter, harness, fixture corpus, or platform image, so editing the adapter could leave a valid-looking signature attached to different geometry code.
- `renderedBounds()` double-counts and ambiguously aggregates: `sceneHeight` was described as including export padding while `z_scene` adds `2·EXPORT_PAD` again, and "`FRAME_LABEL_BAND` for every frame" sums a band per frame instead of unioning actual painted label extents.

### Minor/nit (4)
- The size summary still names a `body` role absent from both tables.
- "Page chrome" groups band headings and deck lines even though they are framed — `unbound` means no text container, not no frame membership.
- Stale "one bounded relayout / wrap a long label" wording survives the finite candidate pass.
- The reproducibility triple needs canonical serialisation for `repair_history` and exact contents for the geometry hash.

### Claude's response

**All six accepted; both majors were errors I introduced in the round-5 fixes.**

1. *The oracle hash covered its dependencies but not itself.* Round 5 extended it to Playwright, Chromium, launch flags and platform — and still omitted the vendored adapter, the harness page, and the fixture corpus the `passed` verdict was measured against. Editing our own geometry code would have left the signature valid. Now hashed: adapter source, harness source, fixture corpus, platform image id and viewport constants alongside everything prior.
2. *The `renderedBounds()` fix double-counted padding.* I defined it as padded, then padded it again in `z_scene`. And adding `FRAME_LABEL_BAND` per frame is simply the wrong operation — labels must be **unioned** as painted extents, since a label sitting inside an existing bbox adds nothing. `renderedBounds()` is now the unpadded painted union; padding is applied exactly once, in `z_scene`.

Minors adopted verbatim: the phantom `body` role deleted from the size summary (it would have been rejected by the completeness mechanism two sections earlier); `containerId` and `frameId` split into independent columns so band headings read as framed-but-unbound; the stale relayout sentence replaced with a pointer to the finite candidate pass and the rectangles-only wrapping rule; and canonical forms defined for `repair_history` (ordered JSON, sorted keys, no timestamps), `layout_params_hash` (enumerated constants plus the selected candidate) and `geometry_hash` (positional fields only, sorted by id, styling deliberately excluded so a recolour registers as a no-op).

---

## Round 7 — Codex

Verdict line: **REVISE** — but the body closes with "The remaining issues are minor/nit only," which contradicts the token. Codex confirms round 6 closed the oracle, bounds, role, axis and candidate-selection issues.

### Major (2 claimed)
- The stale second-relayout rule remains at `PLAN.md:114`, still saying an overflowing band triggers a relayout that "reflow[s] a chain into columns."
- `repair_history` is not sufficient to replay every repair — its entry lacks a target scope/element identifier, yet `R1` modifies a *particular* peer row, so two repairs sharing band, class, operator and states could target different rows.

### Minor/nit
- `geometry_hash` omits connector `points` and binding endpoints, so a reroute can be misread as a no-op when its bbox is unchanged.
- The hash algorithm and canonical byte encoding for `H` are unnamed.

### Claude's response

**One rejected as a false positive, three accepted.**

*Rejected — the stale relayout rule.* The live text at that location already states the opposite: "resolved **inside** the §2 finite candidate pass … not by a separate relayout step … Exhausting the candidate list fails the build." What Codex matched was my own *quotation* of the deleted wording inside a parenthetical crediting round 6 with removing it. Verified by grep across the file: the only occurrences of "reflow"/"relayout" are that quotation, two review-history parentheticals, and one line stating no relayout fixes a content defect. The rule Codex describes does not exist in the plan. I removed the quotation anyway — a citation that reads as a live rule is bad writing even when it is not a bad rule — but the finding itself was wrong, and recording that matters after six rounds of accepting nearly everything.

*Accepted — `repair_history` replayability.* Correct and important. `R1` grows one specific peer row, so an entry without a target is ambiguous on replay. Added a mandatory `targetRef` as a **stable structural path** (`band[2].pattern.row[1]`) rather than an element id or array index, because ids can be regenerated and positions shift under relayout, while structural paths survive both.

*Accepted — `geometry_hash` and connector geometry.* Codex filed it minor; it is arguably worse than that. `R3` reroutes a leader by changing its `points`, which can leave the bounding box identical — so the no-op detector would have escalated the one defect class it was actively repairing. `points`, `startBinding` and `endBinding` are now hashed.

*Accepted — naming `H`.* SHA-256 over RFC 8785 canonical JSON (JCS), UTF-8.

---

## Round 8 — Codex

Verdict: **APPROVED**. "No major findings remain."

Codex ran the grep and withdrew the round-7 false positive itself: "I grepped the file: the live rule says overflow is resolved inside the finite candidate pass, with no separate relayout; the remaining `relayout`/`reflow` mentions are historical or explanatory parentheticals."

Confirmed resolved: `oracle_hash` covering the complete runtime/oracle artifact with live verification; progress rules guaranteeing geometry change, rollback, state exhaustion or bounded escalation; the reproducibility triple and canonical forms; `targetRef`, expanded `geometry_hash` and SHA-256/JCS hashing; `renderedBounds()` as an unpadded painted union with padding applied once; the phantom `body` role removed and `containerId`/`frameId` made explicit.

### Minor/nit (1)
- `band[2].pattern.row[1]` reads as a positional array path despite the sentence ruling positional indexes out.

### Claude's response
Fair, and fixed: `targetRef` is now written `spec:band/2/row/1` — explicitly a path of canonical **`deck-spec.json`** ordinals, which are immutable for a given spec, never a position in the emitted elements array that relayout reorders.

---

## Outcome

**Converged at round 8. APPROVED.** The default `MAX_ROUNDS=5` was extended on Bruno's instruction to run "until reconciliation"; rounds 6–8 produced 2, 2 and 0 major findings respectively, so the extension was earning its keep rather than spinning.

What the argument actually changed:

1. **Two arithmetic contradictions that would have shipped.** The type ramp violated its own ≥1.25 ratio rule (`22/18 = 1.222`), and the legibility gate mathematically forbade any page as wide as the reference. Solving ramp, page width and fit-zoom *together* produced `PAGE_WIDTH = 2280` / ramp `48-38-30-23-18` / `BAND_HEIGHT_CAP = 1170` — and the cap moved from 1200 to 1170 only because a later round forced the export-padding arithmetic to be written out, revealing that height would otherwise bind where width was supposed to.
2. **The metric foundation was fictional.** Round 0 assumed a `chars × 0.60` model; round 1 replaced it with "call Excalidraw's own measurement"; round 2 established that the public API does not expose those functions at all. What survived is three routes ranked by role, a mandatory spike, and a fail-closed oracle — instead of a constant that was wrong in the reference by a factor ranging 0.42 to 1.11.
3. **Three self-inflicted regressions caught.** Each fix introduced its own flaw: the round-2 gating fix was fail-open, the round-4 repair operators falsified the round-3 determinism claim, and the round-5 `renderedBounds()` fix double-counted padding. None would have been visible without an adversary re-reading the whole document each round.

One finding was rejected as a false positive (round 7's "stale relayout rule"), and Codex withdrew it on re-examination.

---

## Round 9 — Codex (post-spike)

Reopened after the §11 spike ran and materially amended §2, §4, §7, §8, §9, §11 and the
risk list. The round-8 APPROVED verdict was stale: the amendments had had **no** adversarial
review, and this plan's history is that a fix breeds its own flaw three times running.

Codex opened by independently reproducing the new arithmetic — `1600/2280 = 0.701754`,
`850/1211 = 0.701899`, width binds, ramp floor `12.63` px — then found six defects.

**Major**

1. **Route-2 removal contradicted by §11.** §2 declared `setCustomTextMetricsProvider`
   unused; the §11 deliverable still required the oracle to be *built* with route 2 as its
   width backend.
2. **The delivered font gate still permitted the falsified sequence.** §2 required an explicit
   `document.fonts.load`; §11 still listed only `ready` + `check`, which reproduces the exact
   fallback-face defect the spike measured.

**Minor** — `oracle_hash` comment still said "our vendored geometry code"; `1211.2` printed as
though exact when the value is `1211.25`; risk list still named the obsolete `1170` cap;
Tier 1 still gated child-before-frame contiguity as though clipping depended on it.

### Claude's response

All six accepted and applied. Nothing rejected. Four of the six were stale §11 text — the
predictable consequence of amending a plan section that describes work now completed, in
prescriptive future tense. The contiguity fix keeps the check but restates its rationale:
it exists so emission order stays stable for diffs and `geometry_hash`, not because clipping
needs it.

## Round 9b — independent consistency sweep (33 agents, 5 lenses, adversarial verification)

Run in parallel with Codex round 9 rather than after it, so the two critiques were genuinely
independent. Five lenses — arithmetic, cross-section consistency, evidence fidelity,
fail-closed integrity, implementability — each finding then handed to a verifier instructed to
**refute** it and to default to refuted when uncertain. Four findings survived.

1. **[major] The font gate was glyph-blind — including after the round-9 fix.** The sharpest
   finding of the whole review, and one Codex did not reach. Loading with a *sample string*
   per (family, size) fetches only the subsets that sample happens to touch, and
   `document.fonts.check(font)` **without a text argument** probes the spec default `" "`,
   which lies in `LATIN` — so the gate returns `true` while a label containing a glyph from an
   unfetched subset is silently measured against the fallback face. The verifier confirmed the
   mechanism against the installed package rather than the plan's prose: Nunito ships five
   subsets `[CYRILLIC_EXT, CYRILLIC, VIETNAMESE, LATIN_EXT, LATIN]`, and Excalidraw's own
   `loadSceneFonts` is character-driven via `getCharsPerFamily`. Fixed by mirroring the
   library: both the load and the check are driven by the union of characters the deck will
   actually lay out, with the text argument mandatory on `check`.

   The verifier also **corrected the finding's own examples** — `→` (`U+2192`) is in no Nunito
   subset at all, so it falls back identically in our measurement and in the viewer and does
   not diverge; the real cases are `LATIN_EXT` glyphs at a wrap boundary, and Cyrillic or
   Vietnamese labels failing wholesale. That correction is recorded because it scopes the fix.

2. **[major] `target viewer version` was claiming to be two incompatible things.** It is an
   `oracle_hash` term, §8 requires the hash recomputed "from the live runtime", and the
   round-9 risk-list amendment claimed viewer drift "surfaces as a blocked build". All three
   cannot hold: as a pinned constant, live drift is undetectable; as an observed value, every
   build must fetch excalidraw.com and §11's offline requirement breaks. **This was a flaw I
   introduced in the round-9 amendment itself** — the fourth instance of the pattern. Resolved
   explicitly: pinned constant, hermetic build, drift caught by re-running the parity probe on
   a schedule, and the constant asserted equal to the probe's recorded viewer build.

3. **[minor] Contrast defect misattributed.** §8 cited "white-on-`#3b82f6` at 2.54:1".
   Recomputed independently from `examples/al-1.excalidraw`: `#3b82f6` measures **3.68:1**, and
   the 2.54:1 pair is white on **`#60a5fa`** (`tf_posenc_t`). Corrected — and `#3b82f6` still
   fails, because at 14 units its effective size is ≈9.8 px, under the 24 px threshold where
   ≥4.5:1 applies. The verifier additionally re-derived and confirmed every *other*
   reference-derived figure in the plan: scene bbox 2705 × 1695, 51 text elements all
   `fontFamily: 3`, nine distinct sizes, em-per-char 0.417–1.111, `ev_sft_t` 240×55 in 260×75,
   header drift −377.5, `winter_zone` erasing exactly 340 units of `timeline_spine`.

4. **[minor] The width saving was stated on the wrong base.** "Nunito is 20.2% narrower than
   Cascadia" inverts it: 20.2% is Cascadia-*wider*; Nunito is **16.8% narrower**. Net per text
   block is `0.832 × 1.125 = 0.936` (≈6.4% less area), not `0.898`. The conclusion survives,
   the number did not. Corrected in both PLAN.md and the spike findings.

### Claude's response

All four applied. Two of them — the font gate and the viewer-version contradiction — were
defects in text written *during round 9*, which is the plan's recurring failure mode arriving
on schedule. Running the sweep in parallel with Codex rather than after it is what surfaced
them in the same pass instead of one round later.

## Round 10 — Codex

Opened by reproducing the arithmetic again — threshold `1211.25`, width binds at cap `1211`,
font-area factor `.936`. Six findings.

**Major**

1. **Deck-specific font repertoire conflated with the signed oracle fingerprint.** §2's new
   rule put the deck's measured character repertoire into the fingerprint, and §8 hashes that
   fingerprint into a **fixture-derived, signed** oracle record. A per-deck value cannot live
   inside a fixed signature: the first deck using an extended glyph would either find no
   matching `passed` record or violate the stated hash binding. **This was a flaw introduced by
   the round-9b fix**, not present in the original plan — the fifth instance of the pattern.
2. **Viewer-drift risk text now false.** §2 had been corrected to say hermetic builds cannot
   detect live drift, but the risk list still claimed drift "surfaces as a blocked build".
   I had fixed one site and not the other.

**Minor** — the font pseudocode left `chars` unkeyed in the second loop; §11 and key-decision
#5 still said bare `document.fonts.check` despite §2 making the text argument mandatory; parity
evidence covered only the Latin sample while the plan admits extended, Cyrillic and Vietnamese
text; `.936` was presented as a per-block area ratio when it is an equal-line comparison.

### Claude's response

All six applied, none rejected.

Finding 1 resolved by splitting the record in two, in an explicit table: the **oracle font
fingerprint** covers the fixture corpus and is hashed into `oracle_hash`; the **per-deck loaded
repertoire** is diagnostics only and is gated at *run* level by the `check` assertion. Changing
decks cannot invalidate the oracle; adding a glyph cannot silently pass.

On the parity nit I **widened the evidence rather than narrowing the claim**, which produced
two new measurements:

- `probe-06` now measures parity across four repertoires — **100/100 identical** against live
  excalidraw.com, up from 25/25 on Latin alone. Every occurrence of the old figure updated.
- `probe-08` is new and **measures** the vacuous-check claim instead of arguing it. Loading
  Latin only for Nunito, bare `check()` returns `true` while `check(font, text)` returns
  `false`, and in that window **Cyrillic measures 13.34% narrow**, Vietnamese 0.73%.

That measurement also **narrowed the sweep's own finding**: `LATIN_EXT` rides along with
`LATIN` and shows 0% error, so the "`ł`, `ā`, `ș`, `ℓ`, `†` move a wrap point" case did not
reproduce and has been corrected in both PLAN.md and the findings. The serious case is a
Cyrillic or Vietnamese label — which §9's schema does not exclude and Stage A can emit.

Turning an argued defect into a measured one is worth the round on its own: the theoretical
version over-claimed its scope in one direction and under-claimed its severity in the other.

## Round 11 — Codex

First round where both majors landed on **code** rather than prose — the natural consequence
of the spike turning parts of the plan into running artifacts.

**Major**

1. **The scheduled parity probe was not fail-closed.** `probe-06` recorded
   `fingerprintIdentical` and the viewer build but never asserted them and never exited
   non-zero, while `run-all` only inspects exit codes. A live viewer mismatch would therefore
   produce a *passing* `pnpm spike:network`. Since round 10 had just promoted that probe to
   the sole drift-detection mechanism, the mitigation was decorative at the moment it was
   written — the sixth instance of a fix introducing its own flaw.
2. **Drift remediation could certify an incompatible runtime.** The risk bullet said a failed
   probe "forces a constant update and a re-signed oracle". That is backwards: re-pinning
   changes what compatibility we *claim*, and does nothing about a local bundle that produces
   different geometry.

**Minor** — the 100/100 evidence rounded widths to 4dp before diffing and discarded the
`check` results, so "identical" could hide a sub-0.0001 systematic drift or two matching
fallback measurements; `probe-08`'s prose called the bare check vacuous in all three cases when
`LATIN_EXT` has both checks `true` and is a correct pass; `charsFor[family, size]` is
comma-operator-unsafe JavaScript that would silently key by `size` alone.

### Claude's response

All five applied, none rejected.

`probe-06` now exits non-zero on any of: viewer build unidentified; live build ≠
`PINNED_VIEWER_BUILD`; any failed `document.fonts.check(font, text)`; a missing fingerprint
entry; `max |delta|` beyond an explicit `TOLERANCE_PX` compared on **raw** values; the scene
failing to round-trip; the viewer rewriting the bound text; or non-zero bound-text geometry
delta. `fontChecks` and `failedChecks` are persisted rather than observed.

**The failure path was verified, not assumed.** Pointing `PINNED_VIEWER_BUILD` at a bogus
value:

```
NEGATIVE TEST exit=1
PARITY FAILED — oracle must stay blocked:
  - viewer build drifted: pinned 9999-01-01T00:00:00Z-deadbee, live 2026-07-28T16:12:33Z-1acf66e
```

Restored, the real run reports `parity holds: 100 measurements, max |delta| 0px`. A gate whose
failure path has never executed is not a gate — and this one had been asserted in prose for a
full round before it could actually fail.

Major 2 resolved by fixing the remediation *order* in the risk list and echoing it in the
probe's own failure message: the oracle stays blocked until either the local bundle and adapter
are updated so parity passes, or the target stays pinned and the divergence is accepted as an
explicit compatibility narrowing. Only after parity passes may the constant be re-pinned and
the oracle re-signed.

The pseudocode became real JavaScript — a `Map` keyed on a serialised `${family} ${size}`
string, with a comment naming the comma-operator trap.

## Round 12 — Codex

Four majors, all in probe code. The plan text is now stable enough that the argument has
migrated almost entirely into the artifacts it produced.

**Major**

1. **The ordering assertion was false by construction.** `probe-06` compared the two scenes
   *positionally* while deliberately building them in opposite array orders, so
   `identicalGeometry: false` appeared in every successful report — and the failure path
   ignored the field. **I had seen this myself and dismissed it as "a false alarm from my own
   comparison" without fixing it**, which is worse than not noticing: a known-broken assertion
   was left in the report for two rounds.
2. **"Raw" tolerance was not raw.** Fingerprints and geometry were rounded to 4dp at capture,
   then deltas rounded again, so sub-0.0001 drift passed `TOLERANCE_PX = 0`. The word "raw"
   was in my round-11 message to Codex; it was not in the code.
3. **Frame/container integrity recorded but not asserted.** The gate checked text and
   dimensions only — a viewer could drop `frameId`, `containerId`, `boundElements` or whole
   elements and still pass.
4. **Compatibility narrowing had no oracle state.** §2 offered "the target stays pinned and the
   divergence is accepted" as a remediation path, but no state, signature or gate implemented
   it, and the probe would have failed regardless.

**Minor** — PLAN.md contained **three literal NUL bytes** in the Map-key snippet, so `file`
classified it as `data` rather than text; `failedChecks` iterated only over keys *present* in
the report, so a truncated report passed; failure reasons lived only in stderr; the header
still said "Round 8".

### Claude's response

All eight applied, none rejected.

Findings 1 and 3 fixed together with a `diffScenes` comparator that normalises by element id
and asserts `type, x, y, width, height, angle, frameId, containerId, fontSize, fontFamily,
lineHeight, text, originalText, boundElements` — across **both** the two orderings and
written-vs-viewer. Finding 2 fixed by removing every `toFixed` before comparison; rounding is
now presentation-only.

**Both fixes were negative-tested, and the first attempt was invalid.** Perturbing the source
element changed *both* sides identically, so the test proved nothing — a false green I caught
only because the expected failure did not appear. Perturbing the comparison baseline instead:

```
BD_NEG_TEST=1  → exit 1  viewer altered the scene we wrote (1):
                         [{"id":"cont1","field":"width","written":300.00001,"viewer":300}]
BD_NEG_FP=1    → exit 1  font metric drift: max |delta| 0.00001px > 0px
```

Sub-0.0001 drift now fails on both axes. The new scene assertion also immediately caught real
viewer behaviour: **excalidraw.com canonicalises `boundElements: null` to `[]`**. That is a
representation difference with no geometric meaning, so both sides are normalised before
comparison — and the generator should emit `[]` so round-trips stay byte-clean.

Finding 4 resolved by **deleting the escape hatch** rather than implementing it. It was not
merely unimplemented, it is unverifiable in principle: you cannot measure parity against a
viewer build that no longer serves. There is now exactly one remediation path — update the
bundle until parity passes, then re-pin and re-sign — and the probe's failure message says so.

The NUL bytes were real: three of them, from a `${family}\x00${size}` template key I wrote
without noticing. `file` reported `PLAN.md: data`. Replaced with
`JSON.stringify([family, size])`, and every repo document re-checked as UTF-8 text.

## Round 13 — Codex

**Major**

1. **`boundElements` normalisation was fail-open.** `v && v.length ? v : []` converts malformed
   non-array values — `{}`, `{length: 0}` — into `[]`, so a viewer returning garbage would have
   compared equal. The round-12 fix for a real normalisation had itself opened a hole.
2. **Duplicate element ids were silently discarded.** `new Map(scene.map(...))` keeps only the
   last entry, so a duplicated viewer element evaded `diffScenes` entirely.
3. **The parity fixture violated the plan's own metric tuple.** It wrote `lineHeight: 1.25` onto
   a `fontFamily: 6` (Nunito) element whose observed `lineHeight` is **1.35** — and the height
   `81 = 3 × 20 × 1.35` proved the inconsistency inside the same object. The comparator also
   omitted `textAlign`, `verticalAlign` and `autoResize`. The parity test was not exercising the
   tuple it exists to pin.

**Minor** — the fixture still wrote `boundElements: null` while the viewer returns `[]`, which
weakens "byte-clean" to "semantic"; and **the `BD_NEG_TEST` / `BD_NEG_FP` hooks I cited as
evidence in round 12 were absent from the checked-in probe** — I had restored from a backup
after running them, deleting the very hooks whose output I quoted.

### Claude's response

All five applied, none rejected.

Finding 3 fixed at the root: the fixture is now **the converter's own output, re-identified**,
rather than a hand-assembled approximation of it. The report confirms `fontFamily: 6`,
`lineHeight: 1.35`, `height: 81` — self-consistent for the first time. `ASSERTED_FIELDS` now
covers the complete tuple including `textAlign`, `verticalAlign` and `autoResize`.

Finding 1's normaliser now maps **only** `null`/`undefined` to `[]` and marks any non-array
value `MALFORMED(...)`, which cannot compare equal to anything. Finding 2 collects duplicate
ids into the failure list rather than throwing, so the run fails cleanly with a named cause.

The minor about missing hooks was the sharpest of the five, because it invalidated my round-12
evidence rather than the code. Four env-gated hooks are now committed — `BD_NEG_SCENE`,
`BD_NEG_FP`, `BD_NEG_BOUND`, `BD_NEG_DUP` — and all four were re-run against the checked-in
file:

```
BD_NEG_SCENE=1  → exit 1  viewer altered the scene we wrote (1):
                          [{"id":"cont1","field":"width","written":300.00001,"viewer":300}]
BD_NEG_FP=1     → exit 1  font metric drift: max |delta| 0.00001px > 0px
BD_NEG_BOUND=1  → exit 1  boundElements written MALFORMED({"length":0})
BD_NEG_DUP=1    → exit 1  duplicate element ids in viewer: cont1
clean           → exit 0  parity holds: 100 measurements, max |delta| 0px
```

The `null → []` finding produced a real generator rule, now in §7 and asserted by Tier 1:
**emit `boundElements: []`, never `null`.** Both mean "nothing bound", but emitting `null`
makes every round-trip differ from what the viewer holds — turning a byte-clean parity check
into a merely semantic one, and hiding real drift behind an expected diff.

## Round 14 — Codex

Two majors, both the same shape: **an assertion widened without widening the data it reads.**

1. **`ASSERTED_FIELDS` named `textAlign`, `verticalAlign` and `autoResize`, but neither scene
   projection carried them.** Both sides therefore compared `undefined === undefined` and
   passed. The round-13 fix that added those fields to the comparator had been reported as
   closing the metric-tuple gap; it closed nothing for three of the fields.
2. **The fingerprint diff iterated only `ours` keys**, so a key missing from *both*
   measurements was never compared — a 99/100 corpus would have reported as passing.

**Minor** — two identically-malformed `boundElements` values would compare equal, since
`MALFORMED(...)` was still a comparable string; and `BD_NEG_FP` mutated the deltas *after*
`maxDelta` was computed, leaving the persisted percentage maximum stale at 0 while the pixel
maximum moved.

### Claude's response

All four applied, none rejected.

Both projections now carry the full tuple, and `diffScenes` treats a field **absent from either
side** as a failure rather than a match — the specific mechanism that let three fields pass
silently for a round. An `EXPECTED_FP_KEYS` set is asserted on both sides, failing on missing
*and* unexpected keys. Non-array `boundElements` is pushed as an explicit failure rather than
returned as a comparable value. The `BD_NEG_FP` hook moved ahead of both maxima.

Verified against the checked-in file:

```
clean          → exit 0   passed: true   maxPct: 0        maxPx: 0
BD_NEG_FP=1    → exit 1   passed: false  maxPct: 1e-06    maxPx: 1e-05     (percentage no longer stale)
BD_NEG_SCENE=1 → exit 1   viewer altered the scene we wrote: cont1.width 300.00001 vs 300
BD_NEG_BOUND=1 → exit 1   boundElements: non-array on written, {"length":0}
BD_NEG_DUP=1   → exit 1   duplicate element ids in viewer: cont1
```

The persisted report now shows `textAlign: center`, `verticalAlign: middle`,
`autoResize: true`, `lineHeight: 1.35`, `fontFamily: 6` — every asserted field genuinely
present on both sides for the first time.

## Round 15 — Codex — **VERDICT: APPROVED**

> "The prior major findings are closed: tuple fields are projected and guarded, and the
> fingerprint key set is exact and fail-closed."

Three nits, no majors.

1. **`?? null` masked raw absence.** The `in` check ran against the *projected* object, where
   `?? null` had already filled the field — so a viewer that dropped `fontFamily` entirely
   would compare `null === null` and pass. The round-14 guard closed absence-after-projection
   but not absence-before-it.
2. The two new failure branches (missing field, wrong fingerprint key set) had no negative
   hooks — the same gap round 13 caught, arriving again on new code.
3. The probe comment said "Three repertoires" while four are measured.

### Claude's response

All three applied despite the approval.

Nit 1 fixed with `REQUIRED_ON_TEXT` — the text tuple must be genuinely non-null on both sides
of a text element, so a masked absence fails. Nit 2 closed by committing three more hooks, and
every branch of the gate is now exercised from the checked-in file:

```
clean               → exit 0  parity holds: 100 measurements, max |delta| 0px
BD_NEG_FIELD=1      → exit 1  txt1.textAlign: field not projected on both sides
BD_NEG_NULLFIELD=1  → exit 1  txt1.fontFamily: written null vs viewer 6
BD_NEG_FPKEY=1      → exit 1  fingerprint key set wrong: ours/Excalifont@18/latin (missing)
BD_NEG_SCENE=1      → exit 1  cont1.width 300.00001 vs 300
BD_NEG_FP=1         → exit 1  font metric drift: max |delta| 0.00001px > 0px
BD_NEG_BOUND=1      → exit 1  boundElements: non-array on written, {"length":0}
BD_NEG_DUP=1        → exit 1  duplicate element ids in viewer: cont1
```

---

# Outcome — approved at round 15

Fifteen rounds, in two phases. Rounds 1–8 argued the plan to its first APPROVED. Then the
§11 spike **ran**, falsified four of the assumptions that argument had been built on, and the
verdict was reopened rather than kept.

**44 findings applied across rounds 9–15. None rejected.** (One was rejected earlier, in
round 7 — Codex withdrew it itself in round 8 after grepping.)

**What the second phase actually bought.** Seven of the findings were defects in text or code
written *during* the same review — the fail-open font gate, the viewer-version contradiction,
the non-asserting parity probe, the "raw" tolerance that rounded to 4dp, the fixture whose
`lineHeight` the library never produces, three fields asserted but never projected, and a
`?? null` that masked the absence it was meant to catch. Every one of them was introduced by a
fix for the previous round's finding. That is the whole case for continuing past the first
approval: the failure mode was never the original plan, it was the repairs.

**The most valuable single finding cost nothing to state and could not have been reasoned
into existence.** Round 13's nit — that the negative-test output quoted as evidence in round 12
came from hooks deleted by a backup restore — invalidated the *proof*, not the code. The gate
was real; the demonstration was not reproducible. Seven hooks are now committed.

**Measurement beat argument repeatedly.** The glyph-blind font gate was found by reasoning but
its *scope* was wrong in both directions until probe 8 measured it: `LATIN_EXT` was claimed
vulnerable and is not; Cyrillic was under-stated and measures **13.34% narrow**. Widening the
parity corpus from 25 to 100 measurements likewise turned a claim that outran its evidence into
one that does not.

**Still not settled, and unchanged by any of this:** the visual system. Palette, legend shade
sets and per-pattern geometry rest on a single example the author called "representative, but
needs improving". Composition thresholds ship as warnings for exactly that reason. Ticket 01
gates the look; nothing in fifteen rounds of review can substitute for more examples.
