import { fromMarkdown } from "mdast-util-from-markdown"
import type { Nodes, Root } from "mdast"
import { scanDisplayMath, scanInlineMath } from "../features/math/syntax"
import { scanVaultInline } from "../features/vault-inline/semantics"
import { frontmatterRange } from "../features/frontmatter/syntax"
import { MARKDOWN_FEATURES as F } from "../plugin-system/feature-ids"
import { scanHighlight } from "../features/highlight/syntax"
import type { MarkdownGrammar } from "../core/markdown-grammar"
import { rangeExtension, type SyntaxRange } from "./range-extension"
import type { EidosExtensionId } from "./presets"

export function parseStaticDocument(
  source: string,
  grammar: MarkdownGrammar,
  extensions: readonly EidosExtensionId[]
): { source: string; tree: Root } {
  const enabled = new Set<string>(extensions)
  const initial = fromMarkdown(source, grammar)
  const protectedRanges: { start: number; end: number }[] = []
  const blockContainers: { start: number; end: number }[] = []
  const walk = (node: Nodes) => {
    if (node.type === "list" || node.type === "blockquote") {
      const start = node.position?.start.offset,
        end = node.position?.end.offset
      if (start !== undefined && end !== undefined)
        blockContainers.push({ start, end })
    }
    if (
      [
        "code",
        "inlineCode",
        "html",
        "link",
        "linkReference",
        "image",
        "imageReference",
        "definition",
      ].includes(node.type)
    ) {
      const start = node.position?.start.offset,
        end = node.position?.end.offset
      if (start !== undefined && end !== undefined)
        protectedRanges.push({ start, end })
      return
    }
    if ("children" in node) node.children.forEach(walk)
  }
  walk(initial)
  const ranges: SyntaxRange[] = []
  const frontmatter = enabled.has("eidos.frontmatter")
    ? frontmatterRange(source)
    : null
  if (frontmatter) {
    ranges.push({ ...frontmatter, syntax: "frontmatter", block: true })
    protectedRanges.push(frontmatter)
  }
  if (enabled.has("eidos.math")) {
    for (const range of scanDisplayMath(source, [
      ...protectedRanges,
      ...blockContainers,
    ]).ranges) {
      ranges.push({ ...range, syntax: "math-block", block: true })
      protectedRanges.push(range)
    }
  }
  const featureOwners: Record<string, string> = {
    [F.obsidianWikilink]: "markdown.wikilink",
    [F.obsidianTag]: "markdown.tag",
    [F.obsidianComment]: "markdown.comment",
    [F.obsidianBlockId]: "markdown.block-id",
    [F.obsidianInlineFootnote]: "markdown.inline-footnote",
  }
  const candidates = scanVaultInline(
    source,
    (feature) => enabled.has(featureOwners[feature]),
    protectedRanges
  )
  const comments = candidates.filter(
    (match) => match.data.kind === "obsidian-comment"
  )
  if (comments.length) {
    // Comments can cross CommonMark paragraph boundaries. Elide their content
    // before structural parsing instead of letting one inline token span
    // unrelated chunks. Reparse the resulting source so all offsets agree.
    let masked = source
    for (const range of [...comments].reverse())
      masked =
        masked.slice(0, range.start) +
        masked.slice(range.start, range.end).replace(/[^\n]/gu, "") +
        masked.slice(range.end)
    return parseStaticDocument(
      masked,
      grammar,
      extensions.filter((id) => id !== "markdown.comment")
    )
  }
  for (const match of candidates) {
    if (protectedRanges.some((r) => match.start < r.end && match.end > r.start))
      continue
    ranges.push({ ...match, syntax: match.data.kind })
    protectedRanges.push(match)
  }
  if (enabled.has("eidos.math")) {
    for (const range of scanInlineMath(
      source,
      { start: 0, end: source.length },
      protectedRanges
    )) {
      ranges.push({ ...range, syntax: "math" })
      protectedRanges.push(range)
    }
  }
  if (enabled.has("eidos.highlight")) {
    for (const range of scanHighlight(source, protectedRanges)) {
      ranges.push({ ...range, syntax: "highlight" })
    }
  }
  const syntax = rangeExtension(ranges, source)
  return {
    source,
    tree: fromMarkdown(source, {
      extensions: [...(grammar.extensions ?? []), syntax.extension],
      mdastExtensions: [
        ...(grammar.mdastExtensions ?? []),
        syntax.mdastExtension,
      ],
    }),
  }
}
