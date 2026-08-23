import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
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

test("cleanup failure does not reject publication and returns an explicit residue warning", async () => {
  const root = await mkdtemp(join(tmpdir(), "beautidraw-staging-"));
  const outDir = join(root, "out");
  const stageDir = join(root, "stage");
  await mkdir(outDir);
  await mkdir(stageDir);
  await writeFile(join(outDir, "sentinel.txt"), "last good build");
  await writeFile(join(stageDir, "new.txt"), "new build");

  let cleanupAttempts = 0;
  const io = {
    rm: async (path, options) => {
      if (path.includes("-backup-")) {
        cleanupAttempts += 1;
        throw new Error("injected backup cleanup failure");
      }
      return (await import("node:fs/promises")).rm(path, options);
    },
  };

  const publication = await publishStagedOutput(stageDir, outDir, io);
  assert.equal(publication.output, resolve(outDir));
  assert.equal(publication.cleanupWarning?.path.includes("-backup-"), true);
  assert.equal(publication.cleanupWarning?.attempts, 3);
  assert.equal(cleanupAttempts, 3);
  assert.equal(await readFile(join(outDir, "new.txt"), "utf8"), "new build");
  assert.equal(await pathExists(join(outDir, "sentinel.txt")), false);
  const siblings = await (await import("node:fs/promises")).readdir(dirname(resolve(outDir)));
  assert.equal(siblings.some((name) => name.includes("backup-")), true);
});

test("publication rejects symlink aliases before touching the previous output", async () => {
  const root = await mkdtemp(join(tmpdir(), "beautidraw-staging-"));
  const outDir = join(root, "out");
  const stageTarget = join(root, "stage-target");
  const stageAlias = join(root, "stage-alias");
  await mkdir(outDir);
  await mkdir(stageTarget);
  await writeFile(join(outDir, "sentinel.txt"), "last good build");
  await symlink(stageTarget, stageAlias, "dir");

  await assert.rejects(() => publishStagedOutput(stageAlias, outDir), /symlink/);
  assert.equal(await readFile(join(outDir, "sentinel.txt"), "utf8"), "last good build");
  assert.equal(await pathExists(stageAlias), true);

  const outputTarget = join(root, "output-target");
  const outputAlias = join(root, "output-alias");
  const secondStage = join(root, "second-stage");
  await mkdir(outputTarget);
  await mkdir(secondStage);
  await writeFile(join(outputTarget, "sentinel.txt"), "last good output");
  await symlink(outputTarget, outputAlias, "dir");

  await assert.rejects(() => publishStagedOutput(secondStage, outputAlias), /symlink/);
  assert.equal(await readFile(join(outputTarget, "sentinel.txt"), "utf8"), "last good output");
});

test("publication rejects both nesting directions before touching existing output", async () => {
  const root = await mkdtemp(join(tmpdir(), "beautidraw-staging-"));
  const stageDir = join(root, "stage");
  const nestedOutput = join(stageDir, "out");
  await mkdir(nestedOutput, { recursive: true });
  await writeFile(join(nestedOutput, "sentinel.txt"), "nested output");

  await assert.rejects(() => publishStagedOutput(stageDir, nestedOutput), /nested|same real parent|distinct/);
  assert.equal(await readFile(join(nestedOutput, "sentinel.txt"), "utf8"), "nested output");

  const outputDir = join(root, "output");
  const nestedStage = join(outputDir, "stage");
  await mkdir(nestedStage, { recursive: true });
  await writeFile(join(outputDir, "sentinel.txt"), "outer output");

  await assert.rejects(() => publishStagedOutput(nestedStage, outputDir), /nested|same real parent|distinct/);
  assert.equal(await readFile(join(outputDir, "sentinel.txt"), "utf8"), "outer output");
});

test("publication preserves install failure while attaching restore and cleanup failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "beautidraw-staging-"));
  const outDir = join(root, "out");
  const stageDir = join(root, "stage");
  await mkdir(outDir);
  await mkdir(stageDir);
  await writeFile(join(outDir, "sentinel.txt"), "last good build");

  let renameCount = 0;
  const io = {
    rename: async (...args) => {
      renameCount += 1;
      if (renameCount === 2) throw new Error("install failure");
      if (renameCount === 3) throw new Error("restore failure");
      return (await import("node:fs/promises")).rename(...args);
    },
    rm: async (path, options) => {
      if (path === resolve(stageDir)) throw new Error("stage cleanup failure");
      return (await import("node:fs/promises")).rm(path, options);
    },
  };

  await assert.rejects(
    () => publishStagedOutput(stageDir, outDir, io),
    (error) => {
      assert.equal(error.message, "install failure");
      assert.equal(error.restoreError?.message, "restore failure");
      assert.equal(error.cleanupError?.message, "stage cleanup failure");
      assert.equal(error.backupPath.startsWith(resolve(root) + "/"), true);
      assert.equal(error.stagePath, resolve(stageDir));
      return true;
    },
  );
});
