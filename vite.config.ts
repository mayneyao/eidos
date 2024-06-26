import fs from "fs"
import path from "path"
import react from "@vitejs/plugin-react"
import { visualizer } from "rollup-plugin-visualizer"
import { PluginOption, defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

const iconPath = path.resolve(__dirname, "icons.json")
const iconJson = JSON.parse(fs.readFileSync(iconPath, "utf-8"))

const config = defineConfig({
  // define: {
  //   global: {},
  // },
  plugins: [
    react(),
    VitePWA({
      srcDir: "app",
      filename: "sw.ts",
      strategies: "injectManifest",
      injectManifest: {
        // 7MB
        maximumFileSizeToCacheInBytes: 7 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm}"],
      },
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "mask-icon.svg"],
      manifest: {
        name: "Eidos",
        short_name: "Eidos",
        description:
          "An extensible framework for managing your personal data throughout your lifetime in one place",
        theme_color: "#ffffff",
        icons: iconJson.icons,
        display_override: ["window-controls-overlay"],
        display: "standalone",
        // display: "standalone",
        file_handlers: [
          // not ready yet
          // {
          //   action: "/editor/doc",
          //   accept: {
          //     "text/markdown": [".md", ".markdown"],
          //   },
          // },
        ],
      },
      registerType: "prompt",
      workbox: {
        // globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm}"],
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
    visualizer({
      gzipSize: true,
      brotliSize: true,
      emitFile: false,
      filename: "dev-pkg-vis.html",
      open: true,
    }) as unknown as PluginOption,
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm", "whisper-webgpu"],
  },
})

export default config
