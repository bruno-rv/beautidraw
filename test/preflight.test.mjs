import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { CONTENT_BUDGETS, collectDeckPreflightFailures, preflightDeck } from "../scripts/preflight.mjs";

const valid = () => ({
  title: "Minimal deck",
  subtitle: "A valid structured frame",
  footer: "Source fixture",
  bands: [{
    heading: "One structured frame",
    deck: "A small valid fixture",
    pattern: "flow",
    accent: "blue",
    nodes: [{ label: "Input", note: "A source value" }],
  }],
});

test("preflight accepts a minimal valid structured deck", async () => {
  const result = await preflightDeck({ spec: valid() });
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test("core preflight permits a manual canvas without visual while automatic preflight rejects it", async () => {
  const spec = {
    ...valid(),
    bands: [{
      heading: "Manual scene",
      deck: "Composition supplies the visual later",
      pattern: "canvas",
      accent: "violet",
      height: 620,
    }],
  };
  const core = await preflightDeck({ spec, mode: "core" });
  assert.equal(core.ok, true);
  assert.deepEqual(core.failures, []);

  const automatic = await preflightDeck({ spec, mode: "automatic" });
  assert.equal(automatic.ok, false);
  assert.ok(automatic.failures.some(({ field, reason }) => field === "bands[0].visual" && /requires a visual declaration/.test(reason)));
});

test("core preflight permits unused manual canvas nodes beyond automatic family capacity", async () => {
  const spec = {
    ...valid(),
    bands: [{
      heading: "Manual scene",
      deck: "Composition supplies the visual later",
      pattern: "canvas",
      accent: "violet",
      height: 620,
      nodes: Array.from({ length: 7 }, (_, index) => ({ label: `Manual node ${index + 1}` })),
    }],
  };
  const core = await preflightDeck({ spec, mode: "core" });
  assert.equal(core.ok, true);
  assert.deepEqual(core.failures, []);
});

test("automatic relationship families require meaningful authored cardinality", () => {
  const makeSpec = (family, count, omitNodes = false) => ({
    ...valid(),
    bands: [{
      heading: `${family} fixture`,
      deck: "A bounded relationship scene",
      pattern: "canvas",
      accent: "blue",
      height: 700,
      visual: { family, ...(omitNodes ? {} : { nodes: Array.from({ length: count }, (_, index) => ({ label: `Node ${index + 1}` })) }) },
    }],
  });
  for (const [family, minimum] of [["pipeline", 3], ["constellation", 2]]) {
    for (let count = 0; count < minimum; count += 1) {
      const spec = makeSpec(family, count);
      const failures = collectDeckPreflightFailures(spec);
      assert.ok(failures.some(({ field, reason }) => field === "bands[0].visual.nodes" && reason.includes(`needs at least ${minimum}`)), `${family}/${count} must fail before browser work`);
      const core = collectDeckPreflightFailures(spec, { mode: "core" });
      assert.equal(core.some(({ reason }) => reason.includes(`needs at least ${minimum}`)), false, `${family} core/manual mode remains exempt`);
    }
    const accepted = collectDeckPreflightFailures(makeSpec(family, minimum));
    assert.equal(accepted.some(({ reason }) => reason.includes(`needs at least ${minimum}`)), false, `${family}/${minimum} authored nodes must remain accepted`);
    const omitted = collectDeckPreflightFailures(makeSpec(family, 0, true));
    assert.ok(omitted.some(({ field, reason }) => field === "bands[0].visual.nodes" && reason.includes(`needs at least ${minimum}`)), `${family}/omitted nodes must fail before audit`);
    const omittedCore = collectDeckPreflightFailures(makeSpec(family, 0, true), { mode: "core" });
    assert.equal(omittedCore.some(({ reason }) => reason.includes(`needs at least ${minimum}`)), false, `${family} omitted nodes must remain core/manual exempt`);
  }
});

test("minimum relationship cardinalities survive a real automatic build", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "beautidraw-relationship-minimums-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const spec = {
    title: "Relationship minimums",
    subtitle: "Three-stage pipeline and two-node constellation",
    footer: "Automatic composition fixture",
    bands: [
      {
        heading: "Pipeline",
        deck: "A bounded pipeline with genuine stages",
        pattern: "canvas",
        accent: "blue",
        height: 700,
        visual: {
          family: "pipeline",
          nodes: [
            { label: "Input", note: "A bounded source enters the stage." },
            { label: "Transform", note: "The mechanism changes the representation." },
            { label: "Output", note: "The result remains inspectable." },
          ],
          explanation: "Three genuine stages show how the mechanism transforms an input into a result.",
          example: "A source passes through a transform before its output is inspected.",
          tradeoff: "More stages add context but increase the reading path.",
          inspect: "inspect pipeline stages",
        },
      },
      {
        heading: "Constellation",
        deck: "A bounded constellation with a relationship",
        pattern: "canvas",
        accent: "violet",
        height: 700,
        visual: {
          family: "constellation",
          nodes: [
            { label: "Source", note: "The first authored point." },
            { label: "Claim", note: "The second point receives the relationship." },
          ],
          explanation: "Two authored points and their connector make the relationship visible.",
          example: "A source connects directly to the claim it supports.",
          tradeoff: "A split frame is preferable when more points would crowd the map.",
          evidence: ["Evidence preserves the authored relationship and its visible connector."],
          inspect: "inspect constellation links",
        },
      },
    ],
  };
  const specPath = join(temp, "spec.json");
  const output = join(temp, "out");
  await writeFile(specPath, JSON.stringify(spec));
  const projectRoot = resolve(import.meta.dirname, "..");
  const result = spawnSync(process.execPath, [resolve(projectRoot, "scripts/build-deck.mjs"), specPath, output], { cwd: projectRoot, encoding: "utf8", timeout: 120_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const deck = JSON.parse(await readFile(join(output, "deck.excalidraw"), "utf8"));
  assert.ok(deck.elements.some((element) => element.id === "b0-frame"));
  assert.ok(deck.elements.some((element) => element.id === "b1-frame"));
});

test("top-level malformed bands return structured failures", async () => {
  for (const spec of [{}, 42, { bands: "not-an-array" }]) {
    const result = await preflightDeck({ spec });
    assert.equal(result.ok, false);
    assert.ok(result.failures.length > 0);
    assert.equal(result.failures[0].stage, "preflight");
  }
});

test("non-object bands fail with a field path", () => {
  const failures = collectDeckPreflightFailures({ ...valid(), bands: [null] });
  assert.equal(failures[0].stage, "preflight");
  assert.match(failures[0].reason, /bands\[0\]/);
});

test("missing semantic image fails before browser work", async () => {
  const spec = valid();
  spec.bands[0] = {
    heading: "Illustration",
    deck: "Needs a semantic image",
    pattern: "canvas",
    accent: "blue",
    height: 780,
    visual: { family: "illustration" },
  };
  const result = await preflightDeck({ specPath: "/tmp/deck-spec.json", spec });
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].stage, "preflight");
  assert.match(result.failures[0].reason, /visual\.image\.file/);
});

