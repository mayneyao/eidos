import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

import { eidosFileUiSourceAliases } from "../eidos-file-ui/vite-source-aliases"

function stripEmbeddedChunkTrailingWhitespace(): Plugin {
  return {
    name: "strip-embedded-chunk-trailing-whitespace",
    enforce: "post",
    renderChunk(code) {
      return {
        code: code.replace(/[\t ]+$/gmu, ""),
        map: null,
      }
    },
  }
}

// The build output is embedded into the `eidos` CLI binary via qjs-host's
// rust-embed folder, so it must land inside apps/cli/qjs-host/ui and be
// committed (the same pattern as the bundled QuickJS runtime).
export default defineConfig({
  plugins: [tailwindcss(), react(), stripEmbeddedChunkTrailingWhitespace()],
  base: "./",
  resolve: {
    alias: eidosFileUiSourceAliases(),
  },
  build: {
    outDir: "../../apps/cli/qjs-host/ui",
    emptyOutDir: true,
    chunkSizeWarningLimit: 4096,
  },
  server: {
    // `vite dev` proxies the runtime bridge to a running `eidos serve`.
    proxy: {
      "/api": "http://127.0.0.1:8420",
    },
  },
})
