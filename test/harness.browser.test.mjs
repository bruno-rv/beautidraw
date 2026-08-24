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
      assert.equal(result.imageRegions[0].distinctAnimationFrames, true);
      assert.ok(result.imageRegions[0].stableFrame > result.imageRegions[0].actualFrame);
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
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-testid")), null);
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.activeElement?.tagName), "DIV");
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-testid")), "main-menu-trigger");
      assert.equal(await page.evaluate(() => document.activeElement?.matches(":focus-visible")), true);
      await page.keyboard.press("Shift+Tab");
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-testid")), null);
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
        reason: "Image red failed to load.",
        recovery: "Verify the embedded data URL and rebuild the deck.",
      },
    });
    const alert = page.locator('[role="alert"]');
    assert.equal(await alert.isVisible(), true);
    assert.match(await alert.innerText(), /Image red failed to load.*Verify the embedded data URL/s);
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-testid")), "harness-recovery");
    assert.equal(await page.evaluate(() => document.activeElement?.matches(":focus-visible")), true);
  });
});

test("scene loading preserves restore, file, and fidelity failure classes", async () => {
  await withHarness(async ({ page }) => {
    const invalidRestore = structuredClone(deck);
    invalidRestore.elements = null;
    const restore = await page.evaluate((scene) => window.__bdLoadScene(scene), invalidRestore);
    assert.deepEqual(restore, {
      state: "error",
      error: {
        reason: "Scene restore failed: elements must be an array",
        recovery: "Verify the serialized scene elements and rebuild the deck.",
      },
    });

    await page.evaluate(() => { window.__bdEditor.addFiles = () => { throw new Error("simulated file store failure"); }; });
    const file = await page.evaluate((scene) => window.__bdLoadScene(scene), deck);
    assert.equal(file.state, "error");
    assert.match(file.error.reason, /^File load failed: simulated file store failure$/);
    assert.equal(file.error.recovery, "Verify the embedded files and rebuild the deck.");
  });
});

test("scene loading exposes typed deadline, placeholder, stability, and fidelity failures", async () => {
  await withHarness(async ({ page }) => {
    for (const [index, mode] of ["deadline", "decode", "placeholder", "stability"].entries()) {
      const scene = structuredClone(deck);
      const modeFileId = `typed-failure-${mode}-${index}`;
      const modeImage = scene.elements.find((element) => element.id === "fidelity-image");
      const modeFile = scene.files["9993ed1d2781fdafd876038e6be0a1162d377be1"];
      modeImage.fileId = modeFileId;
      scene.files = { [modeFileId]: { ...modeFile, id: modeFileId } };
      await page.evaluate((failureMode) => { window.__bdTestImageFailure = failureMode; }, mode);
      const result = await page.evaluate((nextScene) => window.__bdLoadScene(nextScene), scene);
      assert.equal(result.state, "error");
      assert.match(result.error.reason, mode === "stability" ? /stable/i : new RegExp(mode, "i"));
      assert.match(result.error.recovery, /embedded data URL|rendered image|stabil/i);
      await page.evaluate(() => { delete window.__bdTestImageFailure; });
    }
    const clipped = structuredClone(deck);
    clipped.elements.find((element) => element.id === "fidelity-prose").x = 3000;
    const fidelity = await page.evaluate((scene) => window.__bdLoadScene(scene), clipped);
    assert.equal(fidelity.state, "error");
    assert.match(fidelity.error.reason, /fidelity/i);
    assert.match(fidelity.error.recovery, /geometry|bounds/i);
  });
});

test("delayed main-menu rendering receives its accessible name", async () => {
  await withHarness(async ({ page }) => {
    await page.waitForFunction(() => document.querySelector('[data-testid="main-menu-trigger"]')?.getAttribute("aria-label") === "Open main menu");
    assert.equal(await page.locator('[data-testid="main-menu-trigger"]').getAttribute("aria-label"), "Open main menu");
  }, { delayMainMenu: true });
});

test("boot failure promotes loading state to a truthful recovery alert", async () => {
  await withHarness(async ({ page, boot }) => {
    assert.equal(boot.ok, false);
    const alert = page.locator('[role="alert"]');
    assert.equal(await alert.isVisible(), true);
    assert.match(await alert.innerText(), /Editor boot failed.*Reload the harness/i);
  }, { allowBootFailure: true, failBoot: true });
});

test("repeated scene loads prune image observations and keep readiness scene-scoped", async () => {
  await withHarness(async ({ page }) => {
    const first = await page.evaluate((scene) => window.__bdLoadScene(scene), deck);
    assert.equal(first.state, "ready");
    assert.equal(await page.evaluate(() => window.__bdImageObservations.length), 0);

    const invalid = structuredClone(deck);
    invalid.files["9993ed1d2781fdafd876038e6be0a1162d377be1"].dataURL = "data:image/png;base64,invalid-scene-file";
    const failed = await page.evaluate((scene) => window.__bdLoadScene(scene), invalid);
    assert.equal(failed.state, "error");
    assert.equal(await page.evaluate(() => window.__bdImageObservations.length), 0);

    const secondScene = structuredClone(deck);
    const secondFileId = "second-scene-file-id";
    const secondImage = secondScene.elements.find((element) => element.id === "fidelity-image");
    const secondFile = secondScene.files["9993ed1d2781fdafd876038e6be0a1162d377be1"];
    secondImage.fileId = secondFileId;
    secondScene.files = { [secondFileId]: { ...secondFile, id: secondFileId } };
    const second = await page.evaluate((scene) => window.__bdLoadScene(scene), secondScene);
    assert.equal(second.state, "ready");
    assert.equal(await page.evaluate(() => window.__bdImageObservations.length), 0);
    assert.ok(second.imageReadiness[0].sceneId > first.imageReadiness[0].sceneId);
    assert.notEqual(second.imageReadiness[0].sceneId, first.imageReadiness[0].sceneId);
  });
});
