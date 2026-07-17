import { rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "vite"
import { esmShim } from "vite-plugin-electron/plugin"

const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)
const outputRoot = path.join(
  desktopRoot,
  "dist-electron",
  "file-extension-app-smoke"
)

await rm(outputRoot, { recursive: true, force: true })

await build({
  root: desktopRoot,
  configFile: false,
  logLevel: "warn",
  build: {
    outDir: outputRoot,
    emptyOutDir: true,
    target: "node20",
    minify: false,
    rolldownOptions: {
      input: path.join(
        desktopRoot,
        "electron/modules/file-extensions/runtime/file-extension-runtime.preload.ts"
      ),
      external: ["electron"],
      output: {
        format: "cjs",
        codeSplitting: false,
        entryFileNames: "file-extension-runtime-preload.cjs",
      },
    },
  },
})

await build({
  root: desktopRoot,
  configFile: false,
  logLevel: "warn",
  build: {
    ssr: true,
    outDir: outputRoot,
    emptyOutDir: false,
    target: "node20",
    minify: false,
    rolldownOptions: {
      input: path.join(
        desktopRoot,
        "electron/modules/file-extensions/file-extension-app-smoke.ts"
      ),
      plugins: [esmShim()],
      external: (id) =>
        id === "electron" ||
        id.startsWith("node:") ||
        (!id.startsWith(".") && !path.isAbsolute(id)),
      output: {
        format: "esm",
        codeSplitting: false,
        entryFileNames: "file-extension-app-smoke.mjs",
      },
    },
  },
})
