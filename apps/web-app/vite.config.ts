import type { UserConfig } from "vite"
import { defineConfig, mergeConfig } from "vite"
import tailwindcss from "@tailwindcss/vite"
import { VitePWA } from "vite-plugin-pwa"
import { sharedConfig } from "../../packages/shared/vite/base.config"
import { createHtmlPlugin } from "../../packages/shared/vite/plugins"
import iconJson from "./icons.json"

const webAppConfig: UserConfig = mergeConfig(sharedConfig, {
  plugins: [
    tailwindcss(),
    createHtmlPlugin("/pages/index.tsx"),
    VitePWA({
      srcDir: ".",
      filename: "sw.ts",
      strategies: "injectManifest",
      injectManifest: {
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
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
      },
      registerType: "prompt",
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
  resolve: {
    alias: {
      "csv-parse/sync": "csv-parse/browser/esm",
      "csv-stringify/sync": "csv-stringify/browser/esm",
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
})

export default defineConfig(webAppConfig)
