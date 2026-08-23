import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

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
  const stage = resolve(stageDir);
  const published = resolve(publishedOutDir);
  if (published === stage) {
    throw new Error("publishedOutDir must differ from stageDir");
  }
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
