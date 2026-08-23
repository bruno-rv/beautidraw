import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

function containsPath(parent, child) {
  const remainder = relative(parent, child);
  return remainder === "" || (!remainder.startsWith("..") && !isAbsolute(remainder));
}

async function inspectDirectory(path, label, { allowMissing = false } = {}) {
  const absolute = resolve(path);
  let info;
  try {
    info = await lstat(absolute);
  } catch (error) {
    if (!allowMissing || error?.code !== "ENOENT") throw error;
    const parent = await realpath(dirname(absolute));
    return { absolute, real: resolve(parent, basename(absolute)) };
  }
  if (info.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (!info.isDirectory()) throw new Error(`${label} must be a directory`);
  return { absolute, real: await realpath(absolute) };
}

async function recursiveBytes(path) {
  const entries = await readdir(path, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) total += await recursiveBytes(child);
    else if (entry.isFile()) total += (await stat(child)).size;
  }
  return total;
}

export async function collectBuildReceipt(stageDir, {
  elapsedMs,
  publishedOutDir,
} = {}) {
  if (typeof publishedOutDir !== "string" || publishedOutDir.trim() === "") {
    throw new Error("publishedOutDir is required to collect a build receipt");
  }
  const stageInfo = await inspectDirectory(stageDir, "stage directory");
  const publishedInfo = await inspectDirectory(publishedOutDir, "published output", { allowMissing: true });
  if (containsPath(stageInfo.real, publishedInfo.real) || containsPath(publishedInfo.real, stageInfo.real)) {
    throw new Error("stage and published output paths must not overlap or be nested");
  }
  const stage = stageInfo.absolute;
  const published = publishedInfo.absolute;
  const deck = JSON.parse(await readFile(join(stage, "deck.excalidraw"), "utf8"));
  return {
    elapsedMs,
    frameCount: (deck.elements ?? []).filter((element) => element.type === "frame").length,
    embeddedAssetCount: Object.keys(deck.files ?? {}).length,
    totalBytes: await recursiveBytes(stage),
    paths: {
      deck: join(published, "deck.excalidraw"),
      scene: join(published, "scene.png"),
      diagnostics: join(published, "diagnostics.json"),
      manifest: join(published, "composition-manifest.json"),
      outline: join(published, "outline.md"),
    },
  };
}

export function formatBuildReceipt(receipt) {
  return [
    `elapsed: ${receipt.elapsedMs} ms`,
    `frames: ${receipt.frameCount}`,
    `embedded assets: ${receipt.embeddedAssetCount}`,
    `bytes: ${receipt.totalBytes}`,
    `deck: ${receipt.paths.deck}`,
    `scene: ${receipt.paths.scene}`,
    `diagnostics: ${receipt.paths.diagnostics}`,
    `manifest: ${receipt.paths.manifest}`,
    `outline: ${receipt.paths.outline}`,
  ].join("\n");
}
