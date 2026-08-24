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
    const geometry = await page.evaluate((scene) => {
      const api = window.__bdApi;
      const expected = [];
      const fontFamily = (role) => role === "mono" ? 3 : role === "handwritten" ? 5 : 6;
      for (const source of scene.elements) {
        if (source.type === "text" && !source.containerId) {
          const [measured] = api.convertToExcalidrawElements([{
            id: source.id,
            type: "text",
            x: source.x,
            y: source.y,
            text: source.text,
            fontSize: source.fontSize,
            fontFamily: source.fontFamily,
            role: source.role,
          }], { regenerateIds: false });
          expected.push({ key: source.id, ...measured });
        }
        if (source.type === "rectangle" && source.label) {
          const converted = api.convertToExcalidrawElements([{
            id: source.id,
            type: "rectangle",
            x: source.x,
            y: source.y,
            width: source.width,
            height: source.height,
            strokeColor: source.strokeColor,
            backgroundColor: source.backgroundColor,
            label: { ...source.label, fontFamily: fontFamily(source.label.role) },
          }], { regenerateIds: false });
          const container = converted.find((element) => element.id === source.id);
          const label = converted.find((element) => element.type === "text" && element.containerId === source.id);
          expected.push({ key: source.id, ...container });
          expected.push({ key: `${source.id}:label`, ...label });
        }
      }
      return expected.map(({ key, id, type, containerId, text, x, y, width, height }) => ({ key, id, type, containerId, text, x, y, width, height }));
    }, fixture);
    const serialized = await page.evaluate(() => window.__bdEditor.getSceneElements().map((element) => ({
      id: element.id,
      type: element.type,
      containerId: element.containerId,
      text: element.type === "text" ? element.text : element.label?.text,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    })));
    const tolerance = 0.75;
    for (const expected of geometry) {
      const visible = expected.key.endsWith(":label")
        ? serialized.find((element) => element.containerId === expected.key.slice(0, -6) && element.text === expected.text)
        : serialized.find((element) => element.id === expected.key);
      if (!visible || visible.type !== expected.type || (expected.type === "text" && visible.text !== expected.text) ||
        ["x", "y", "width", "height"].some((field) => Math.abs(visible[field] - expected[field]) > tolerance)) {
        throw new Error(`editor-visible geometry diverges from converter metrics for ${expected.key}`);
      }
    }
    for (const frame of result.frames) {
      if (frame.minimumEffectiveTextPx < 12 || frame.clippedElementIds.length || frame.overlapElementIds.length || frame.obscuredByChromeElementIds.length || frame.geometryElementIds.length) {
        throw new Error(`fidelity report failed for ${frame.frameId} at ${viewport.width}x${viewport.height}`);
      }
    }
    if (result.imageReadiness.some((image) => image.state !== "load")) throw new Error("mixed-media fixture image was not decoded");
    if (result.imageRegions.some((image) => image.actualHash.length !== 64 || image.placeholderHash.length !== 64 || image.actualHash === image.placeholderHash || image.actualHash !== image.restoredHash)) {
      throw new Error("mounted image pixel digest did not prove loaded, stable scene rendering");
    }
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
