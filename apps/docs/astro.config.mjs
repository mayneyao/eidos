// @ts-check

import sitemap from "@astrojs/sitemap"
import starlight from "@astrojs/starlight"
import { defineConfig } from "astro/config"
import starlightSidebarTopics from "starlight-sidebar-topics"
import starlightThemeFlexoki from "starlight-theme-flexoki"

import { legacyRedirects } from "./src/lib/legacy-redirects.mjs"

export default defineConfig({
  site: "https://docs.eidos.space",
  redirects: legacyRedirects,
  integrations: [
    starlight({
      title: "Eidos Docs",
      description:
        "Documentation for Eidos Lite, Eidos File Web, the CLI, and the Eidos File format.",
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
        starlightSidebarTopics(
          [
            {
              label: {
                en: "Start here",
                "zh-CN": "开始使用",
              },
              icon: "rocket",
              link: "/getting-started/",
              items: [
                { autogenerate: { directory: "getting-started" } },
                { autogenerate: { directory: "concepts" } },
              ],
            },
            {
              label: {
                en: "Use Eidos",
                "zh-CN": "使用 Eidos",
              },
              icon: "open-book",
              link: "/user-guide/",
              items: [{ autogenerate: { directory: "user-guide" } }],
            },
            {
              label: {
                en: "CLI & automation",
                "zh-CN": "CLI 与自动化",
              },
              icon: "random",
              link: "/cli/",
              items: [{ autogenerate: { directory: "cli" } }],
            },
            {
              label: {
                en: "Build with Eidos",
                "zh-CN": "使用 Eidos 构建",
              },
              icon: "setting",
              link: "/developers/",
              items: [
                { autogenerate: { directory: "developers" } },
                { autogenerate: { directory: "reference" } },
              ],
            },
            {
              label: {
                en: "Specifications",
                "zh-CN": "规范",
              },
              icon: "document",
              link: "/specifications/",
              items: [{ autogenerate: { directory: "specifications" } }],
            },
          ],
          {
            exclude: ["/legacy", "/zh-cn/legacy"],
          }
        ),
      ],
    }),
    sitemap(),
  ],
})
