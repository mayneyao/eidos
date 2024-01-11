import path from "path"
import react from "@vitejs/plugin-react"
import { visualizer } from "rollup-plugin-visualizer"
import { PluginOption, defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

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
        // 5MB
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm}"],
      },
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "mask-icon.svg"],
      manifest: {
        name: "Eidos",
        short_name: "Eidos",
        description: "an all-in-one workspace for everyone",
        theme_color: "#ffffff",
        icons: [
          {
            src: "512.png",
            sizes: "71x71 142x142 192x192 256x256 512x512",
            type: "image/png",
          },
        ],
        file_handlers: [
          {
            action: "/editor/doc",
            accept: {
              "text/markdown": [".md", ".markdown"],
            },
          },
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
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  //     inlineDynamicImports :true
  // build: {
  //   rollupOptions: {
  //     output: {
  //       manualChunks: {
  //         pdfjs: ["pdfjs-dist/build/pdf.js"],
  //         pdfjsWorker: ["pdfjs-dist/build/pdf.worker.js"],
  //       },
  //       inlineDynamicImports: true,
  //     },
  //   },
  // },
})

export default config
