// @ts-check

import sitemap from "@astrojs/sitemap"
import starlight from "@astrojs/starlight"
import { defineConfig } from "astro/config"
import starlightSidebarTopics from "starlight-sidebar-topics"
import starlightThemeFlexoki from "starlight-theme-flexoki"

export default defineConfig({
  site: "https://docs.eidos.space",
  integrations: [
    starlight({
      title: "Eidos Developer Docs",
      description:
        "Build with Eidos File and understand the Eidos Lite platform.",
      favicon: "/favicon.svg",
      lastUpdated: true,
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/mayneyao/eidos",
        },
      ],
      defaultLocale: "root",
      locales: {
        root: {
          label: "English",
          lang: "en",
        },
        "zh-cn": {
          label: "简体中文",
          lang: "zh-CN",
        },
      },
      tableOfContents: {
        minHeadingLevel: 2,
        maxHeadingLevel: 4,
      },
      plugins: [
        starlightThemeFlexoki(),
        starlightSidebarTopics([
          {
            label: {
              en: "Start here",
              "zh-CN": "开始使用",
            },
            icon: "rocket",
            link: "/getting-started/",
            items: [
              {
                label: "Getting started",
                items: [{ autogenerate: { directory: "getting-started" } }],
              },
            ],
          },
          {
            label: {
              en: "Concepts",
              "zh-CN": "核心概念",
            },
            icon: "open-book",
            link: "/concepts/",
            items: [
              {
                label: "Core concepts",
                items: [{ autogenerate: { directory: "concepts" } }],
              },
            ],
          },
          {
            label: {
              en: "Automation",
              "zh-CN": "自动化",
            },
            icon: "random",
            link: "/automation/",
            items: [
              {
                label: "Automation and APIs",
                items: [{ autogenerate: { directory: "automation" } }],
              },
            ],
          },
          {
            label: {
              en: "Reference",
              "zh-CN": "参考",
            },
            icon: "setting",
            link: "/reference/",
            items: [
              {
                label: "Reference",
                items: [{ autogenerate: { directory: "reference" } }],
              },
            ],
          },
        ]),
      ],
    }),
    sitemap(),
  ],
})
