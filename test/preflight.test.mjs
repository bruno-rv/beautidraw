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

test("malformed visual callouts produce structured failures", () => {
  const spec = valid();
  spec.bands[0].visual = { callouts: "not-an-array" };
  assert.doesNotThrow(() => collectDeckPreflightFailures(spec));
  const failures = collectDeckPreflightFailures(spec);
  assert.match(failures.map(({ field, reason }) => `${field}: ${reason}`).join("\n"), /callouts/);
});
