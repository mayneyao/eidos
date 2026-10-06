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
    outDir: "../build/editor",
    emptyOutDir: true,
    chunkSizeWarningLimit: 4096,
  },
})
