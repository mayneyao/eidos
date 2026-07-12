import fs from "fs/promises"
import path from "path"
import esmShim from "@rollup/plugin-esm-shim"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, mergeConfig, type Plugin, type UserConfig } from "vite"
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
        ],
        onstart: async ({ startup }) => {
          await startup(desktopDevLaunchArgs())
        },
        vite: {
          assetsInclude: ["**/*.node"],
          resolve: {
            alias: sharedAlias,
          },
          esbuild: {
            // Support for TypeScript decorators used by inversify
            target: "es2022",
          },
          define: {
            // Explicitly define process.env.NODE_ENV for electron main process
            // This ensures it's replaced at build time, not evaluated at runtime
            "process.env.NODE_ENV": JSON.stringify(
              process.env.NODE_ENV || "development"
            ),
          },
          build: {
            rollupOptions: {
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
            rollupOptions: {
              external: externalNodeModules,
              output: {
                format: "es",
                inlineDynamicImports: true,
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
    // visualizer({
    //   gzipSize: true,
    //   brotliSize: true,
    //   emitFile: false,
    //   filename: "dev-pkg-vis.html",
    //   open: true,
    // }) as Plugin,
  ],
  build: {
    rollupOptions: {
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
