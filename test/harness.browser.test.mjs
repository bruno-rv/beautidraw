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
      assert.equal(result.imageRegions[0].restoredHash, result.imageRegions[0].actualHash);
      assert.equal(result.imageRegions[0].distinctRestoredAnimationFrames, true);
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
      sceneId: 1,
      mountedSceneId: 1,
      attemptedSceneId: 1,
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
      sceneId: 1,
      mountedSceneId: null,
      attemptedSceneId: 1,
      error: {
        reason: "Scene restore failed: elements must be an array",
        recovery: "Verify the serialized scene elements and rebuild the deck.",
      },
    });

    await page.evaluate(() => { window.__bdTestFileFailure = "simulated file store failure"; });
    const file = await page.evaluate((scene) => window.__bdLoadScene(scene), deck);
    assert.equal(file.state, "error");
    assert.match(file.error.reason, /^File load failed: simulated file store failure$/);
    assert.equal(file.error.recovery, "Verify the embedded files and rebuild the deck.");
    assert.equal(file.mountedSceneId, file.attemptedSceneId);
    assert.equal(await page.evaluate(() => window.__bdMountedSceneId), file.attemptedSceneId);
    await page.evaluate(() => { delete window.__bdTestFileFailure; });
  });
});

test("scene loading exposes typed fidelity failures", async () => {
  await withHarness(async ({ page }) => {
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
    assert.equal(await page.locator("#bd-state").getAttribute("role"), "alert");
    assert.equal(await page.locator("#bd-state").getAttribute("aria-live"), null);
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

test("concurrent scenes keep their own image events, hashes, and cleanup", async () => {
  await withHarness(async ({ page }) => {
    const red = structuredClone(deck);
    const blue = structuredClone(deck);
    const redId = "concurrent-red-file";
    const blueId = "concurrent-blue-file";
    const imageData = deck.files["9993ed1d2781fdafd876038e6be0a1162d377be1"].dataURL;
    const blueData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/5ncLrgAAAABJRU5ErkJggg==";
    red.elements.find((element) => element.id === "fidelity-image").fileId = redId;
    red.files = { [redId]: { ...deck.files[Object.keys(deck.files)[0]], id: redId, dataURL: imageData } };
    blue.elements.find((element) => element.id === "fidelity-image").fileId = blueId;
    blue.elements.find((element) => element.id === "fidelity-image").customData.beautidrawImageName = "blue";
    blue.files = { [blueId]: { ...deck.files[Object.keys(deck.files)[0]], id: blueId, dataURL: blueData } };

    const concurrent = await page.evaluate(async ({ first, second }) => {
      const completion = [];
      const firstPromise = window.__bdLoadScene(first).then((result) => { completion.push(result.sceneId); return result; });
      const secondPromise = window.__bdLoadScene(second).then((result) => { completion.push(result.sceneId); return result; });
      return { results: await Promise.all([firstPromise, secondPromise]), completion };
    }, { first: red, second: blue });
    const [redResult, blueResult] = concurrent.results;
    assert.equal(redResult.state, "ready");
    assert.equal(blueResult.state, "ready");
    assert.notEqual(redResult.sceneId, blueResult.sceneId);
    assert.equal(redResult.imageReadiness[0].src, imageData);
    assert.equal(blueResult.imageReadiness[0].src, blueData);
    assert.equal(redResult.imageReadiness[0].sceneId, redResult.sceneId);
    assert.equal(blueResult.imageReadiness[0].sceneId, blueResult.sceneId);
    assert.equal(redResult.imageRegions[0].sceneId, redResult.sceneId);
    assert.equal(blueResult.imageRegions[0].sceneId, blueResult.sceneId);
    assert.notEqual(redResult.imageRegions[0].actualHash, blueResult.imageRegions[0].actualHash);
    assert.deepEqual(concurrent.completion, [redResult.sceneId, blueResult.sceneId]);
    assert.equal(await page.evaluate(() => window.__bdMountedSceneId), blueResult.sceneId);
    assert.deepEqual(await page.evaluate(() => window.__bdEditor.getSceneElements().filter((element) => element.type === "image").map((element) => element.customData?.beautidrawImageName)), ["blue"]);
    assert.equal(await page.evaluate(() => window.__bdImageObservations.length), 0);
  });
});

test("corrected same-file-id scene remounts the editor image cache", async () => {
  await withHarness(async ({ page }) => {
    const invalid = structuredClone(deck);
    const fileId = Object.keys(invalid.files)[0];
    invalid.files[fileId].dataURL = "data:image/png;base64,invalid-first-scene";
    const failed = await page.evaluate((scene) => window.__bdLoadScene(scene), invalid);
    assert.equal(failed.state, "error");

    const corrected = structuredClone(deck);
    const recovered = await page.evaluate((scene) => window.__bdLoadScene(scene), corrected);
    assert.equal(recovered.state, "ready");
    assert.equal(await page.locator("#bd-state").getAttribute("role"), "status");
    assert.equal(await page.locator("#bd-state").getAttribute("aria-live"), "polite");
    assert.equal(recovered.imageReadiness[0].src, corrected.files[fileId].dataURL);
    assert.equal(await page.evaluate((id) => window.__bdEditor.getFiles()[id]?.dataURL, fileId), corrected.files[fileId].dataURL);
    assert.equal(await page.evaluate(() => window.__bdMountedSceneId), recovered.sceneId);
  });
});

test("a subsequent load restores loading semantics and only the final scene controls the UI", async () => {
  await withHarness(async ({ page }) => {
    const first = await page.evaluate((scene) => window.__bdLoadScene(scene), deck);
    assert.equal(first.state, "ready");
    await page.evaluate(() => { window.__bdTestImageSeam = { holdEvents: true }; });
    const started = await page.evaluate((scene) => {
      window.__bdPendingLoad = window.__bdLoadScene(scene);
      const state = document.getElementById("bd-state");
      return { text: state.textContent, role: state.getAttribute("role"), live: state.getAttribute("aria-live") };
    }, deck);
    assert.match(started.text, /loading/i);
    assert.equal(started.role, "status");
    assert.equal(started.live, "polite");
    await page.evaluate(() => window.__bdReleaseImageEvents());
    const second = await page.evaluate(() => window.__bdPendingLoad);
    assert.equal(second.state, "ready");
    assert.equal(await page.evaluate(() => window.__bdMountedSceneId), second.sceneId);
    assert.match(await page.locator("#bd-state").getAttribute("data-state"), /ready/);
    await page.evaluate(() => { delete window.__bdTestImageSeam; });
  });
});

test("fidelity rejects converter-inflated, undersized, and shifted geometry", async () => {
  for (const viewport of [{ width: 1600, height: 900 }, { width: 1280, height: 800 }]) {
    await withHarness(async ({ page }) => {
      for (const mutate of [
        (scene) => { scene.elements.find((element) => element.id === "fidelity-prose").width += 20; },
        (scene) => { scene.elements.find((element) => element.id === "fidelity-prose").width -= 20; },
        (scene) => { scene.elements.find((element) => element.id === "fidelity-prose").x += 20; },
      ]) {
        const changed = structuredClone(deck);
        mutate(changed);
        const result = await page.evaluate((scene) => window.__bdLoadScene(scene), changed);
        assert.equal(result.state, "error");
        assert.match(result.error.reason, /fidelity|geometry/i);
      }
    }, { viewport });
  }
});

test("fidelity models mounted editor and frame-navigation chrome at both viewports", async () => {
  for (const viewport of [{ width: 1600, height: 900 }, { width: 1280, height: 800 }]) {
    await withHarness(async ({ page }) => {
      assert.equal((await page.evaluate((scene) => window.__bdLoadScene(scene), deck)).state, "ready");
      const changed = structuredClone(deck);
      const target = await page.evaluate(() => {
        const rect = document.getElementById("bd-frame-navigation").getBoundingClientRect();
        const scene = window.__bdApi.viewportCoordsToSceneCoords({ clientX: rect.x + 4, clientY: rect.y + 4 }, window.__bdEditor.getAppState());
        return scene;
      });
      const image = changed.elements.find((element) => element.id === "fidelity-image");
      image.x = target.x;
      image.y = target.y;
      image.width = 10;
      image.height = 10;
      const result = await page.evaluate((scene) => window.__bdLoadScene(scene), changed);
      assert.equal(result.state, "error");
      assert.match(result.error.reason, /fidelity/i);
      assert.match(await page.locator("#bd-state").innerText(), /fidelity-image/i);
    }, { viewport });
  }
});

test("mounted image pixels exercise real placeholder, stability, decode, and deadline paths", async () => {
  await withHarness(async ({ page }) => {
    for (const mode of ["placeholder", "stability", "decode", "deadline"]) {
      const scene = structuredClone(deck);
      await page.evaluate((failureMode) => { window.__bdTestImageSeam = { mode: failureMode }; }, mode);
      const result = await page.evaluate((nextScene) => window.__bdLoadScene(nextScene), scene);
      assert.equal(result.state, "error");
      assert.match(result.error.reason, mode === "stability" ? /stable/i : new RegExp(mode, "i"));
    }
    await page.evaluate(() => { delete window.__bdTestImageSeam; });
  });
});

test("fidelity rejects stale text, font, and measured-bound metadata with element IDs", async () => {
  await withHarness(async ({ page }) => {
    const mutations = [
      {
        id: "fidelity-prose",
        mutate: (scene) => {
          scene.elements.find((element) => element.id === "fidelity-prose").text += " stale text";
        },
      },
      {
        id: "fidelity-prose",
        mutate: (scene) => {
          scene.elements.find((element) => element.id === "fidelity-prose").fontFamily = 3;
        },
      },
      {
        id: "fidelity-mono",
        mutate: (scene) => {
          scene.elements.find((element) => element.id === "fidelity-mono").customData.beautidrawMeasuredBounds.width += 18;
        },
      },
    ];
    for (const { id, mutate } of mutations) {
      const changed = structuredClone(deck);
      mutate(changed);
      const result = await page.evaluate((scene) => window.__bdLoadScene(scene), changed);
      assert.equal(result.state, "error");
      assert.match(result.error.reason, new RegExp(id));
    }
  });
});

test("fidelity rejects a bound label that disagrees with its container label", async () => {
  await withHarness(async ({ page }) => {
    for (const mutate of [
      (element) => { element.text += " stale bound text"; },
      (element) => { element.originalText += " stale original text"; },
      (element) => { element.lineHeight += 0.5; },
    ]) {
      const changed = structuredClone(deck);
      mutate(changed.elements.find((element) => element.id === "fidelity-bound-label"));
      const result = await page.evaluate((scene) => window.__bdLoadScene(scene), changed);
      assert.equal(result.state, "error");
      assert.match(result.error.reason, /fidelity-bound(?:-label)?/i);

      const report = await page.evaluate(() => window.__bdReportFidelity(window.__bdEditor.getSceneElements(), {
        width: innerWidth,
        height: innerHeight,
      }));
      const geometryElementIds = report.find((frame) => frame.frameId === "fidelity-frame")?.geometryElementIds ?? [];
      assert.deepEqual(geometryElementIds, ["fidelity-bound", "fidelity-bound-label"]);
      assert.notEqual(await page.locator("#bd-state").getAttribute("data-state"), "ready");
    }
  });
});

test("legacy generic bound labels without duplicate labels retain line-height compatibility", async () => {
  await withHarness(async ({ page }) => {
    const changed = structuredClone(deck);
    delete changed.elements.find((element) => element.id === "fidelity-bound").label;
    changed.elements.find((element) => element.id === "fidelity-bound-label").lineHeight = 1.25;
    const result = await page.evaluate((scene) => window.__bdLoadScene(scene), changed);
    assert.equal(result.state, "ready");
  });
});

test("pre-remount restore and font failures preserve the mounted scene and expose the attempt", async () => {
  await withHarness(async ({ page }) => {
    const loaded = await page.evaluate((scene) => window.__bdLoadScene(scene), deck);
    assert.equal(loaded.state, "ready");
    const mountedText = await page.evaluate(() => window.__bdEditor.getSceneElements().find((element) => element.id === "fidelity-prose")?.text);

    const invalidRestore = structuredClone(deck);
    invalidRestore.elements = null;
    const restore = await page.evaluate((scene) => window.__bdLoadScene(scene), invalidRestore);
    assert.equal(restore.state, "error");
    assert.equal(restore.mountedSceneId, loaded.sceneId);
    assert.notEqual(restore.attemptedSceneId, loaded.sceneId);
    assert.equal(await page.evaluate(() => window.__bdMountedSceneId), loaded.sceneId);
    assert.equal(await page.evaluate(() => window.__bdEditor.getSceneElements().find((element) => element.id === "fidelity-prose")?.text), mountedText);

    await page.evaluate(() => {
      window.__bdOriginalFontCheck = document.fonts.check;
      document.fonts.check = () => false;
    });
    const font = await page.evaluate((scene) => window.__bdLoadScene(scene), deck);
    assert.equal(font.state, "error");
    assert.equal(font.mountedSceneId, loaded.sceneId);
    assert.notEqual(font.attemptedSceneId, loaded.sceneId);
    assert.equal(await page.evaluate(() => window.__bdMountedSceneId), loaded.sceneId);
    assert.equal(await page.evaluate(() => window.__bdEditor.getSceneElements().find((element) => element.id === "fidelity-prose")?.text), mountedText);
    await page.evaluate(() => { document.fonts.check = window.__bdOriginalFontCheck; });
  });
});

test("final restored remount is hash-verified for an arbitrary scene before ready", async () => {
  await withHarness(async ({ page }) => {
    const scene = structuredClone(deck);
    const image = scene.elements.find((element) => element.id === "fidelity-image");
    image.x = 180;
    image.y = 275;
    image.width = 260;
    image.height = 180;
    image.customData.beautidrawImageName = "arbitrary-red";
    await page.evaluate(() => { window.__bdTestImageSeam = { restoredHashMismatch: true }; });
    const result = await page.evaluate((nextScene) => window.__bdLoadScene(nextScene), scene);
    assert.equal(result.state, "error");
    assert.match(result.error.reason, /arbitrary-red|restored|hash/i);
    assert.match(result.error.recovery, /render|scene|image/i);
    assert.equal(await page.evaluate(() => window.__bdMountedSceneId), result.mountedSceneId);
    await page.evaluate(() => { delete window.__bdTestImageSeam; });
  });
});
