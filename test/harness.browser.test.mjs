import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { withHarness } from "../scripts/harness-runner.mjs";

const root = resolve(import.meta.dirname, "..");
const deck = JSON.parse(await readFile(resolve(root, "test/fixtures/editor-fidelity-deck.json"), "utf8"));

for (const viewport of [
  { width: 1600, height: 900 },
  { width: 1280, height: 800 },
]) {
  test(`editor fidelity at ${viewport.width}x${viewport.height}`, async () => {
    await withHarness(async ({ page }) => {
      assert.match(await page.locator("[role=status]").innerText(), /loading/i);
      const result = await page.evaluate((scene) => window.__bdLoadScene(scene), deck);
      assert.equal(result.state, "ready");
      assert.equal(result.missingImages.length, 0);
      assert.equal(result.imageReadiness[0].state, "load");
      for (const frame of result.frames) {
        assert.ok(frame.fitZoom > 0);
        assert.ok(frame.minimumEffectiveTextPx >= 12);
        assert.deepEqual(frame.clippedElementIds, []);
        assert.deepEqual(frame.overlapElementIds, []);
        assert.deepEqual(frame.obscuredByChromeElementIds, []);
      }
      assert.match(await page.locator("[role=status]").innerText(), /ready/i);
      assert.equal(await page.locator('[data-testid="main-menu-trigger"]').getAttribute("aria-label"), "Open main menu");
      assert.equal(await page.locator('[aria-label="Frame navigation"]').isVisible(), true);
      await page.locator('[data-testid="main-menu-trigger"]').focus();
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-testid")), "main-menu-trigger");
      await page.keyboard.press("Tab");
      assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), "BODY");
    }, { viewport });
  });
}

test("invalid image exposes a structured recovery state", async () => {
  await withHarness(async ({ page }) => {
    const invalid = structuredClone(deck);
    invalid.files["9993ed1d2781fdafd876038e6be0a1162d377be1"].dataURL = "data:image/png;base64,not-a-png";
    const result = await page.evaluate((scene) => window.__bdLoadScene(scene), invalid);
    assert.deepEqual(result, {
      state: "error",
      error: {
        reason: "Image red did not render before the 2000ms deadline.",
        recovery: "Verify the embedded data URL and rebuild the deck.",
      },
    });
    const alert = page.locator('[role="alert"]');
    assert.equal(await alert.isVisible(), true);
    assert.match(await alert.innerText(), /Image red did not render.*Verify the embedded data URL/s);
    const recovery = page.getByRole("button", { name: "Recover editor" });
    await recovery.focus();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-testid")), "harness-recovery");
  });
});
