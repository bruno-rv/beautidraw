// Entry point for the vendored offline bundle.
//
// The plugin never imports Excalidraw from a CDN at render time — the previous
// skill's renderer is broken today because its esm.sh import 404s on a
// transitive dependency. Everything the harness needs is bundled from
// node_modules and its hash recorded in the runtime manifest.

import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw } from "@excalidraw/excalidraw";

export * from "@excalidraw/excalidraw";

const mountedRoots = new WeakMap();

// Mounting the real editor is what registers the scene fonts with the
// document and gives us an API handle whose scene Excalidraw itself maintains.
// Measuring before this resolves yields fallback font metrics.
export function mountEditor(container) {
  return new Promise((resolve) => {
    const root = createRoot(container);
    mountedRoots.set(container, root);
    root.render(
      createElement(Excalidraw, {
        excalidrawAPI: (api) => resolve(api),
        initialData: { appState: { viewBackgroundColor: "#ffffff" } },
      }),
    );
  });
}

// Excalidraw owns an image cache inside the mounted App instance. A scene
// retry can reuse a file id with corrected bytes, so replacing elements/files
// in place is insufficient: unmount the old App before mounting the next one.
export async function remountEditor(container) {
  mountedRoots.get(container)?.unmount();
  container.replaceChildren();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  return mountEditor(container);
}
