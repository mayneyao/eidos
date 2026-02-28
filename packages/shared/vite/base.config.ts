import react from "@vitejs/plugin-react"
import path from "path"
import type { UserConfig } from "vite"
import topLevelAwait from "vite-plugin-top-level-await"
import wasm from "vite-plugin-wasm"

// enable visualizer if you want to see the size of the package
// import { visualizer } from "rollup-plugin-visualizer"

export const sharedAlias = {
  "@/locales": path.resolve(__dirname, "../../../packages/locales"),
  "@/worker": path.resolve(__dirname, "../../../packages/worker"),
  "@/lib": path.resolve(__dirname, "../../../packages/lib"),
  "@/components": path.resolve(__dirname, "../../../apps/web-app/components"),
  "@/hooks": path.resolve(__dirname, "../../../apps/web-app/hooks"),
  "@/styles": path.resolve(__dirname, "../../../apps/web-app/styles"),
  "@": path.resolve(__dirname, "../../../"),
}

export const sharedConfig: UserConfig = {
  base: "/",
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
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
    exclude: [
      "@sqlite.org/sqlite-wasm",
      "whisper-webgpu",
      "pyodide",
      "@huacnlee/autocorrect",
    ],
  },
  worker: {
    format: "es",
    plugins: () => [wasm(), topLevelAwait()],
  },
}
