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
        "Build file-based workflows, extensions, and automations for Eidos.",
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
                autogenerate: { directory: "getting-started" },
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
                autogenerate: { directory: "concepts" },
              },
            ],
          },
          {
            label: {
              en: "Extensions",
              "zh-CN": "扩展",
            },
            icon: "puzzle",
            link: "/extensions/",
            items: [
              {
                label: "Extension development",
                autogenerate: { directory: "extensions" },
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
                autogenerate: { directory: "automation" },
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
                autogenerate: { directory: "reference" },
              },
            ],
          },
        ]),
      ],
    }),
    sitemap(),
  ],
})
