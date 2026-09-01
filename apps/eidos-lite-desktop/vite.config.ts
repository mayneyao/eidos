import path from "node:path"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import electron from "vite-plugin-electron/simple"

import { eidosFileUiSourceAliases } from "../../packages/eidos-file-ui/vite-source-aliases"
import { markdownEditorSourceAliases } from "../../packages/markdown-editor/vite-source-aliases"

import {
  EIDOS_LITE_SERVICE_ENVIRONMENTS,
  type EidosLiteEnvironmentName,
} from "./src/shared/service-environment"
import { cleanElectronOutput } from "./src/main/electron-output-cleaner"

const appRoot = path.dirname(fileURLToPath(import.meta.url))

function buildEnvironmentManifest(
  environment: EidosLiteEnvironmentName
): Plugin {
  return {
    name: "eidos-lite-build-environment-manifest",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "eidos-lite-build-environment.json",
        source: `${JSON.stringify(
          EIDOS_LITE_SERVICE_ENVIRONMENTS[environment],
          null,
          2
        )}\n`,
      })
    },
  }
}

const aliases = [
  ...eidosFileUiSourceAliases(),
  ...markdownEditorSourceAliases(),
  {
    find: "@eidos.space/eidos-file/node-sqlite",
    replacement: path.resolve(
      appRoot,
      "../../packages/eidos-file/src/node-sqlite.ts"
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
  const defaultEnvironment: EidosLiteEnvironmentName =
    mode === "eidos-production" || mode === "eidos-release"
      ? "production"
      : "staging"
  const environmentDefine = {
    __EIDOS_LITE_DEFAULT_ENVIRONMENT__: JSON.stringify(defaultEnvironment),
    __EIDOS_LITE_UPDATES_ENABLED__: JSON.stringify(mode === "eidos-release"),
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
            plugins: [
              cleanElectronOutput(path.join(appRoot, "dist-electron")),
              buildEnvironmentManifest(defaultEnvironment),
            ],
            resolve: { alias: aliases },
            build: {
              target: "node24",
              reportCompressedSize: false,
              rolldownOptions: {
                external: [
                  "@eidos.space/graft",
                  "electron",
                  "node-pty",
                  "node:sqlite",
                ],
                output: {
                  format: "esm",
                  chunkFileNames: (chunk) =>
                    chunk.name === "main"
                      ? "updater-[hash].js"
                      : "[name]-[hash].js",
                },
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
              target: "chrome150",
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
      target: "chrome150",
      reportCompressedSize: false,
      outDir: "dist",
      emptyOutDir: true,
    },
    server: {
      host: "127.0.0.1",
      port: 5179,
      strictPort: true,
    },
  }
})
