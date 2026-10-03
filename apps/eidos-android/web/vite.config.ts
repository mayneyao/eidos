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
    alias: [...eidosFileUiSourceAliases(), ...markdownEditorSourceAliases()],
  },
  build: {
    outDir: "../app/build/editor-assets/editor",
    emptyOutDir: true,
    chunkSizeWarningLimit: 4096,
  },
})
