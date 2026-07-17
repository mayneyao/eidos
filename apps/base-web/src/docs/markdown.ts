import { marked } from "marked"

import { baseDocumentSlugForFile } from "./base-documents"

export interface MarkdownHeading {
  id: string
  level: 2 | 3
  text: string
}

export interface RenderedMarkdown {
  headings: MarkdownHeading[]
  html: string
}

function headingId(text: string, usedIds: Set<string>): string {
  const base =
    text
      .normalize("NFKD")
      .toLowerCase()
      .trim()
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/^-|-$/g, "") || "section"
  let id = base
  let suffix = 2
  while (usedIds.has(id)) {
    id = `${base}-${suffix}`
    suffix += 1
  }
  usedIds.add(id)
  return id
}

function unsafeUrl(value: string): boolean {
  return /^\s*(?:javascript|data):/i.test(value)
}

export function renderBaseMarkdown(source: string): RenderedMarkdown {
  const parsed = marked.parse(source, {
    gfm: true,
    headerIds: false,
    mangle: false,
  })
  const document = new DOMParser().parseFromString(String(parsed), "text/html")
  const headings: MarkdownHeading[] = []
  const usedIds = new Set<string>()

  for (const element of document.querySelectorAll(
    "script, iframe, object, embed, style, link"
  )) {
    element.remove()
  }

  for (const element of document.body.querySelectorAll<HTMLElement>("*")) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.toLowerCase().startsWith("on")) {
        element.removeAttribute(attribute.name)
      }
    }

    if (element instanceof HTMLAnchorElement) {
      const rawHref = element.getAttribute("href") ?? ""
      if (unsafeUrl(rawHref)) {
        element.removeAttribute("href")
        continue
      }
      const [fileName, fragment] = rawHref.split("#", 2)
      const slug = fileName.endsWith(".md")
        ? baseDocumentSlugForFile(fileName)
        : null
      if (slug) {
        element.setAttribute(
          "href",
          `#/docs/${slug}${fragment ? `#${fragment}` : ""}`
        )
      } else if (/^https?:\/\//i.test(rawHref)) {
        element.target = "_blank"
        element.rel = "noreferrer"
      }
    }

    if (
      (element instanceof HTMLImageElement ||
        element instanceof HTMLSourceElement) &&
      unsafeUrl(element.getAttribute("src") ?? "")
    ) {
      element.removeAttribute("src")
    }
  }

  for (const heading of document.body.querySelectorAll<HTMLHeadingElement>(
    "h2, h3"
  )) {
    const text = heading.textContent?.trim() ?? ""
    const id = headingId(text, usedIds)
    heading.id = id
    headings.push({
      id,
      level: heading.tagName === "H2" ? 2 : 3,
      text,
    })
  }

  return { headings, html: document.body.innerHTML }
}
