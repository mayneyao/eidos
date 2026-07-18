import path from "node:path"
import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const directory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: true,
    outDir: path.resolve(directory, "node_modules/.cache/eidos-file-docs-ssr"),
    ssr: path.resolve(directory, "src/docs/prerender-entry.tsx"),
    target: "node20",
    rollupOptions: {
      output: {
        entryFileNames: "prerender.mjs",
      },
    },
  },
})
