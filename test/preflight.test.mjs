import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  const dataCalloutOverflow = structuredClone(dataCalloutBase);
  dataCalloutOverflow.bands[0].visual.explanation = "E".repeat(50);
  dataCalloutOverflow.bands[0].visual.callouts[0].note = "B".repeat(180);
  dataCalloutOverflow.bands[0].visual.callouts[1].note = "D".repeat(180);
  const dataCalloutFailures = collectDeckPreflightFailures(dataCalloutOverflow);
  assert.match(dataCalloutFailures.map(({ reason }) => reason).join("\n"), /footer content is/);
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
          kind: "distribution",
          caption: "Synthetic illustrative example — toy probabilities are not real output.",
          candidates: [{ label: "blue", probability: 0.6 }, { label: "gray", probability: 0.4 }],
          selected: "gray",
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