test("truncated PNG and missing image description are reported", async () => {
  const root = await mkdtemp(join(tmpdir(), "beautidraw-preflight-"));
  await writeFile(join(root, "broken.png"), Buffer.from("89504e470d0a1a0a", "hex"));
  const spec = valid();
  spec.bands[0] = {
    heading: "Illustration",
    deck: "Needs a semantic image",
    pattern: "canvas",
    accent: "blue",
    height: 780,
    visual: {
      family: "illustration",
      image: { file: "broken.png", use: "Show the scene" },
    },
  };
  const result = await preflightDeck({ specPath: join(root, "deck.json"), spec });
  assert.equal(result.ok, false);
  assert.match(result.failures.map(({ reason }) => reason).join("\n"), /visual\.image\.description/);
  assert.match(result.failures.map(({ reason }) => reason).join("\n"), /truncated|IHDR/);
});

test("missing semantic image use is reported independently", async () => {
  const root = await mkdtemp(join(tmpdir(), "beautidraw-preflight-"));
  const png = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a", "hex").copy(png);
  png.writeUInt32BE(13, 8);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(1, 16);
  png.writeUInt32BE(1, 20);
  await writeFile(join(root, "broken.png"), png);
  const spec = valid();
  spec.bands[0] = {
    heading: "Illustration",
    deck: "Needs a semantic image",
    pattern: "canvas",
    accent: "blue",
    height: 780,
    visual: {
      family: "illustration",
      image: { file: "broken.png", description: "Describe the scene" },
    },
  };
  const result = await preflightDeck({ specPath: join(root, "deck.json"), spec });
  assert.match(result.failures.map(({ reason }) => reason).join("\n"), /visual\.image\.use/);
});

