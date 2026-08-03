// Entry point for the vendored offline bundle.
//
// The plugin never imports Excalidraw from a CDN at render time — the previous
// skill's renderer is broken today because its esm.sh import 404s on a
// transitive dependency. Everything the harness needs is bundled from
// node_modules and its hash recorded in the runtime manifest (PLAN.md §8).

import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw } from "@excalidraw/excalidraw";

export * from "@excalidraw/excalidraw";

// Mounting the real editor is what registers the scene fonts with the
// document and gives us an API handle whose scene Excalidraw itself maintains.
// Measuring before this resolves yields fallback font metrics (PLAN.md §11).
export function mountEditor(container) {
  return new Promise((resolve) => {
    createRoot(container).render(
      createElement(Excalidraw, {
        excalidrawAPI: (api) => resolve(api),
        initialData: { appState: { viewBackgroundColor: "#ffffff" } },
      }),
    );
  });
}
