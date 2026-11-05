import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { eidosFileUiSourceAliases } from "../../../packages/eidos-file-ui/vite-source-aliases"
import { markdownEditorSourceAliases } from "../../../packages/markdown/vite-source-aliases"

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  plugins: [react(), tailwindcss()],
  css: {
    postcss: {
      plugins: [
        {
          postcssPlugin: "android-native-scrollbars",
          Rule(rule) {
            // Even an `all: revert` override leaves a matching scrollbar pseudo
            // element and opts WebView into non-fading, desktop-style painting.
            // Strip that styling only from Android's bundled editor/workbench.
            // Keep intentional hidden bars (for example the horizontal tabs).
            const hidesScrollbar = rule.nodes.some(
              (node) =>
                node.type === "decl" &&
                node.prop === "display" &&
                node.value === "none"
            )
            const selectors = rule.selectors.filter(
              (selector) =>
                !selector.includes("::-webkit-scrollbar") ||
                (hidesScrollbar && selector.endsWith("::-webkit-scrollbar"))
            )
            if (selectors.length === 0) rule.remove()
            else rule.selectors = selectors
          },
          Declaration(declaration) {
            if (
              declaration.prop === "scrollbar-color" ||
              (declaration.prop === "scrollbar-width" &&
                declaration.value !== "none")
            ) {
              declaration.remove()
            }
          },
        },
      ],
    },
  },
  resolve: {
    alias: [
      {
        find: /^\.\/browser-module$/,
        replacement: fileURLToPath(
          new URL(
            "../../../packages/mobile-plugin-host/src/browser-module.ts",
            import.meta.url
          )
        ),
      },
      {
        find: /^\.\/toolchain$/,
        replacement: fileURLToPath(
          new URL(
            "../../../packages/mobile-plugin-host/src/browser-toolchain.ts",
            import.meta.url
          )
        ),
      },
      ...eidosFileUiSourceAliases(),
      ...markdownEditorSourceAliases(),
    ],
  },
  build: {
    rollupOptions: {
      input: {
        editor: fileURLToPath(new URL("./index.html", import.meta.url)),
        plugins: fileURLToPath(new URL("./plugins.html", import.meta.url)),
      },
    },
    outDir: "../app/build/editor-assets/editor",
    emptyOutDir: true,
    chunkSizeWarningLimit: 4096,
  },
})