test("a 29-byte IHDR prefix is still a truncated PNG", async () => {
  const root = await mkdtemp(join(tmpdir(), "beautidraw-preflight-"));
  const png = Buffer.alloc(29);
  Buffer.from("89504e470d0a1a0a", "hex").copy(png);
  png.writeUInt32BE(13, 8);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(1, 16);
  png.writeUInt32BE(1, 20);
  await writeFile(join(root, "truncated.png"), png);
  const spec = valid();
  spec.bands[0] = {
    heading: "Illustration",
    deck: "Needs a semantic image",
    pattern: "canvas",
    accent: "blue",
    height: 780,
    visual: {
      family: "illustration",
      image: { file: "truncated.png", use: "Use the scene", description: "Describe the scene" },
    },
  };
  const result = await preflightDeck({ specPath: join(root, "deck.json"), spec });
  assert.equal(result.ok, false);
  assert.match(result.failures.map(({ reason }) => reason).join("\n"), /truncated|IHDR/);
});

test("malformed JSON is a preflight failure without a stack", async () => {
  const root = await mkdtemp(join(tmpdir(), "beautidraw-preflight-"));
  const path = join(root, "malformed.json");
  await writeFile(path, '{ "bands": [ }');
  const result = await preflightDeck({ specPath: path });
  assert.equal(result.ok, false);
  assert.match(result.failures[0].reason, /valid JSON/);
  assert.doesNotMatch(result.failures[0].reason, /\bat .*\.mjs:/);
});

test("content budgets report measured values without echoing large input", () => {
  const spec = valid();
  const hugeHeading = "x".repeat(12_000);
  spec.bands[0].heading = hugeHeading;
  spec.bands[0].visual = {
    thesis: "t".repeat(CONTENT_BUDGETS.thesisChars + 1),
    inspect: "i".repeat(CONTENT_BUDGETS.inspectChars + 1),
    explanation: Array.from({ length: CONTENT_BUDGETS.explanationWords + 1 }, () => "word").join(" "),
    callouts: [{ label: "l".repeat(CONTENT_BUDGETS.calloutLabelChars + 1), note: "n".repeat(CONTENT_BUDGETS.calloutNoteChars + 1) }],
  };
  const failures = collectDeckPreflightFailures(spec);
  const message = failures.map(({ reason, field }) => `${field}: ${reason}`).join("\n");
  assert.match(message, /heading.*12000/);
  assert.match(message, /thesis.*121/);
  assert.match(message, /inspect.*85/);
  assert.match(message, /explanation.*141/);
  assert.match(message, /callout label.*73/);
  assert.match(message, /callout note.*181/);
  assert.equal(message.includes(hugeHeading), false);
});

test("footer budget counts every rendered callout and evidence part", async () => {
  const underBudget = valid();
  underBudget.bands[0] = {
    heading: "Callout frame",
    deck: "A bounded footer fixture",
    pattern: "canvas",
    accent: "blue",
    height: 700,
    visual: {
      family: "orbit",
      explanation: "Base explanation",
      callouts: [
        { kind: "example", label: "First", note: "A concise note" },
        { kind: "boundary", label: "Second", note: "Another concise note" },
      ],
      evidence: ["First evidence", "Second evidence"],
    },
  };
  assert.equal((await preflightDeck({ spec: underBudget })).ok, true);

  const calloutOverflow = structuredClone(underBudget);
  calloutOverflow.bands[0].visual.callouts = [
    { kind: "example", label: "A".repeat(60), note: "B".repeat(180) },
    { kind: "boundary", label: "C".repeat(60), note: "D".repeat(180) },
  ];
  const calloutFailures = await preflightDeck({ spec: calloutOverflow });
  assert.equal(calloutFailures.ok, false);
  assert.match(calloutFailures.failures.map(({ reason }) => reason).join("\n"), /footer content is/);

  const evidenceOverflow = structuredClone(underBudget);
  evidenceOverflow.bands[0].visual.callouts = [];
  evidenceOverflow.bands[0].visual.evidence = Array.from({ length: 4 }, () => "Evidence ".repeat(30));
  const evidenceFailures = await preflightDeck({ spec: evidenceOverflow });
  assert.equal(evidenceFailures.ok, false);
  assert.match(evidenceFailures.failures.map(({ reason }) => reason).join("\n"), /footer content is/);

  const dataCalloutBase = {
    ...valid(),
    bands: [{
      heading: "Data callouts",
      deck: "A bounded data footer fixture",
      pattern: "canvas",
      accent: "blue",
      height: 700,
      visual: {
        family: "illustration",
        data: {
          kind: "token-sequence",
          caption: "Synthetic illustrative example — toy IDs are not real tokenizer output.",
          pieces: [{ text: "The", id: "toy-01" }, { text: " sky", id: "toy-02" }],
        },
        image: { file: "assets/data.png", use: "Data scene", description: "A data teaching scene" },
        explanation: "Base explanation",
        callouts: [
          { kind: "example", label: "A".repeat(60), note: "B".repeat(150) },
          { kind: "boundary", label: "C".repeat(60), note: "D".repeat(150) },
        ],
      },
    }],
  };
  const dataCalloutUnderBudget = collectDeckPreflightFailures(dataCalloutBase);
  assert.equal(dataCalloutUnderBudget.some(({ reason }) => /footer content is/.test(reason)), false);
  const labelOnly = structuredClone(dataCalloutBase);
  labelOnly.bands[0].visual.explanation = "E".repeat(430);
  labelOnly.bands[0].visual.callouts = [
    { kind: "example", label: "A".repeat(72) },
    { kind: "boundary", label: "B".repeat(72) },
  ];
  assert.match(collectDeckPreflightFailures(labelOnly).map(({ reason }) => reason).join("\n"), /footer content is/);
  const fallbackLabelOnly = structuredClone(labelOnly);
  delete fallbackLabelOnly.bands[0].visual.callouts;
  fallbackLabelOnly.bands[0].visual.nodes = [{ label: "C".repeat(72) }, { label: "D".repeat(72) }];
  assert.match(collectDeckPreflightFailures(fallbackLabelOnly).map(({ reason }) => reason).join("\n"), /footer content is/);
  const wideCallout = structuredClone(dataCalloutBase);
  wideCallout.bands[0].visual.callouts = [
    { kind: "example", label: "W".repeat(72) },
    { kind: "boundary", label: "界".repeat(72) },
  ];
  const wideCalloutFailures = collectDeckPreflightFailures(wideCallout);
  assert.match(wideCalloutFailures.map(({ reason }) => reason).join("\n"), /data illustration boundary needs/);
  assert.equal(collectDeckPreflightFailures(wideCallout, { mode: "core" }).some(({ reason }) => /data illustration boundary needs/.test(reason)), false);
  const dataCalloutOverflow = structuredClone(dataCalloutBase);
  dataCalloutOverflow.bands[0].visual.explanation = "E".repeat(50);
  dataCalloutOverflow.bands[0].visual.callouts[0].note = "B".repeat(180);
  dataCalloutOverflow.bands[0].visual.callouts[1].note = "D".repeat(180);
  const dataCalloutFailures = collectDeckPreflightFailures(dataCalloutOverflow);
  assert.match(dataCalloutFailures.map(({ reason }) => reason).join("\n"), /footer content is/);
});

