import react from "@vitejs/plugin-react"
import child_process from "child_process"
import path from "path"
import type { Plugin, UserConfig } from "vite"
import topLevelAwait from "vite-plugin-top-level-await"
import wasm from "vite-plugin-wasm"

let commitHash: string = ""
const useNativeTopLevelAwait = process.env.EIDOS_SERVICE_MODE === "desktop"
try {
  commitHash = child_process
    .execSync("git rev-parse --short HEAD")
    .toString()
    .trim()
} catch (e) {
  console.error("Failed to get git commit hash", e)
}

// enable visualizer if you want to see the size of the package
// import { visualizer } from "rollup-plugin-visualizer"

// Helper to create alias entries for workspace packages
const workspacePackage = (
  name: string,
  subpath: string = "src/index.ts"
): { find: RegExp; replacement: string } => ({
  find: new RegExp(`^${name}$`),
  replacement: path.resolve(
    __dirname,
    `../../../packages/${name.replace("@eidos.space/", "")}/${subpath}`
  ),
})

const workspacePackageWildcard = (
  name: string,
  subpath: string = "src"
): { find: RegExp; replacement: string } => ({
  find: new RegExp(`^${name}/(.+)$`),
  replacement: path.resolve(
    __dirname,
    `../../../packages/${name.replace("@eidos.space/", "")}/${subpath}/$1`
  ),
})

export const prismComponentInteropPlugin = (): Plugin => ({
  name: "prism-component-interop",
  enforce: "pre",
  transform(code, id) {
    const cleanId = id.split("?", 1)[0]
    const isPrismLanguageComponent =
      /[/\\]prismjs[/\\]components[/\\]prism-[^/\\]+\.js$/.test(cleanId) &&
      !cleanId.endsWith("prism-core.js")
    const alreadyImportsPrism =
      /(?:^|\n)\s*import\s+Prism\s+from\s+["']prismjs["']/.test(code)

    if (!isPrismLanguageComponent || alreadyImportsPrism) {
      return null
    }

    // Prism language files are global scripts and assume Prism has already
    // executed. Rolldown can otherwise place them beside a lazy CommonJS
    // wrapper for prismjs and evaluate the languages first.
    return {
      code: `import Prism from "prismjs"\n${code}`,
      map: null,
    }
  },
})

// Export as array for Vite (order matters - specific paths before wildcards)
export const sharedAlias = [
  // Local workspace packages - exact matches (higher priority)
  workspacePackage("@eidos.space/core", "index.ts"),
  workspacePackage("@eidos.space/eidos-file"),
  workspacePackage("@eidos.space/eidos-file-ui"),
  workspacePackage("@eidos.space/electron-ipc"),
  workspacePackage("@eidos.space/extension-manifest"),
  workspacePackage("@eidos.space/extension-runtime"),
  workspacePackage("@eidos.space/extension-sdk"),
  workspacePackage("@eidos.space/extension-state"),
  workspacePackage("@eidos.space/file-space"),
  workspacePackage("@eidos.space/graft-client"),
  workspacePackage("@eidos.space/legacy-space-migration"),
  workspacePackage("@eidos.space/markdown-editor"),
  workspacePackage("@eidos.space/react"),
  workspacePackage("@eidos.space/v3"),
  workspacePackage("@eidos.space/client"),
  workspacePackage("@eidos.space/proxy"),
  workspacePackage("@eidos.space/space-manager"),
  workspacePackage("@eidos.space/ext-server"),
  workspacePackage("@eidos.space/rawdata"),

  // ext-server subpath exports (must come before wildcard)
  {
    find: /^@eidos\.space\/ext-server\/desktop$/,
    replacement: path.resolve(
      __dirname,
      "../../../packages/ext-server/src/desktop.ts"
    ),
  },
  {
    find: /^@eidos\.space\/ext-server\/eidos$/,
    replacement: path.resolve(
      __dirname,
      "../../../packages/ext-server/src/eidos.ts"
    ),
  },

  // Wildcard matches (lower priority)
  workspacePackageWildcard("@eidos.space/core"),
  workspacePackageWildcard("@eidos.space/eidos-file"),
  workspacePackageWildcard("@eidos.space/eidos-file-ui"),
  workspacePackageWildcard("@eidos.space/electron-ipc"),
  workspacePackageWildcard("@eidos.space/extension-manifest"),
  workspacePackageWildcard("@eidos.space/extension-runtime"),
  workspacePackageWildcard("@eidos.space/extension-sdk"),
  workspacePackageWildcard("@eidos.space/extension-state"),
  workspacePackageWildcard("@eidos.space/file-space"),
  workspacePackageWildcard("@eidos.space/graft-client"),
  workspacePackageWildcard("@eidos.space/legacy-space-migration"),
  workspacePackageWildcard("@eidos.space/markdown-editor"),
  workspacePackageWildcard("@eidos.space/react"),
  workspacePackageWildcard("@eidos.space/v3"),
  workspacePackageWildcard("@eidos.space/client"),
  workspacePackageWildcard("@eidos.space/proxy"),
  workspacePackageWildcard("@eidos.space/space-manager"),
  workspacePackageWildcard("@eidos.space/rawdata"),

  // Regular project aliases
  {
    find: "@/locales",
    replacement: path.resolve(__dirname, "../../../packages/locales"),
  },
  {
    find: "@/worker",
    replacement: path.resolve(__dirname, "../../../packages/worker"),
  },
  {
    find: "@/lib",
    replacement: path.resolve(__dirname, "../../../packages/lib"),
  },
  {
    find: "@/components",
    replacement: path.resolve(__dirname, "../../../apps/web-app/components"),
  },
  {
    find: "@/hooks",
    replacement: path.resolve(__dirname, "../../../apps/web-app/hooks"),
  },
  {
    find: "@/styles",
    replacement: path.resolve(__dirname, "../../../apps/web-app/styles"),
  },
  { find: "@", replacement: path.resolve(__dirname, "../../../") },
]

export const sharedConfig: UserConfig = {
  base: "/",
  define: {
    "import.meta.env.VITE_COMMIT_HASH": JSON.stringify(commitHash),
  },
  plugins: [
    prismComponentInteropPlugin(),
    react(),
    wasm(),
    !useNativeTopLevelAwait && topLevelAwait(),
    // enable visualizer if you want to see the size of the package
    // visualizer({
    //   gzipSize: true,
    //   brotliSize: true,
    //   emitFile: false,
    //   filename: "dev-pkg-vis.html",
    //   open: true,
    // }) as Plugin,
  ],
  resolve: {
    alias: sharedAlias,
  },
  optimizeDeps: {
    include: [
      // Fix "Prism is not defined" error in dev mode
      // https://github.com/vitejs/vite/issues/21948
      // Ensure prismjs loads before @lexical/code by pre-bundling them together
      "prismjs",
      "@lexical/code",
    ],
    exclude: [
      "@sqlite.org/sqlite-wasm",
      "whisper-webgpu",
      "pyodide",
      "@huacnlee/autocorrect",
    ],
  },
  worker: {
    format: "es",
    plugins: () => [wasm(), !useNativeTopLevelAwait && topLevelAwait()],
  },
}
