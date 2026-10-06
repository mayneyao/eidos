import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

import { eidosFileUiSourceAliases } from "../eidos-file-ui/vite-source-aliases"
import { markdownEditorSourceAliases } from "../markdown/vite-source-aliases"

const runtimeTarget = process.env.EIDOS_SERVE_TARGET ?? "http://127.0.0.1:8420"

function stripEmbeddedChunkTrailingWhitespace(): Plugin {
  const strip = (code: string) => code.replace(/[\t ]+$/gmu, "")
  return {
    name: "strip-embedded-chunk-trailing-whitespace",
    enforce: "post",
    renderChunk(code) {
      return {
        code: strip(code),
        map: null,
      }
    },
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type === "chunk") output.code = strip(output.code)
      }
    },
  }
}

// Commit the generated UI beside its source; the Rust Runtime host embeds it.
export default defineConfig({
  plugins: [tailwindcss(), react(), stripEmbeddedChunkTrailingWhitespace()],
  base: "./",
  resolve: {
    alias: [
      {
        find: /^@eidos\.space\/eidos-file$/u,
        replacement: fileURLToPath(
          new URL("../eidos-file/src/index.ts", import.meta.url)
        ),
      },
      ...eidosFileUiSourceAliases(),
      ...markdownEditorSourceAliases(),
    ],
  },
  build: {
    outDir: "generated/ui",
    emptyOutDir: true,
    chunkSizeWarningLimit: 4096,
  },
  server: {
    // `vite dev` proxies the runtime bridge to a running `eidos serve`.
    proxy: {
      "/api": {
        target: runtimeTarget,
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (request) => {
            if (request.getHeader("origin"))
              request.setHeader("origin", new URL(runtimeTarget).origin)
          })
        },
      },
    },
  },
})
import { fileURLToPath } from "node:url"