test("automatic footer geometry rejects compressed generic families before browser work", () => {
  const wideNote = `${"n".repeat(89)}\n${"n".repeat(90)}`;
  const makeSpec = (height, inspect) => ({
    title: "Generic footer geometry",
    subtitle: "A bounded editorial fixture",
    footer: "Toy values only",
    bands: [{
      heading: "Orbit",
      deck: "A bounded footer fixture",
      pattern: "canvas",
      accent: "blue",
      height,
      visual: {
        family: "orbit",
        nodes: Array.from({ length: 6 }, (_, index) => ({ label: `Node ${index + 1}`, note: "A bounded note" })),
        callouts: [
          { kind: "example", label: "W".repeat(72), note: wideNote },
          { kind: "boundary", label: "W".repeat(72), note: wideNote },
        ],
        ...(inspect ? { inspect: "inspect orbit geometry" } : {}),
      },
    }],
  });
  for (const inspect of [false, true]) {
    const automatic = collectDeckPreflightFailures(makeSpec(240, inspect));
    assert.ok(automatic.some(({ reason }) => /automatic orbit editorial footer needs|automatic orbit inspect footer needs/.test(reason)), `compressed orbit footer must fail (inspect=${inspect})`);
    const core = collectDeckPreflightFailures(makeSpec(240, inspect), { mode: "core" });
    assert.equal(core.some(({ reason }) => /automatic orbit (editorial|inspect) footer needs/.test(reason)), false, "core/manual mode must remain exempt");
  }
  const adequate = collectDeckPreflightFailures(makeSpec(1000, false));
  assert.equal(adequate.some(({ reason }) => /automatic orbit (editorial|inspect) footer needs/.test(reason)), false, "adequate generic footer body remains accepted");
  const monoFits = makeSpec(800, true);
  monoFits.bands[0].visual.callouts = [
    { kind: "example", label: "Example", note: "Short note" },
    { kind: "boundary", label: "Boundary", note: "Short note" },
  ];
  monoFits.bands[0].visual.inspect = "i".repeat(80);
  assert.equal(collectDeckPreflightFailures(monoFits).some(({ reason }) => /automatic orbit inspect footer needs/.test(reason)), false, "mono inspect text that fits must remain accepted");
});

