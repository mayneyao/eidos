import baseFormatEn from "../../../../docs/rfcs/eidos-base-file-format.md?raw"
import baseFormatZh from "../../../../docs/rfcs/eidos-base-file-format.zh.md?raw"
import extensionsEn from "../../../../docs/rfcs/eidos-file-based-extensions.md?raw"
import extensionsZh from "../../../../docs/rfcs/eidos-file-based-extensions.zh.md?raw"
import productUxEn from "../../../../docs/rfcs/eidos-space-base-product-ux.md?raw"
import productUxZh from "../../../../docs/rfcs/eidos-space-base-product-ux.zh.md?raw"
import storageEn from "../../../../docs/rfcs/eidos-space-base-storage.md?raw"
import storageZh from "../../../../docs/rfcs/eidos-space-base-storage.zh.md?raw"

import type { Locale } from "../i18n"

export interface BaseDocument {
  slug: string
  sourcePath: string
  title: Record<Locale, string>
  summary: Record<Locale, string>
  markdown: Record<Locale, string>
}

export const BASE_DOCUMENTS: BaseDocument[] = [
  {
    slug: "format-runtime",
    sourcePath: "docs/rfcs/eidos-base-file-format.md",
    title: {
      en: "Base file format & runtime",
      zh: "Base 文件格式与运行时",
    },
    summary: {
      en: "SQLite schema, field semantics, validation, queries, edits, and migrations.",
      zh: "SQLite schema、字段语义、验证、查询、编辑与迁移。",
    },
    markdown: { en: baseFormatEn, zh: baseFormatZh },
  },
  {
    slug: "product-ux",
    sourcePath: "docs/rfcs/eidos-space-base-product-ux.md",
    title: {
      en: "Base product UX",
      zh: "Base 产品体验",
    },
    summary: {
      en: "Grid, Gallery, Kanban, workbook navigation, records, and keyboard behavior.",
      zh: "Grid、Gallery、Kanban、工作簿导航、记录与键盘交互。",
    },
    markdown: { en: productUxEn, zh: productUxZh },
  },
  {
    slug: "storage-model",
    sourcePath: "docs/rfcs/eidos-space-base-storage.md",
    title: {
      en: "Space & Base storage model",
      zh: "Space 与 Base 存储模型",
    },
    summary: {
      en: "How Markdown, Base files, assets, Eidos state, and Graft fit together.",
      zh: "Markdown、Base、附件、Eidos 状态与 Graft 如何协同。",
    },
    markdown: { en: storageEn, zh: storageZh },
  },
  {
    slug: "extensions",
    sourcePath: "docs/rfcs/eidos-file-based-extensions.md",
    title: {
      en: "File-based extensions",
      zh: "文件化扩展",
    },
    summary: {
      en: "Portable extension source, custom Base views, permissions, and runtime boundaries.",
      zh: "可携带扩展源码、自定义 Base 视图、权限与运行时边界。",
    },
    markdown: { en: extensionsEn, zh: extensionsZh },
  },
]

const FILE_TO_SLUG = new Map(
  BASE_DOCUMENTS.map((document) => [
    document.sourcePath.split("/").at(-1)?.replace(/\.md$/, ""),
    document.slug,
  ])
)

export function baseDocumentBySlug(slug: string | null): BaseDocument {
  return (
    BASE_DOCUMENTS.find((document) => document.slug === slug) ??
    BASE_DOCUMENTS[0]
  )
}

export function baseDocumentSlugForFile(fileName: string): string | null {
  const normalized = fileName
    .split("/")
    .at(-1)
    ?.replace(/\.zh\.md$/, "")
    .replace(/\.md$/, "")
  return normalized ? (FILE_TO_SLUG.get(normalized) ?? null) : null
}
