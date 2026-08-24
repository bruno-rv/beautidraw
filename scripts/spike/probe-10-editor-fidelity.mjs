// Offline editor-fidelity probe: load the checked-in mixed-media scene through
// the same public harness APIs used by browser regressions at both supported
// reading viewports.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { withHarness } from "../harness-runner.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixture = JSON.parse(await readFile(resolve(root, "test/fixtures/editor-fidelity-deck.json"), "utf8"));
const viewports = [
  { width: 1600, height: 900 },
  { width: 1280, height: 800 },
];
const reports = [];

for (const viewport of viewports) {
  const report = await withHarness(async ({ page }) => {
    const result = await page.evaluate((scene) => window.__bdLoadScene(scene), fixture);
    if (result.state !== "ready") throw new Error(`editor fidelity did not reach ready at ${viewport.width}x${viewport.height}`);
    const serialized = await page.evaluate(() => window.__bdEditor.getSceneElements().map((element) => ({
      id: element.id,
      type: element.type,
      text: element.type === "text" ? element.text : element.label?.text,
      width: element.width,
      height: element.height,
    })));
    const expectedText = fixture.elements.filter((element) => element.type === "text");
    for (const source of expectedText) {
      const visible = serialized.find((element) => element.id === source.id);
      if (!visible || visible.text !== source.text || visible.width + 0.5 < source.width || visible.height + 0.5 < source.height) {
        throw new Error(`serialized text diverges from editor-visible bounds for ${source.id}`);
      }
    }
    for (const frame of result.frames) {
      if (frame.minimumEffectiveTextPx < 12 || frame.clippedElementIds.length || frame.overlapElementIds.length || frame.obscuredByChromeElementIds.length) {
        throw new Error(`fidelity report failed for ${frame.frameId} at ${viewport.width}x${viewport.height}`);
      }
    }
    if (result.imageReadiness.some((image) => image.state !== "load")) throw new Error("mixed-media fixture image was not decoded");
    return {
      viewport,
      state: result.state,
      imageReadiness: result.imageReadiness,
      imageRegions: result.imageRegions,
      frames: result.frames,
    };
  }, { viewport });
  reports.push(report);
}

const output = resolve(root, ".scratch/spike-artifacts/probe-10-editor-fidelity.json");
await mkdir(resolve(root, ".scratch/spike-artifacts"), { recursive: true });
await writeFile(output, JSON.stringify({ probe: "10-editor-fidelity", reports }, null, 2) + "\n");
console.log(JSON.stringify({ probe: "10-editor-fidelity", output, reports }, null, 2));
