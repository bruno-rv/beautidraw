import { access, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, resolve } from "node:path";

const defaultIo = { access, mkdir, mkdtemp, rename, rm };
const BACKUP_CLEANUP_ATTEMPTS = 3;

async function exists(path, io) {
  try {
    await io.access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function siblingPath(target, kind) {
  return resolve(dirname(target), `.${basename(target)}-${kind}-${randomUUID()}`);
}

async function remove(path, io) {
  await io.rm(path, { recursive: true, force: true });
}

async function cleanupBackup(path, io) {
  let lastError;
  for (let attempt = 1; attempt <= BACKUP_CLEANUP_ATTEMPTS; attempt += 1) {
    try {
      await remove(path, io);
      return null;
    } catch (error) {
      lastError = error;
    }
  }
  return {
    path,
    attempts: BACKUP_CLEANUP_ATTEMPTS,
    reason: String(lastError?.message ?? lastError),
  };
}

export async function publishStagedOutput(stageDir, outDir, io = {}) {
  const fs = { ...defaultIo, ...io };
  const stage = resolve(stageDir);
  const output = resolve(outDir);
  if (stage === output) throw new Error("staged output must be a sibling of the published output");

  const backup = siblingPath(output, "backup");
  const hadOutput = await exists(output, fs);
  let movedOutput = false;
  try {
    if (hadOutput) {
      await fs.rename(output, backup);
      movedOutput = true;
    }
    await fs.rename(stage, output);
  } catch (error) {
    if (movedOutput) {
      try {
        await fs.rename(backup, output);
      } catch (restoreError) {
        error.restoreError = restoreError;
      }
    }
    await remove(stage, fs);
    throw error;
  }

  const cleanupWarning = movedOutput ? await cleanupBackup(backup, fs) : null;
  return { output, cleanupWarning };
}

export async function withStagedOutput(outDir, build, io = {}) {
  const fs = { ...defaultIo, ...io };
  const output = resolve(outDir);
  const parent = dirname(output);
  await fs.mkdir(parent, { recursive: true });
  const stage = await fs.mkdtemp(`${resolve(parent)}/.${basename(output)}-stage-`);
  try {
    const result = await build(stage);
    const publication = await publishStagedOutput(stage, output, fs);
    return { result, ...publication };
  } catch (error) {
    if (await exists(stage, fs)) await remove(stage, fs);
    throw error;
  }
}