test("data inspect wrapping uses mono metrics before compose", () => {
  const makeSpec = (inspect, mode = "automatic") => ({
    title: "Data inspect metrics",
    subtitle: "A bounded native scene",
    footer: "Toy values only",
    bands: [{
      heading: "Distribution",
      deck: "A bounded distribution scene",
      pattern: "canvas",
      accent: "blue",
      height: 800,
      visual: {
        family: "illustration",
        data: {
          kind: "distribution",
          caption: "Synthetic illustrative example — toy values are not real output.",
          candidates: [{ label: "one", probability: 0.6 }, { label: "two", probability: 0.4 }],
          selected: "one",
        },
        image: { file: "assets/data.png", use: "Data scene", description: "A data teaching scene" },
        explanation: "Short data explanation.",
        inspect,
      },
    }],
  });
  const monoFailures = collectDeckPreflightFailures(makeSpec("i".repeat(80)));
  assert.ok(monoFailures.some(({ field, reason }) => field === "bands[0].visual.inspect" && /data illustration inspect needs/.test(reason)), "Cascadia-width inspect text must reject before compose");
  const coreFailures = collectDeckPreflightFailures(makeSpec("i".repeat(80), "core"), { mode: "core" });
  assert.equal(coreFailures.some(({ field, reason }) => field === "bands[0].visual.inspect" && /data illustration inspect needs/.test(reason)), false, "core/manual mode remains exempt");
  const asciiFailures = collectDeckPreflightFailures(makeSpec("run tokenizer inspect"));
  assert.equal(asciiFailures.some(({ field, reason }) => field === "bands[0].visual.inspect" && /data illustration inspect needs/.test(reason)), false, "ordinary mono inspect command remains accepted");
  const nearFit = collectDeckPreflightFailures(makeSpec("i".repeat(61)));
  assert.equal(nearFit.some(({ field, reason }) => field === "bands[0].visual.inspect" && /data illustration inspect needs/.test(reason)), false, "mono text just within the measured column remains accepted");
  const justOver = collectDeckPreflightFailures(makeSpec("i".repeat(62)));
  assert.ok(justOver.some(({ field, reason }) => field === "bands[0].visual.inspect" && /data illustration inspect needs/.test(reason)), "mono text just beyond the measured column must fail before compose");
});

test("short data canvases reject only unrenderable editorial height", () => {
  const spec = {
    ...valid(),
    bands: [{
      heading: "Short data canvas",
      deck: "A bounded data scene",
      pattern: "canvas",
      accent: "blue",
      height: 500,
      visual: {
        family: "illustration",
        data: {
          kind: "token-sequence",
          caption: "Synthetic illustrative example — toy probabilities are not real output.",
          pieces: [{ text: "The", id: "toy-01" }, { text: " sky", id: "toy-02" }, { text: " is", id: "toy-03" }],
        },
        image: { file: "assets/data.png", use: "Data scene", description: "A data teaching scene" },
        explanation: "Compact data explanation stays readable.",
      },
    }],
  };
  const accepted = collectDeckPreflightFailures(spec);
  assert.equal(accepted.some(({ reason }) => /data illustration/.test(reason)), false);
  const explicitNewlines = structuredClone(spec);
  explicitNewlines.bands[0].height = 700;
  explicitNewlines.bands[0].visual.explanation = "First bounded line.\nSecond bounded line.";
  assert.equal(collectDeckPreflightFailures(explicitNewlines).some(({ reason }) => /data illustration/.test(reason)), false);
  const renderedTooTall = structuredClone(spec);
  renderedTooTall.bands[0].visual.explanation = "Token IDs map each piece; context then shifts meaning with nearby pieces before scoring.";
  renderedTooTall.bands[0].visual.example = "The sky becomes two toy IDs before attention.";
  const renderedFailures = collectDeckPreflightFailures(renderedTooTall);
  assert.match(renderedFailures.map(({ reason }) => reason).join("\n"), /data illustration explanation needs/, "the exact three-line browser copy must fail before compose");
  const rejected = structuredClone(spec);
  rejected.bands[0].visual.explanation = "B".repeat(400);
  const failures = collectDeckPreflightFailures(rejected);
  assert.match(failures.map(({ reason }) => reason).join("\n"), /data illustration explanation needs/);
  assert.equal(failures.find(({ reason }) => /data illustration explanation needs/.test(reason)).recovery.includes("split it across bands"), true);
  for (const glyphs of ["m", "w", "O", "N", "W", "界"]) {
    const wide = structuredClone(spec);
    wide.bands[0].height = 700;
    wide.bands[0].visual.explanation = glyphs.repeat(250);
    const wideFailures = collectDeckPreflightFailures(wide);
    assert.match(wideFailures.map(({ reason }) => reason).join("\n"), /data illustration explanation needs/, `${glyphs}: wide text must not pass preflight`);
  }
});

