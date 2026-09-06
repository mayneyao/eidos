import { fromMarkdown } from "mdast-util-from-markdown"
import { gfm } from "micromark-extension-gfm"
import { gfmFromMarkdown } from "mdast-util-gfm"
import type { Nodes } from "mdast"
import { parseObsidianMarkdownLinkDestination } from "./obsidian-internal-link"
import { scanDisplayMath, scanInlineMath } from "../features/math/syntax"

export interface MarkdownFileLinkRange {
  start: number
  end: number
  path: string
  syntax: "wikilink" | "markdown"
  /** True when a Markdown destination is enclosed in angle brackets. */
  angled?: boolean
}

function escaped(source: string, index: number): boolean {
  let count = 0
  while (index > 0 && source[--index] === "\\") count++
  return count % 2 === 1
}

/** Read-only source ranges. Never serializes an AST or normalizes whitespace. */
export function markdownFileLinkRanges(
  source: string
): MarkdownFileLinkRange[] {
  const root = fromMarkdown(source, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  })
  const protectedRanges: { start: number; end: number }[] = []
  const links: Nodes[] = []
  const visit = (node: Nodes) => {
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (start !== undefined && end !== undefined) {
      if (["code", "inlineCode", "html"].includes(node.type)) {
        protectedRanges.push({ start, end })
        return
      }
      if (["link", "image", "definition"].includes(node.type)) links.push(node)
    }
    if ("children" in node) node.children.forEach(visit)
  }
  visit(root)
  protectedRanges.push(...scanDisplayMath(source, protectedRanges).ranges)
  protectedRanges.push(
    ...scanInlineMath(source, { start: 0, end: source.length }, protectedRanges)
  )
  const frontmatterEnd =
    /^\uFEFF?---\s*\r?\n[\s\S]*?\r?\n---[^\S\r\n]*(?:\r?\n|$)/u.exec(
      source
    )?.[0].length ?? 0
  for (const match of source.matchAll(/%%[\s\S]*?%%/gu))
    protectedRanges.push({
      start: match.index,
      end: match.index + match[0].length,
    })
  const protectedAt = (start: number, end: number) =>
    protectedRanges.some((range) => start < range.end && end > range.start)
  const result: MarkdownFileLinkRange[] = []
  for (const match of source.matchAll(/!?\[\[([^\]\r\n]+)\]\]/gu)) {
    if (match[0].startsWith("!")) continue
    if (
      escaped(source, match.index) ||
      protectedAt(match.index, match.index + match[0].length) ||
      links.some(
        (node) =>
          match.index >= node.position!.start.offset! &&
          match.index < node.position!.end.offset!
      )
    )
      continue
    const bodyStart = match.index + (match[0].startsWith("!") ? 3 : 2)
    const body = match[1]!
    let cut = body.length
    for (let index = 0; index < body.length; index++) {
      if (
        (body[index] === "|" || body[index] === "#") &&
        !escaped(body, index)
      ) {
        cut = index
        break
      }
    }
    const raw = body.slice(0, cut)
    const target = parseObsidianMarkdownLinkDestination(raw.trim())
    if (!target?.path) continue
    const start = bodyStart + raw.length - raw.trimStart().length
    result.push({
      start,
      end: start + raw.trim().length,
      path: target.path,
      syntax: "wikilink",
    })
  }
  for (const node of links) {
    if (!("url" in node)) continue
    const start = node.position!.start.offset!
    const end = node.position!.end.offset!
    if (
      start < frontmatterEnd ||
      protectedRanges.some((range) => range.start <= start && range.end >= end)
    )
      continue
    const raw = source.slice(start, end)
    // The AST identifies real links; locate their destination without touching labels/titles.
    const labelEnd =
      node.type === "link"
        ? (node.children.at(-1)?.position?.end.offset ?? start) - start
        : 0
    const boundary =
      node.type === "definition"
        ? raw.indexOf("]:")
        : raw.indexOf("](", labelEnd)
    if (boundary < 0) continue
    let at = boundary + 2
    while (/\s/u.test(raw[at] ?? "") && at < raw.length) at++
    const angled = raw[at] === "<"
    if (angled) at++
    const destinationStart = at
    let depth = 0
    for (; at < raw.length; at++) {
      if (escaped(raw, at)) continue
      const char = raw[at]
      if (
        angled
          ? char === ">"
          : depth === 0 && (char === ")" || /\s/u.test(char!))
      )
        break
      if (!angled && char === "(") depth++
      if (!angled && char === ")") depth--
    }
    const token = raw.slice(destinationStart, at)
    const check = fromMarkdown(`[x](${angled ? `<${token}>` : token})`)
      .children[0]
    const parsedLink =
      check?.type === "paragraph" ? check.children[0] : undefined
    if (parsedLink?.type !== "link" || parsedLink.url !== node.url) continue
    const destination = parseObsidianMarkdownLinkDestination(node.url)
    if (!destination?.path) continue
    let hash = -1
    for (const part of token.matchAll(
      /\\#|&(?:#[xX][\da-fA-F]+|#\d+|[A-Za-z]+);|#/gu
    )) {
      const fragment = fromMarkdown(`[x](<${part[0]}>)`).children[0]
      const value =
        fragment?.type === "paragraph" ? fragment.children[0] : undefined
      if (value?.type === "link" && value.url === "#") {
        hash = part.index
        break
      }
    }
    result.push({
      start: start + destinationStart,
      end: start + destinationStart + (hash < 0 ? token.length : hash),
      path: destination.path,
      syntax: "markdown",
      angled,
    })
  }
  return result
    .sort((a, b) => a.start - b.start)
    .filter(
      (range, index, all) => index === 0 || range.start >= all[index - 1]!.end
    )
}
