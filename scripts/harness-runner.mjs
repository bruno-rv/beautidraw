// Shared plumbing for every spike probe: static server + a Chromium page with
// the harness loaded and fonts confirmed ready.

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

export async function serve(dir = ROOT) {
  const server = createServer(async (req, res) => {
    const rel = normalize(decodeURIComponent(req.url.split("?")[0])).replace(
      /^(\.\.[/\\])+/,
      "",
    );
    const file = join(dir, rel);
    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error("not a file");
    } catch {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}

// Launch flags are part of oracle_hash — keep them here, in one
// place, so the manifest can record exactly what was used.
export const LAUNCH_ARGS = ["--font-render-hinting=none", "--disable-lcd-text"];
export const DEVICE_SCALE_FACTOR = 1;
export const VIEWPORT = { width: 1600, height: 900 };

export async function withHarness(fn, { viewport = VIEWPORT } = {}) {
  const server = await serve();
  const browser = await chromium.launch({ args: LAUNCH_ARGS });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  try {
    await page.goto(`${server.origin}/scripts/harness.html`, {
      waitUntil: "domcontentloaded",
    });
    const ready = await page.evaluate(() => window.__bdReady);
    if (!ready.ok) throw new Error(`harness failed to boot: ${ready.error}`);
    return await fn({ page, browser, consoleErrors, origin: server.origin });
  } finally {
    await browser.close();
    await server.close();
  }
}

export function chromiumRevision() {
  return chromium.executablePath();
}