test("native data row heights reject compressed bodies for every data kind", () => {
  const caption = "Synthetic illustrative example — toy values are not real output.";
  const dataCases = [
    {
      kind: "token-sequence",
      data: {
        kind: "token-sequence",
        caption,
        pieces: Array.from({ length: 8 }, (_, index) => ({ text: `piece-${index}`, id: `toy-${String(index).padStart(2, "0")}` })),
      },
      reason: /native token rows/,
    },
    {
      kind: "lookup",
      data: {
        kind: "lookup",
        caption,
        key: "toy-key",
        rows: [
          { id: "toy-01", label: "one", vector: [0.1, 0.2] },
          { id: "toy-02", label: "two", vector: [0.2, 0.3] },
        ],
        selected: "toy-01",
      },
      reason: /native lookup rows/,
    },
    {
      kind: "distribution",
      data: {
        kind: "distribution",
        caption,
        candidates: [{ label: "one", probability: 0.6 }, { label: "two", probability: 0.4 }],
        selected: "one",
      },
      reason: /native distribution rows/,
    },
  ];
  const makeSpec = (data, height) => ({
    title: "Compressed native data",
    subtitle: "A bounded native scene",
    footer: "Toy values only",
    bands: [{
      heading: "Data canvas",
      deck: "A bounded native data scene",
      pattern: "canvas",
      accent: "blue",
      height,
      visual: {
        family: "illustration",
        data,
        image: { file: "assets/data.png", use: "Data scene", description: "A data teaching scene" },
        explanation: "Short native data explanation.",
      },
    }],
  });
  for (const { kind, data, reason } of dataCases) {
    const compressed = collectDeckPreflightFailures(makeSpec(data, 288));
    const heightFailure = compressed.find(({ reason: message }) => reason.test(message));
    assert.ok(heightFailure, `288px ${kind} data must fail before browser work`);
    assert.match(heightFailure.recovery, /canvas height/);
    const core = collectDeckPreflightFailures(makeSpec(data, 288), { mode: "core" });
    assert.equal(core.some(({ reason: message }) => reason.test(message)), false, `${kind}: core/manual mode remains exempt`);
    const validHeight = collectDeckPreflightFailures(makeSpec(data, 800));
    assert.equal(validHeight.some(({ reason: message }) => reason.test(message)), false, `${kind}: a physically valid body remains accepted`);
  }
});

test("wide native captions reject the compressed caption lane for every data kind", () => {
  const image = { file: "assets/data.png", use: "Data scene", description: "A native data teaching scene" };
  const dataCases = [
    { kind: "token-sequence", data: { kind: "token-sequence", caption: "", pieces: [{ text: "one", id: "toy-01" }, { text: "two", id: "toy-02" }] } },
    { kind: "lookup", data: { kind: "lookup", caption: "", key: "toy-key", rows: [{ id: "toy-01", label: "one", vector: [0.1, 0.2] }, { id: "toy-02", label: "two", vector: [0.2, 0.3] }], selected: "toy-01" } },
    { kind: "distribution", data: { kind: "distribution", caption: "", candidates: [{ label: "one", probability: 0.6 }, { label: "two", probability: 0.4 }], selected: "one" } },
  ];
  const makeSpec = (data, height) => ({
    title: "Caption capacity",
    subtitle: "A bounded native scene",
    footer: "Toy values only",
    bands: [{ heading: "Data canvas", deck: "A bounded native data scene", pattern: "canvas", accent: "blue", height, visual: { family: "illustration", data, image, explanation: "Short native data explanation." } }],
  });
  for (const { kind, data } of dataCases) {
    for (const glyph of ["W", "界"]) {
      const wideCaption = (`Synthetic illustrative example — toy ${glyph.repeat(80)}`).slice(0, 120);
      const spec = makeSpec({ ...structuredClone(data), caption: wideCaption }, 360);
      const failures = collectDeckPreflightFailures(spec);
      const captionFailure = failures.find(({ field, reason }) => field.endsWith(".caption") && /caption requires/.test(reason));
      assert.ok(captionFailure, `${kind}/${glyph}: wide caption must fail before browser work`);
      assert.match(captionFailure.recovery, /canvas height|shorten the data caption/);
      const core = collectDeckPreflightFailures(spec, { mode: "core" });
      assert.equal(core.some(({ field, reason }) => field.endsWith(".caption") && /caption requires/.test(reason)), false, `${kind}/${glyph}: core/manual mode remains exempt`);
      const valid = collectDeckPreflightFailures(makeSpec({ ...structuredClone(data), caption: "Synthetic illustrative example — toy values are not real output." }, 800));
      assert.equal(valid.some(({ field, reason }) => field.endsWith(".caption") && /caption requires/.test(reason)), false, `${kind}: normal caption at 800px remains accepted`);
    }
  }
});

