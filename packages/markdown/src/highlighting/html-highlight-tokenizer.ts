import { fromMarkdown } from "mdast-util-from-markdown"
import type { CodeHighlightToken } from "./code-highlight-tokenizer"

/** Keep the language stable while the source draft is temporarily incomplete. */
export function sourceRangeLanguage(source: string): "html" | "markdown" {
  const nodes = fromMarkdown(source).children
  return nodes.length > 0 && nodes.every((node) => node.type === "html")
    ? "html"
    : "markdown"
}

/** Highlight markup only: prose and Markdown-looking HTML text stay plain. */
export function tokenizeHtml(source: string): CodeHighlightToken[] {
  const tokens: CodeHighlightToken[] = []
  const markup =
    /<!--[\s\S]*?(?:-->|$)|<!DOCTYPE\b[^>]*>?|<\/?[A-Za-z][\w:-]*(?:[^<>"']|"[^"]*(?:"|$)|'[^']*(?:'|$))*>?/giu
  for (const match of source.matchAll(markup)) {
    const start = match.index
    const value = match[0]
    if (value.startsWith("<!--") || /^<!doctype/iu.test(value)) {
      tokens.push({
        start,
        end: start + value.length,
        kind: value.startsWith("<!--") ? "comment" : "tag",
      })
      continue
    }
    const name = /^<\/?[\w:-]+/u.exec(value)![0]
    tokens.push({ start, end: start + name.length, kind: "tag" })
    const attributes = /"[^"]*(?:"|$)|'[^']*(?:'|$)|[^\s=/>]+|=|\/?>/gu
    attributes.lastIndex = name.length
    let attribute: RegExpExecArray | null
    let expectingValue = false
    while ((attribute = attributes.exec(value))) {
      const text = attribute[0]
      const operator = text === "=" || /^(?:\/?>)$/u.test(text)
      tokens.push({
        start: start + attribute.index,
        end: start + attribute.index + text.length,
        kind: operator
          ? "operator"
          : expectingValue || /^["']/u.test(text)
            ? "string"
            : "property",
      })
      expectingValue = text === "="
    }
  }
  return tokens
}
