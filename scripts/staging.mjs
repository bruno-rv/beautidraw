import { access, lstat, mkdir, mkdtemp, realpath, rename, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

const defaultIo = { access, lstat, mkdir, mkdtemp, realpath, rename, rm };
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

function containsPath(parent, child) {
  const remainder = relative(parent, child);
  return remainder === "" || (!remainder.startsWith("..") && !isAbsolute(remainder));
}

async function inspectPublicationPath(path, label, io, { allowMissing = false } = {}) {
  let info;
  try {
    info = await io.lstat(path);
  } catch (error) {
    if (!allowMissing || error?.code !== "ENOENT") throw error;
    const parent = await io.realpath(dirname(path));
    return { real: resolve(parent, basename(path)), parent: parent };
  }
  if (info.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (!info.isDirectory()) throw new Error(`${label} must be a directory`);
  return { real: await io.realpath(path), parent: await io.realpath(dirname(path)) };
}

async function validatePublicationPaths(stage, output, io) {
  const stageInfo = await inspectPublicationPath(stage, "stage directory", io);
  const outputInfo = await inspectPublicationPath(output, "published output", io, { allowMissing: true });
  if (containsPath(stageInfo.real, outputInfo.real) || containsPath(outputInfo.real, stageInfo.real)) {
    throw new Error("staged output and published output must not be nested or equal");
  }
  if (stageInfo.parent !== outputInfo.parent) {
    throw new Error("staged output and published output must have the same real parent");
  }
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
  await validatePublicationPaths(stage, output, fs);

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
    let restoreError;
    if (movedOutput) {
      try {
        await fs.rename(backup, output);
      } catch (error) {
        restoreError = error;
      }
    }
    let cleanupError;
    try {
      await remove(stage, fs);
    } catch (error) {
      cleanupError = error;
    }
    const primaryError = error instanceof Error ? error : new Error(String(error));
    primaryError.backupPath = backup;
    primaryError.stagePath = stage;
    if (restoreError) primaryError.restoreError = restoreError;
    if (cleanupError) primaryError.cleanupError = cleanupError;
    throw primaryError;
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
    let cleanupError;
    try {
      if (await exists(stage, fs)) await remove(stage, fs);
    } catch (error) {
      cleanupError = error;
    }
    if (cleanupError) {
      const primaryError = error instanceof Error ? error : new Error(String(error));
      primaryError.stagePath ??= stage;
      primaryError.cleanupError ??= cleanupError;
      throw primaryError;
    }
    throw error;
  }
}