test("native data capacity rejects wide dense labels while ordinary fixtures remain accepted", () => {
  const image = { file: "assets/data.png", use: "Data scene", description: "A native data teaching scene" };
  const makeSpec = (data) => ({
    title: "Native data",
    subtitle: "Bounded data",
    footer: "Toy values only",
    bands: [{
      heading: "Data canvas",
      deck: "A bounded native data scene",
      pattern: "canvas",
      accent: "blue",
      height: 800,
      visual: { family: "illustration", data, image },
    }],
  });
  const caption = "Synthetic illustrative example — toy values are not real output.";
  const dataCases = [
    {
      kind: "token-sequence",
      ordinary: {
        kind: "token-sequence",
        caption,
        pieces: Array.from({ length: 8 }, (_, index) => ({ text: `piece-${index}`, id: `toy-${String(index).padStart(2, "0")}` })),
      },
      wide: (glyph) => ({
        kind: "token-sequence",
        caption,
        pieces: Array.from({ length: 8 }, (_, index) => ({ text: glyph.repeat(18), id: `toy-${String(index).padStart(2, "0")}` })),
      }),
    },
    {
      kind: "lookup",
      ordinary: {
        kind: "lookup",
        caption,
        key: "toy-key",
        rows: Array.from({ length: 5 }, (_, index) => ({ id: `toy-${index}`, label: `row-${index}`, vector: [0.1, 0.2] })),
        selected: "toy-0",
      },
      wide: (glyph) => ({
        kind: "lookup",
        caption,
        key: "toy-key",
        rows: Array.from({ length: 5 }, (_, index) => ({ id: `toy-${index}`, label: `${glyph.repeat(17)}${index}`, vector: [0.1, 0.2] })),
        selected: "toy-0",
      }),
    },
    {
      kind: "distribution",
      ordinary: {
        kind: "distribution",
        caption,
        candidates: [0.30, 0.20, 0.15, 0.12, 0.10, 0.13].map((probability, index) => ({ label: `candidate-${index}`, probability })),
        selected: "candidate-0",
      },
      wide: (glyph) => ({
        kind: "distribution",
        caption,
        candidates: [0.30, 0.20, 0.15, 0.12, 0.10, 0.13].map((probability, index) => ({ label: `${glyph.repeat(17)}${index}`, probability })),
        selected: `${glyph.repeat(17)}0`,
      }),
    },
  ];
  for (const dataCase of dataCases) {
    assert.equal(collectDeckPreflightFailures(makeSpec(dataCase.ordinary)).length, 0, `${dataCase.kind}: ordinary labels remain accepted`);
    for (const glyph of ["W", "界"]) {
      const wideSpec = makeSpec(dataCase.wide(glyph));
      const failures = collectDeckPreflightFailures(wideSpec);
      const capacityFailure = failures.find(({ reason }) => /native data label requires/.test(reason));
      assert.ok(capacityFailure, `${dataCase.kind}/${glyph}: wide dense labels must fail native capacity preflight`);
      assert.match(capacityFailure.field, /bands\[0\]\.visual\.data/);
      if (dataCase.kind === "token-sequence") assert.match(capacityFailure.recovery, /reduce token items/);
      else assert.match(capacityFailure.recovery, /manual composition/);
      const coreFailures = collectDeckPreflightFailures(wideSpec, { mode: "core" });
      assert.equal(coreFailures.some(({ reason }) => /native data label requires/.test(reason)), false, `${dataCase.kind}/${glyph}: core/manual mode must remain exempt`);
    }
  }
  const malformed = [
    { ...dataCases[0].ordinary, pieces: null },
    { ...dataCases[1].ordinary, rows: null },
    { ...dataCases[2].ordinary, candidates: null },
    { ...dataCases[0].ordinary, pieces: [null, { text: "ok", id: "toy-01" }] },
  ];
  for (const data of malformed) {
    assert.doesNotThrow(() => collectDeckPreflightFailures(makeSpec(data)));
    const failures = collectDeckPreflightFailures(makeSpec(data));
    assert.ok(failures.some(({ field }) => field.startsWith("bands[0].visual.data")));
    assert.ok(failures.every(({ stage }) => stage === "preflight"));
  }
  const unsafe = structuredClone(dataCases[0].ordinary);
  unsafe.pieces[0].text = "/usr/bin";
  const outlineFailures = collectDeckPreflightFailures(makeSpec(unsafe));
  const outlineFailure = outlineFailures.find(({ reason }) => /machine-local path/.test(reason));
  assert.ok(outlineFailure, "absolute data values must fail before browser work");
  assert.equal(outlineFailure.field, "bands[0].visual.data");
  assert.match(outlineFailure.recovery, /portable/);
  const inspectPathSpec = makeSpec(dataCases[0].ordinary);
  inspectPathSpec.bands[0].visual.inspect = "/usr/bin";
  const inspectFailures = collectDeckPreflightFailures(inspectPathSpec);
  assert.equal(inspectFailures.some(({ field, reason }) => field === "bands[0].visual.data" && /machine-local path/.test(reason)), false, "inspect paths must not be attributed to data values");
});

