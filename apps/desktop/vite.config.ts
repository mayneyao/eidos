import fs from "fs/promises"
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, mergeConfig, type Plugin, type UserConfig } from "vite"
import electronRuntime from "vite-plugin-electron"
import { esmShim } from "vite-plugin-electron/plugin"
import electron from "vite-plugin-electron/simple"

import {
  sharedAlias,
  sharedConfig,
} from "../../packages/shared/vite/base.config"
import { createHtmlPlugin } from "../../packages/shared/vite/plugins"

import { desktopDevLaunchArgs } from "./dev-launch"

// import { visualizer } from "rollup-plugin-visualizer"

const externalNodeModules = [
  "better-sqlite3",
  "canvas",
  "oxc-parser",
  "oxc-transform",
  "rollup",
  "@vscode/ripgrep",
  "node-pty",
  "@eidos.space/bashkit",
]

// desktop do not need android and windows11
const copyPublicPlugin = (): Plugin => {
  return {
    name: "copy-public",
    closeBundle: async () => {
      const publicDir = path.resolve(__dirname, "../web-app/public")
      const distDir = path.resolve(__dirname, "dist")
      console.log("dir", publicDir, distDir)

      try {
        await fs.mkdir(distDir, { recursive: true })

        const copyDirRecursive = async (src: string, dest: string) => {
          const entries = await fs.readdir(src, { withFileTypes: true })

          for (const entry of entries) {
            const srcPath = path.join(src, entry.name)
            const destPath = path.join(dest, entry.name)

            if (entry.name === "android" || entry.name === "windows11") {
              continue
            }

            if (entry.isDirectory()) {
              await fs.mkdir(destPath, { recursive: true })
              await copyDirRecursive(srcPath, destPath)
            } else {
              await fs.copyFile(srcPath, destPath)
            }
          }
        }

        await copyDirRecursive(publicDir, distDir)
      } catch (err) {
        console.error("Error copying public files:", err)
      }
    },
  }
}

const desktopConfig: UserConfig = mergeConfig(sharedConfig, {
  plugins: [
    tailwindcss(),
    createHtmlPlugin("renderer/index.tsx"),
    copyPublicPlugin(),
    electron({
      main: {
        entry: [
          "electron/main.ts",
          "electron/modules/data-space/worker/worker.ts",
          "electron/modules/data-space/worker/sync-worker.ts",
          "electron/modules/space-versioning/graft-worker.ts",
          "electron/modules/space-management/base-csv-worker.ts",
          "electron/modules/space-management/base-query-worker.ts",
        ],
        onstart: async ({ startup }) => {
          await startup(desktopDevLaunchArgs())
        },
        vite: {
          assetsInclude: ["**/*.node"],
          resolve: {
            alias: sharedAlias,
          },
          define: {
            // Explicitly define process.env.NODE_ENV for electron main process
            // This ensures it's replaced at build time, not evaluated at runtime
            "process.env.NODE_ENV": JSON.stringify(
              process.env.NODE_ENV || "development"
            ),
          },
          build: {
            target: "node24",
            reportCompressedSize: false,
            rolldownOptions: {
              plugins: [esmShim() as unknown as Plugin],
              external: [...externalNodeModules, "electron"],
              output: {
                format: "esm",
              },
            },
            commonjsOptions: {
              // Handle dynamic requires for native modules
              ignoreDynamicRequires: true,
              transformMixedEsModules: true,
            },
          },
          optimizeDeps: {
            exclude: [...externalNodeModules],
          },
        },
      },
      preload: {
        input: "electron/preload.ts",
        vite: {
          assetsInclude: ["**/*.node"],
          resolve: {
            alias: sharedAlias,
          },
          build: {
            target: "chrome144",
            reportCompressedSize: false,
            rolldownOptions: {
              external: externalNodeModules,
              output: {
                format: "es",
                codeSplitting: false,
                entryFileNames: "[name].mjs",
                chunkFileNames: "[name].mjs",
                assetFileNames: "[name].[ext]",
              },
            },
            commonjsOptions: {
              ignoreDynamicRequires: true,
            },
          },
        },
      },
    }),
    electronRuntime({
      entry:
        "electron/modules/file-extensions/runtime/file-extension-runtime.preload.ts",
      onstart: ({ reload }) => reload(),
      vite: {
        resolve: {
          alias: sharedAlias,
        },
        build: {
          target: "chrome144",
          reportCompressedSize: false,
          // Disable vite-plugin-electron's inferred ESM library build. Vite
          // concatenates library format arrays during config merge, which
          // would otherwise emit ESM and CJS to the same filename. Sandboxed
          // Electron preloads require one deterministic CommonJS artifact.
          lib: false,
          rolldownOptions: {
            input:
              "electron/modules/file-extensions/runtime/file-extension-runtime.preload.ts",
            external: ["electron"],
            output: {
              format: "cjs",
              codeSplitting: false,
              entryFileNames: "file-extension-runtime-preload.cjs",
            },
          },
        },
      },
    }),
    // visualizer({
    //   gzipSize: true,
    //   brotliSize: true,
    //   emitFile: false,
    //   filename: "dev-pkg-vis.html",
    //   open: true,
    // }) as Plugin,
  ],
  build: {
    // Electron 40 embeds Chromium 144, so the renderer does not need Vite's
    // legacy browser transforms. This also keeps Wasm top-level await native.
    target: "chrome144",
    reportCompressedSize: false,
    rolldownOptions: {
      external: ["electron"],
    },
    copyPublicDir: false,
    assetsDir: "assets",
    assetsInclude: ["**/*"],
    outDir: "dist",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "csv-parse/sync": "csv-parse/sync",
      "csv-stringify/sync": "csv-stringify/sync",
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    proxy: {
      "/compiled-ui/": {
        target: "http://localhost:13127",
        changeOrigin: true,
      },
      "/api/agent": "http://localhost:13127",
      "/api/chat": "http://localhost:13127",
      "/api/permission-server-port": "http://localhost:13127",
      "/files/": {
        target: "http://localhost:13127",
        changeOrigin: false,
        rewrite: (path: string) => path,
      },
      "/@/": {
        target: "http://localhost:13127",
        changeOrigin: false,
        rewrite: (path: string) => path,
      },
      "/~/": {
        target: "http://localhost:13127",
        changeOrigin: false,
        rewrite: (path: string) => path,
      },
      "/static/": {
        target: "http://localhost:13127",
        changeOrigin: true,
      },
      "/extensions/": {
        target: "http://localhost:13127",
        changeOrigin: true,
      },
    },
  },
})

export default defineConfig(desktopConfig)
