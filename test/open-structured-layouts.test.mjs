import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");

const spec = {
  title: "Open structured layouts",
  subtitle: "Typography carries the comparison and the checklist",
  footer: "Measured bounds; editorial surfaces",
  bands: [
    {
      heading: "Compare the controls",
      deck: "Three choices, one visible distinction per column",
      pattern: "comparison",
      accent: "blue",
      nodes: [
        { label: "Temperature", tone: "amber", items: ["Scales logits before softmax"] },
        { label: "Top-p", tone: "green", items: ["Sorts candidates by probability", "Keeps the smallest cumulative set"] },
        { label: "Top-k", tone: "violet", items: ["Keeps exactly k candidates", "Uses a fixed survivor count"] },
      ],
    },
    {
      heading: "Checklist for a sound read",
      deck: "Primary actions lead; supporting notes stay visually secondary",
      pattern: "checklist",
      accent: "slate",
      nodes: [
        { label: "Read the source", note: "Confirm the behavior before changing it" },
        { label: "Name the boundary", note: "Record what the evidence cannot prove" },
        { label: "Run the check", note: "Keep a reproducible command beside the claim" },
        { label: "Review the result", note: "Look for overflow, contrast, and missing content" },
      ],
    },
  ],
};

function pngSize(buffer) {
  assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test("generated comparison and checklist layouts stay open, readable, and complete", { timeout: 120_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "beautidraw-open-structured-"));
  const specPath = join(directory, "deck-spec.json");
  const output = join(directory, "generate");
  await writeFile(specPath, `${JSON.stringify(spec)}\n`);

  const result = spawnSync("pnpm", ["exec", "node", resolve(root, "scripts/generate.mjs"), specPath, output], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const files = await readdir(output);
  assert.ok(files.includes("deck.excalidraw"));
  assert.ok(files.includes("diagnostics.json"));
  assert.ok(files.includes("scene.png"));
  assert.ok(files.includes("band-01.png"));
  assert.ok(files.includes("band-02.png"));

  const deck = JSON.parse(await readFile(join(output, "deck.excalidraw"), "utf8"));
  const diagnostics = JSON.parse(await readFile(join(output, "diagnostics.json"), "utf8"));
  assert.equal(diagnostics.stage, "done");
  assert.equal(diagnostics.passed, true);

  const expectedText = spec.bands.flatMap((band) => band.nodes.flatMap((node) => [node.label, node.note, ...(node.items ?? [])].filter(Boolean)));
  const textElements = deck.elements.filter((element) => element.type === "text");
  for (const text of expectedText) {
    assert.ok(textElements.some((element) => element.text.includes(text)), `missing rendered text: ${text}`);
  }

  for (const [index, pattern] of [[0, "comparison"], [1, "checklist"]]) {
    const frameId = `b${index}-frame`;
    const frame = deck.elements.find((element) => element.id === frameId);
    const bandDiagnostics = diagnostics.diagnostics.bands.find((band) => band.index === index);
    assert.equal(bandDiagnostics.pattern, pattern);
    assert.ok(frame, `missing frame for ${pattern}`);
    assert.ok(frame.height <= 1211, `${pattern} frame exceeds the height cap`);

    const members = deck.elements.filter((element) => element.frameId === frameId);
    const surfaces = members.filter((element) => element.type === "rectangle");
    assert.ok(surfaces.length > 0, `${pattern} should retain bound measurement surfaces`);
    assert.ok(surfaces.every((surface) => surface.backgroundColor === "transparent" && surface.strokeColor === "transparent"));

    const boundText = members.filter((element) => element.type === "text" && element.containerId);
    assert.ok(boundText.length > 0, `${pattern} should retain bound text`);
    assert.ok(boundText.every((element) => element.strokeColor === "#1e1e1e" && element.text.trim()), `${pattern} text must stay explicitly readable`);
    assert.ok(boundText.every((element) => element.fontSize * bandDiagnostics.zActual >= 12), `${pattern} text fell below the legibility gate`);
    if (pattern === "checklist") {
      const rowText = boundText.filter((element) => element.containerId.includes("b1-row"));
      const labels = rowText.filter((element) => element.containerId.includes("-label"));
      const notes = rowText.filter((element) => element.containerId.includes("-note"));
      assert.ok(labels.length > 0 && labels.every((element) => element.fontSize === 36), "checklist labels should use the primary hierarchy size");
      assert.ok(notes.length > 0 && notes.every((element) => element.fontSize === 30), "checklist notes should use the supporting hierarchy size");
    }
    if (pattern === "comparison") {
      const headings = boundText.filter((element) => element.containerId.includes("b0-col") && element.containerId.includes("-heading"));
      const itemText = boundText.filter((element) => element.containerId.includes("b0-col") && element.containerId.includes("-items"));
      assert.equal(headings.length, 3, "comparison should retain one bound heading surface per column");
      assert.ok(headings.every((element) => element.fontSize === 36), "comparison headings should use the primary hierarchy size");
      assert.equal(itemText.length, 3, "comparison should retain one bound item surface per column");
      assert.ok(itemText.every((element) => element.fontSize === 30), "comparison body should use the teaching readability size");
      assert.ok(itemText.every((element) => element.verticalAlign === "top"), "comparison item text should align to the top of its measured surface");
      assert.equal(new Set(itemText.map((element) => element.y)).size, 1, "comparison item text should share a top edge across unequal lists");
    }

    const accents = members.filter((element) => element.type === "line" && element.strokeColor !== "transparent");
    assert.ok(accents.length > 0, `${pattern} should expose purposeful accent rules or markers`);
    for (const element of members) {
      if (element.type === "frame") continue;
      assert.ok(element.x >= frame.x - 0.5, `${pattern} element ${element.id} escapes left frame bound`);
      assert.ok(element.y >= frame.y - 0.5, `${pattern} element ${element.id} escapes top frame bound`);
      assert.ok(element.x + element.width <= frame.x + frame.width + 0.5, `${pattern} element ${element.id} escapes right frame bound`);
      assert.ok(element.y + element.height <= frame.y + frame.height + 0.5, `${pattern} element ${element.id} escapes bottom frame bound`);
    }

    const png = await readFile(join(output, `band-${String(index + 1).padStart(2, "0")}.png`));
    const size = pngSize(png);
    assert.ok(size.width > 0 && size.height > 0, `${pattern} PNG must have dimensions`);
  }

  assert.equal(textElements.some((element) => element.text.startsWith("• ") && element.containerId?.includes("b1-row")), false);
});