test("malformed visual callouts produce structured failures", () => {
  const spec = valid();
  spec.bands[0].visual = { callouts: "not-an-array" };
  assert.doesNotThrow(() => collectDeckPreflightFailures(spec));
  const failures = collectDeckPreflightFailures(spec);
  assert.match(failures.map(({ field, reason }) => `${field}: ${reason}`).join("\n"), /callouts/);
});

test("visual evidence and nodes must be arrays", async () => {
  for (const [field, value] of [["evidence", { source: "not-an-array" }], ["nodes", { label: "not-an-array" }]]) {
    const spec = valid();
    spec.bands[0].visual = { family: "orbit", [field]: value };
    const result = await preflightDeck({ spec });
    assert.equal(result.ok, false);
    assert.ok(result.failures.some((failure) => failure.field === `bands[0].visual.${field}`));
    assert.ok(result.failures.every((failure) => failure.stage === "preflight"));
  }
});

const validPng = () => Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function illustrationSpec(file) {
  const spec = valid();
  spec.bands[0] = {
    heading: "Illustration",
    deck: "Uses a complete PNG",
    pattern: "canvas",
    accent: "blue",
    height: 780,
    visual: {
      family: "illustration",
      image: { file, use: "Use the scene", description: "Describe the scene" },
    },
  };
  return spec;
}

test("preflight accepts a structurally valid PNG with non-empty IDAT", async () => {
  const root = await mkdtemp(join(tmpdir(), "beautidraw-preflight-valid-png-"));
  await writeFile(join(root, "valid.png"), validPng());
  const result = await preflightDeck({
    specPath: join(root, "deck.json"),
    spec: illustrationSpec("valid.png"),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test("declared image use and description must be distinct", async () => {
  const root = await mkdtemp(join(tmpdir(), "beautidraw-preflight-image-description-"));
  await writeFile(join(root, "valid.png"), validPng());
  const spec = illustrationSpec("valid.png");
  spec.bands[0].visual.image.description = spec.bands[0].visual.image.use;
  const result = await preflightDeck({
    specPath: join(root, "deck.json"),
    spec,
  });
  assert.equal(result.ok, false);
  assert.match(result.failures.map(({ reason }) => reason).join("\n"), /description.*distinct from use/);
});

test("preflight rejects a structurally complete PNG without an IDAT chunk", async () => {
  const root = await mkdtemp(join(tmpdir(), "beautidraw-preflight-no-idat-"));
  const png = validPng();
  const idat = png.indexOf(Buffer.from("IDAT"));
  assert.ok(idat > 4);
  const chunkStart = idat - 4;
  const chunkLength = png.readUInt32BE(chunkStart);
  const withoutIdat = Buffer.concat([
    png.subarray(0, chunkStart),
    png.subarray(chunkStart + 12 + chunkLength),
  ]);
  await writeFile(join(root, "no-idat.png"), withoutIdat);
  const result = await preflightDeck({
    specPath: join(root, "deck.json"),
    spec: illustrationSpec("no-idat.png"),
  });
  assert.equal(result.ok, false);
  assert.match(result.failures.map(({ reason }) => reason).join("\n"), /IDAT/i);
});

test("preflight rejects a structurally complete PNG with a corrupt chunk CRC", async () => {
  const root = await mkdtemp(join(tmpdir(), "beautidraw-preflight-corrupt-png-"));
  const corrupt = validPng();
  const idat = corrupt.indexOf(Buffer.from("IDAT"));
  assert.ok(idat > 0);
  corrupt[idat + 4] ^= 0xff;
  await writeFile(join(root, "corrupt.png"), corrupt);
  const result = await preflightDeck({
    specPath: join(root, "deck.json"),
    spec: illustrationSpec("corrupt.png"),
  });
  assert.equal(result.ok, false);
  assert.match(result.failures.map(({ reason }) => reason).join("\n"), /CRC|checksum|corrupt/i);
});
