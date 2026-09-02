// @ts-check

import sitemap from "@astrojs/sitemap"
import starlight from "@astrojs/starlight"
import { defineConfig } from "astro/config"
import starlightSidebarTopics from "starlight-sidebar-topics"
import starlightThemeFlexoki from "starlight-theme-flexoki"

export default defineConfig({
  site: "https://docs.eidos.space",
  build: {
    inlineStylesheets: "always",
  },
  integrations: [
    starlight({
      title: "Eidos Docs",
      description:
        "Documentation for Eidos Lite, Eidos CLI, building with Eidos File, and the Eidos File specifications.",
      expressiveCode: {
        emitExternalStylesheet: false,
      },
      favicon: "/favicon.svg",
      customCss: ["./src/styles/docs-home.css"],
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
                en: "Eidos Lite",
                "zh-CN": "Eidos Lite",
              },
              icon: "rocket",
              link: "/user-guide/",
              items: [
                {
                  label: "Install",
                  translations: { "zh-CN": "安装" },
                  items: [
                    "getting-started/eidos-lite",
                    "getting-started/browser",
                  ],
                },
                {
                  label: "Basics",
                  translations: { "zh-CN": "基础使用" },
                  items: [
                    "user-guide/eidos-file-basics",
                    "user-guide/tables-and-fields",
                    "user-guide/formula",
                    "user-guide/records-and-editing",
                    "user-guide/views-and-querying",
                    "user-guide/import-and-export",
                  ],
                },
                {
                  label: "Advanced",
                  translations: { "zh-CN": "进阶使用" },
                  items: [
                    "user-guide/data-safety",
                    "user-guide/history-and-recovery",
                    "user-guide/sync",
                    "user-guide/publishing",
                    "user-guide/troubleshooting",
                  ],
                },
              ],
            },
            {
              label: {
                en: "Eidos CLI",
                "zh-CN": "Eidos CLI",
              },
              icon: "random",
              link: "/cli/",
              items: [
                {
                  label: "Install",
                  translations: { "zh-CN": "安装" },
                  items: ["getting-started/cli"],
                },
                {
                  label: "Basics",
                  translations: { "zh-CN": "基础使用" },
                  items: ["cli"],
                },
                {
                  label: "Advanced",
                  translations: { "zh-CN": "进阶使用" },
                  items: [
                    "cli/automation-workflow",
                    "cli/serve",
                    "cli/publish",
                  ],
                },
              ],
            },
            {
              label: {
                en: "Build with Eidos File",
                "zh-CN": "基于 Eidos File 构建",
              },
              icon: "setting",
              link: "/developers/",
              items: [
                {
                  label: "Install",
                  translations: { "zh-CN": "安装" },
                  items: ["developers/runtime-quickstart"],
                },
                {
                  label: "Basics",
                  translations: { "zh-CN": "基础使用" },
                  items: ["concepts", "developers/runtime-and-hosts"],
                },
                {
                  label: "Advanced",
                  translations: { "zh-CN": "进阶使用" },
                  items: [
                    "reference/eidos-file-ui-package",
                    "reference/eidos-file-custom-views",
                    "reference",
                  ],
                },
              ],
            },
            {
              label: {
                en: "Eidos File Specs",
                "zh-CN": "Eidos File 规范",
              },
              icon: "document",
              link: "/specifications/",
              items: [
                {
                  label: "Start reading",
                  translations: { "zh-CN": "开始阅读" },
                  items: ["specifications"],
                },
                {
                  label: "Core specifications",
                  translations: { "zh-CN": "核心规范" },
                  items: [
                    "specifications/file-format-1-0",
                    "specifications/runtime-1-0",
                  ],
                },
                {
                  label: "Integration specifications",
                  translations: { "zh-CN": "集成规范" },
                  items: [
                    "specifications/adapter-1-0",
                    "specifications/ui-1-0",
                  ],
                },
                {
                  label: "Advanced specifications",
                  translations: { "zh-CN": "扩展规范" },
                  items: [
                    "specifications/system-metadata-merge-1-0",
                    "specifications/standard-views-1-0",
                    "specifications/eidos-flavored-markdown-1-0",
                  ],
                },
              ],
            },
          ],
          {
            exclude: [
              "/",
              "/zh-cn/",
              "/getting-started",
              "/zh-cn/getting-started",
              "/legacy",
              "/zh-cn/legacy",
            ],
          }
        ),
      ],
    }),
    sitemap(),
  ],
})
