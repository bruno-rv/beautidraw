import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

import { publishStagedOutput, withStagedOutput } from "../scripts/staging.mjs";

const pathExists = async (path) => {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

test("failed build preserves the previous output and removes its stage", async () => {
  const root = await mkdtemp(join(tmpdir(), "beautidraw-staging-"));
  const outDir = join(root, "out");
  await mkdir(outDir);
  await writeFile(join(outDir, "sentinel.txt"), "last good build");

  await assert.rejects(() => withStagedOutput(outDir, async (stageDir) => {
    await writeFile(join(stageDir, "partial.txt"), "partial");
    throw new Error("composition failed");
  }), /composition failed/);

  assert.equal(await readFile(join(outDir, "sentinel.txt"), "utf8"), "last good build");
  assert.equal(await pathExists(join(outDir, "partial.txt")), false);
  const siblings = await (await import("node:fs/promises")).readdir(dirname(resolve(outDir)));
  assert.equal(siblings.some((name) => name.includes("stage-")), false);
});

test("successful build publishes the complete stage and removes the stage", async () => {
  const root = await mkdtemp(join(tmpdir(), "beautidraw-staging-"));
  const outDir = join(root, "out");
  await withStagedOutput(outDir, async (stageDir) => {
    await writeFile(join(stageDir, "deck.excalidraw"), "new build");
    return "build result";
  });

  assert.equal(await readFile(join(outDir, "deck.excalidraw"), "utf8"), "new build");
  const siblings = await (await import("node:fs/promises")).readdir(dirname(resolve(outDir)));
  assert.equal(siblings.some((name) => name.includes("stage-") || name.includes("backup-")), false);
});

test("publication failure restores the backup and removes the stage", async () => {
  const root = await mkdtemp(join(tmpdir(), "beautidraw-staging-"));
  const outDir = join(root, "out");
  const stageDir = join(root, "stage");
  await mkdir(outDir);
  await mkdir(stageDir);
  await writeFile(join(outDir, "sentinel.txt"), "last good build");
  await writeFile(join(stageDir, "partial.txt"), "partial");

  let renameCount = 0;
  const io = {
    rename: async (...args) => {
      renameCount += 1;
      if (renameCount === 2) throw new Error("injected publication failure");
      return (await import("node:fs/promises")).rename(...args);
    },
  };

  await assert.rejects(() => publishStagedOutput(stageDir, outDir, io), /injected publication failure/);
  assert.equal(await readFile(join(outDir, "sentinel.txt"), "utf8"), "last good build");
  assert.equal(await pathExists(join(outDir, "partial.txt")), false);
  assert.equal(await pathExists(stageDir), false);
  const siblings = await (await import("node:fs/promises")).readdir(dirname(resolve(outDir)));
  assert.equal(siblings.some((name) => name.includes("backup-")), false);
});
