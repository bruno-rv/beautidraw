import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { collectBuildReceipt, formatBuildReceipt } from "../scripts/build-receipt.mjs";

test("receipt requires a published output directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "beautidraw-receipt-"));
  const stageDir = join(root, "stage");
  await assert.rejects(
    () => collectBuildReceipt(stageDir, { elapsedMs: 321 }),
    /publishedOutDir is required/,
  );
  await assert.rejects(
    () => collectBuildReceipt(stageDir, { elapsedMs: 321, publishedOutDir: stageDir }),
    /publishedOutDir must differ from stageDir/,
  );
});

test("receipt counts frames, embedded files, recursive bytes, and published paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "beautidraw-receipt-"));
  const stageDir = join(root, "out-stage-token");
  const publishedOutDir = join(root, "published");
  await mkdir(join(stageDir, "nested"), { recursive: true });
  await writeFile(join(stageDir, "deck.excalidraw"), JSON.stringify({
    elements: [{ type: "frame" }, { type: "frame" }, { type: "text" }],
    files: { one: { dataURL: "data:image/png;base64,AA==" }, two: { dataURL: "data:image/png;base64,AA==" } },
  }));
  await writeFile(join(stageDir, "scene.png"), Buffer.from([1, 2, 3]));
  await writeFile(join(stageDir, "diagnostics.json"), "diagnostics");
  await writeFile(join(stageDir, "composition-manifest.json"), "manifest");
  await writeFile(join(stageDir, "outline.md"), "outline");
  await writeFile(join(stageDir, "nested", "band-01.png"), Buffer.from([4, 5, 6, 7]));

  const receipt = await collectBuildReceipt(stageDir, { elapsedMs: 321, publishedOutDir });
  assert.equal(receipt.elapsedMs, 321);
  assert.equal(receipt.frameCount, 2);
  assert.equal(receipt.embeddedAssetCount, 2);
  assert.equal(receipt.totalBytes, 7 + Buffer.byteLength(JSON.stringify({
    elements: [{ type: "frame" }, { type: "frame" }, { type: "text" }],
    files: { one: { dataURL: "data:image/png;base64,AA==" }, two: { dataURL: "data:image/png;base64,AA==" } },
  })) + Buffer.byteLength("diagnostics") + Buffer.byteLength("manifest") + Buffer.byteLength("outline"));
  for (const path of Object.values(receipt.paths)) {
    assert.equal(path.startsWith(resolve(publishedOutDir) + "/"), true);
    assert.equal(path.includes("out-stage-token"), false);
  }

  const formatted = formatBuildReceipt(receipt);
  assert.match(formatted, /elapsed: 321 ms/);
  assert.match(formatted, /frames: 2/);
  assert.match(formatted, /embedded assets: 2/);
  assert.match(formatted, /bytes: 201/);
  assert.match(formatted, new RegExp(resolve(publishedOutDir).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
