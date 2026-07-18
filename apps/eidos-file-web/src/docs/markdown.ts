import { marked } from "marked"
import Prism from "prismjs"
import "prismjs/components/prism-typescript"
import "prismjs/components/prism-jsx"
import "prismjs/components/prism-tsx"
import "prismjs/components/prism-bash"
import "prismjs/components/prism-json"
import "prismjs/components/prism-markdown"
import "prismjs/components/prism-sql"
import "prismjs/components/prism-yaml"

import type { Locale } from "../i18n"
import { eidosFileDocumentSlugForFile } from "./eidos-file-documents"
import { eidosFileDocsPath } from "./routes"

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

const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  md: "markdown",
  shell: "bash",
  sh: "bash",
  ts: "typescript",
  yml: "yaml",
}

function highlightCodeBlocks(document: Document): void {
  for (const code of document.body.querySelectorAll<HTMLElement>(
    "pre > code"
  )) {
    const languageClass = Array.from(code.classList).find((name) =>
      name.startsWith("language-")
    )
    if (!languageClass) continue
    const requested = languageClass.slice("language-".length).toLowerCase()
    const language = LANGUAGE_ALIASES[requested] ?? requested
    const grammar = Prism.languages[language]
    const pre = code.parentElement
    if (!grammar || !(pre instanceof HTMLPreElement)) continue

    code.innerHTML = Prism.highlight(code.textContent ?? "", grammar, language)
    code.className = `language-${language}`
    pre.dataset.language = requested.toUpperCase()
    pre.dataset.highlighted = "true"
  }
}

export function renderEidosFileMarkdown(
  source: string,
  locale: Locale = "en"
): RenderedMarkdown {
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
        ? eidosFileDocumentSlugForFile(fileName)
        : null
      if (slug) {
        element.setAttribute(
          "href",
          `${eidosFileDocsPath(slug, locale)}${fragment ? `#${fragment}` : ""}`
        )
      } else if (rawHref.startsWith("#/docs/")) {
        const legacySlug = rawHref.slice("#/docs/".length).split("#", 1)[0]
        element.setAttribute("href", eidosFileDocsPath(legacySlug, locale))
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

  highlightCodeBlocks(document)

  return { headings, html: document.body.innerHTML }
}