test("a one-node checklist uses one content column and clears edge coverage", { timeout: 120_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "beautidraw-one-node-checklist-"));
  const specPath = join(directory, "deck-spec.json");
  const output = join(directory, "generate");
  const oneNodeSpec = structuredClone(spec);
  oneNodeSpec.bands = [{
    heading: "Verify the result",
    deck: "One item still deserves a full editorial row",
    pattern: "checklist",
    accent: "blue",
    nodes: [{ label: "Verify the result" }],
  }];
  await writeFile(specPath, `${JSON.stringify(oneNodeSpec)}\n`);

  const result = spawnSync("pnpm", ["exec", "node", resolve(root, "scripts/generate.mjs"), specPath, output], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const deck = JSON.parse(await readFile(join(output, "deck.excalidraw"), "utf8"));
  const frame = deck.elements.find((element) => element.id === "b0-frame");
  const members = deck.elements.filter((element) => element.frameId === "b0-frame");
  const surfaces = members.filter((element) => element.type === "rectangle");
  assert.equal(surfaces.length, 1);
  assert.ok(surfaces[0].x < 100, "one-node checklist should reach the left page margin");
  assert.ok(surfaces[0].x + surfaces[0].width > 2180, "one-node checklist should reach the right page margin");
  assert.ok(frame.height <= 1211, "one-node checklist frame exceeds the height cap");
});

test("the command catalog dense checklist stays within its measured body budget", { timeout: 120_000 }, async () => {
  const catalogPath = join(root, "decks/claude-code-commands/deck-spec.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const denseIndex = catalog.bands.findIndex((band) => band.heading === "The skip list — session & setup");
  assert.ok(denseIndex >= 0, "command catalog dense checklist band is missing");

  const directory = await mkdtemp(join(tmpdir(), "beautidraw-command-checklist-"));
  const output = join(directory, "generate");
  const result = spawnSync("pnpm", ["exec", "node", resolve(root, "scripts/generate.mjs"), catalogPath, output], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const diagnostics = JSON.parse(await readFile(join(output, "diagnostics.json"), "utf8"));
  const bandDiagnostics = diagnostics.diagnostics.bands.find((band) => band.index === denseIndex);
  assert.equal(bandDiagnostics.pattern, "checklist");
  assert.equal(bandDiagnostics.columnsUsed, 2);
  assert.ok(bandDiagnostics.frameHeight <= 1211, "dense command checklist frame exceeds the height cap");

  const deck = JSON.parse(await readFile(join(output, "deck.excalidraw"), "utf8"));
  const rowText = deck.elements.filter((element) => element.type === "text" && element.containerId?.includes(`b${denseIndex}-row`));
  assert.equal(rowText.length, catalog.bands[denseIndex].nodes.length);
  assert.ok(rowText.every((element) => element.fontSize === 23 && element.verticalAlign === "top"));
});
