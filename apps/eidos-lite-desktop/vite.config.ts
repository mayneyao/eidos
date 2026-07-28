import { fileURLToPath } from "node:url"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import electron from "vite-plugin-electron/simple"

const appRoot = path.dirname(fileURLToPath(import.meta.url))

const aliases = [
  {
    find: "@eidos.space/eidos-file-ui/plugins/gallery",
    replacement: path.resolve(
      appRoot,
      "../../packages/eidos-file-ui/src/plugins/gallery.tsx"
    ),
  },
  {
    find: "@eidos.space/eidos-file-ui/plugins/kanban",
    replacement: path.resolve(
      appRoot,
      "../../packages/eidos-file-ui/src/plugins/kanban.tsx"
    ),
  },
  {
    find: "@eidos.space/eidos-file/better-sqlite3",
    replacement: path.resolve(
      appRoot,
      "../../packages/eidos-file/src/better-sqlite3.ts"
    ),
  },
  {
    find: "@eidos.space/eidos-file-ui",
    replacement: path.resolve(
      appRoot,
      "../../packages/eidos-file-ui/src/index.ts"
    ),
  },
  {
    find: "@eidos.space/eidos-file",
    replacement: path.resolve(
      appRoot,
      "../../packages/eidos-file/src/index.ts"
    ),
  },
]

export default defineConfig(({ mode }) => {
  const defaultEnvironment =
    mode === "eidos-production" ? "production" : "staging"
  const environmentDefine = {
    __EIDOS_LITE_DEFAULT_ENVIRONMENT__: JSON.stringify(defaultEnvironment),
  }

  return {
    define: environmentDefine,
    plugins: [
      react(),
      tailwindcss(),
      electron({
        main: {
          entry: [
            "src/main/main.ts",
            "src/runtime/runtime-worker.ts",
            "src/runtime/graft-worker.ts",
          ],
          vite: {
            define: environmentDefine,
            resolve: { alias: aliases },
            build: {
              target: "node24",
              reportCompressedSize: false,
              rolldownOptions: {
                external: ["@eidos.space/graft", "better-sqlite3", "electron"],
                output: { format: "esm" },
              },
            },
          },
        },
        preload: {
          input: "src/preload/preload.ts",
          vite: {
            define: environmentDefine,
            resolve: { alias: aliases },
            build: {
              target: "chrome144",
              reportCompressedSize: false,
              rolldownOptions: {
                external: ["electron"],
                output: {
                  format: "cjs",
                  codeSplitting: false,
                  entryFileNames: "preload.js",
                },
              },
            },
          },
        },
      }),
    ],
    resolve: { alias: aliases },
    build: {
      target: "chrome144",
      reportCompressedSize: false,
      outDir: "dist",
      emptyOutDir: true,
    },
    server: {
      host: "127.0.0.1",
    },
  }
})
