import { micromark } from "micromark"
import { gfm, gfmHtml } from "micromark-extension-gfm"

export interface DocumentHeading {
  id: string
  title: string
  level: number
}

/** Build-time only. Raw HTML and unsafe protocols retain Micromark's safe defaults. */
export function renderDocument(source: string) {
  const headings: DocumentHeading[] = []
  const usedIds = new Set<string>()
  const html = micromark(source, {
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()],
  }).replace(
    /<h([1-6])>(.*?)<\/h\1>/gu,
    (_: string, level: string, content: string) => {
      const title = content
        .replace(/<[^>]*>/gu, "")
        .replace(/&amp;/gu, "&")
        .replace(/&quot;/gu, '"')
        .replace(/&#39;/gu, "'")
      const slug =
        title
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s_-]/gu, "")
          .trim()
          .replace(/\s+/gu, "-") || "section"
      let id = slug
      let suffix = 0
      while (usedIds.has(id)) id = `${slug}-${++suffix}`
      usedIds.add(id)
      headings.push({ id, title, level: Number(level) })
      return `<h${level} id="${id}">${content}</h${level}>`
    }
  )
  return { html, headings }
}
