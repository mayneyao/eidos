import { defineConfig } from "tsdown"

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/base-data-grid.tsx",
    "src/base-editor-view.tsx",
    "src/base-gallery-view.tsx",
    "src/base-kanban-view.tsx",
    "src/base-record-card.tsx",
    "src/base-record-card-layout.ts",
    "src/base-record-delete-dialog.tsx",
    "src/base-row-window.ts",
    "src/base-virtual-scroll.ts",
    "src/base-error-message.ts",
    "src/use-base-record-inspector-row.ts",
    "src/ui/alert-dialog.tsx",
    "src/ui/dropdown-menu.tsx",
    "src/ui/kanban.tsx",
    "src/base-editor-chrome.tsx",
    "src/base-query-toolbar.tsx",
    "src/context.tsx",
  ],
  format: "esm",
  dts: true,
  sourcemap: true,
  clean: true,
  deps: {
    neverBundle: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "@eidos.space/base",
      "@glideapps/glide-data-grid",
      "@tanstack/react-virtual",
    ],
  },
})
