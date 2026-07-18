import formatEn from "./content/format.en.md?raw"
import formatZh from "./content/format.zh.md?raw"
import buildEn from "./content/build.en.md?raw"
import buildZh from "./content/build.zh.md?raw"
import overviewEn from "./content/overview.en.md?raw"
import overviewZh from "./content/overview.zh.md?raw"

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
    slug: "build",
    edition: { en: "Packages 0.1.0", zh: "Package 0.1.0" },
    title: {
      en: "Build with Eidos File",
      zh: "基于 Eidos File 构建",
    },
    summary: {
      en: "Embed the React host or add a typed custom view.",
      zh: "嵌入 React View Host，或添加类型安全的自定义视图。",
    },
    markdown: { en: buildEn, zh: buildZh },
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
  const normalized =
    slug === "format-runtime"
      ? "format"
      : slug === "runtime" || slug === "plugins" || slug === "custom-views"
        ? "build"
        : slug
  return (
    EIDOS_FILE_DOCUMENTS.find((document) => document.slug === normalized) ??
    EIDOS_FILE_DOCUMENTS[0]
  )
}

export function eidosFileDocumentSlugForFile(fileName: string): string | null {
  const normalized = fileName.split("/").at(-1)?.replace(/\.md$/, "")
  return normalized ? (FILE_TO_SLUG.get(normalized) ?? null) : null
}
