// @ts-check

import sitemap from "@astrojs/sitemap"
import starlight from "@astrojs/starlight"
import { defineConfig } from "astro/config"
import starlightSidebarTopics from "starlight-sidebar-topics"
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
      plugins: [
        starlightThemeFlexoki(),
        starlightSidebarTopics([
          {
            label: {
              en: "Documentation",
              "zh-CN": "文档",
            },
            icon: "open-book",
            link: "/concepts/what-is-eidos/",
            items: [
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
                label: "Services",
                autogenerate: { directory: "services" },
              },
              {
                label: "Comparisons",
                autogenerate: { directory: "comparisons" },
              },
            ],
          },
          {
            label: {
              en: "Guides",
              "zh-CN": "指南",
            },
            icon: "rocket",
            link: "/how-to/",
            items: [
              {
                label: "How-to",
                autogenerate: { directory: "how-to" },
              },
            ],
          },
          {
            label: {
              en: "API Reference",
              "zh-CN": "API 参考",
            },
            icon: "setting",
            link: "/api-reference/space/",
            items: [
              {
                label: "API Reference",
                autogenerate: { directory: "api-reference" },
              },
            ],
          },
        ]),
      ],
    }),
    sitemap(),
  ],
})
