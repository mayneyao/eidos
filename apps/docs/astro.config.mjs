// @ts-check

import sitemap from "@astrojs/sitemap"
import starlight from "@astrojs/starlight"
import { defineConfig } from "astro/config"
import starlightThemeFlexoki from "starlight-theme-flexoki"

// https://astro.build/config
export default defineConfig({
  site: "https://docs.eidos.space",
  integrations: [
    starlight({
      title: "Eidos Docs",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/mayneyao/eidos",
        },
      ],
      defaultLocale: "root", // optional
      locales: {
        root: {
          label: "English",
          lang: "en", // lang is required for root locales
        },
        // Simplified Chinese docs in `src/content/docs/zh-cn/`
        "zh-cn": {
          label: "简体中文",
          lang: "zh-CN",
        },
      },
      plugins: [starlightThemeFlexoki()],
      sidebar: [
        {
          label: "Concepts",
          autogenerate: { directory: "concepts" },
        },
        {
          label: "Nodes",
          autogenerate: { directory: "nodes" },
        },
        {
          label: "Extensions",
          autogenerate: { directory: "extensions" },
        },
        {
          label: "API Reference",
          autogenerate: { directory: "api-reference" },
        },
        {
          label: "Comparisons",
          autogenerate: { directory: "comparisons" },
        },
      ],
    }),
    sitemap(),
  ],
})
