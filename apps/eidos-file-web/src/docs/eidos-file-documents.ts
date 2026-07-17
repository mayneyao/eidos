import formatEn from "./content/format.en.md?raw"
import formatZh from "./content/format.zh.md?raw"
import overviewEn from "./content/overview.en.md?raw"
import overviewZh from "./content/overview.zh.md?raw"
import pluginsEn from "./content/plugins.en.md?raw"
import pluginsZh from "./content/plugins.zh.md?raw"
import runtimeEn from "./content/runtime.en.md?raw"
import runtimeZh from "./content/runtime.zh.md?raw"
import viewsEn from "./content/views.en.md?raw"
import viewsZh from "./content/views.zh.md?raw"

import type { Locale } from "../i18n"

export interface EidosFileDocument {
  slug: string
  edition: Record<Locale, string>
  title: Record<Locale, string>
  summary: Record<Locale, string>
  markdown: Record<Locale, string>
}

export const EIDOS_FILE_DOCUMENTS: EidosFileDocument[] = [
  {
    slug: "overview",
    edition: { en: "Start here", zh: "从这里开始" },
    title: {
      en: "What is Eidos File?",
      zh: "什么是 Eidos File？",
    },
    summary: {
      en: "Open, edit, and own a local-first multidimensional table.",
      zh: "打开、编辑并真正拥有本地优先的多维表格。",
    },
    markdown: { en: overviewEn, zh: overviewZh },
  },
  {
    slug: "format",
    edition: { en: "Eidos File format v1", zh: "Eidos File 格式 v1" },
    title: {
      en: "File format reference",
      zh: "文件格式参考",
    },
    summary: {
      en: "The stable SQLite schema, value encodings, fields, and views.",
      zh: "稳定的 SQLite schema、值编码、字段与视图契约。",
    },
    markdown: { en: formatEn, zh: formatZh },
  },
  {
    slug: "runtime",
    edition: { en: "Developer guide", zh: "开发者指南" },
    title: {
      en: "Build an Eidos File editor",
      zh: "构建 Eidos File 编辑工具",
    },
    summary: {
      en: "Connect files, the runtime, a Worker, save state, and the shared editor UI.",
      zh: "连接文件、Runtime、Worker、保存状态与共享编辑器 UI。",
    },
    markdown: { en: runtimeEn, zh: runtimeZh },
  },
  {
    slug: "plugins",
    edition: { en: "Developer guide", zh: "开发者指南" },
    title: {
      en: "Compose editor plugins",
      zh: "组合编辑器插件",
    },
    summary: {
      en: "Choose core capabilities, official workflows, and custom views without coupling to Eidos Space extensions.",
      zh: "划分核心能力、官方工作流与自定义视图，且不耦合 Eidos Space Extension。",
    },
    markdown: { en: pluginsEn, zh: pluginsZh },
  },
  {
    slug: "custom-views",
    edition: { en: "Developer guide", zh: "开发者指南" },
    title: {
      en: "Build custom views",
      zh: "构建自定义视图",
    },
    summary: {
      en: "Compose Eidos File UI and register a renderer for a saved view type.",
      zh: "组合 Eidos File UI，并为持久化视图类型注册 renderer。",
    },
    markdown: { en: viewsEn, zh: viewsZh },
  },
]

const FILE_TO_SLUG = new Map(
  EIDOS_FILE_DOCUMENTS.flatMap((document) => [
    [document.slug, document.slug],
    [`${document.slug}.en`, document.slug],
    [`${document.slug}.zh`, document.slug],
  ])
)

export function eidosFileDocumentBySlug(
  slug: string | null
): EidosFileDocument {
  const normalized = slug === "format-runtime" ? "format" : slug
  return (
    EIDOS_FILE_DOCUMENTS.find((document) => document.slug === normalized) ??
    EIDOS_FILE_DOCUMENTS[0]
  )
}

export function eidosFileDocumentSlugForFile(fileName: string): string | null {
  const normalized = fileName.split("/").at(-1)?.replace(/\.md$/, "")
  return normalized ? (FILE_TO_SLUG.get(normalized) ?? null) : null
}
