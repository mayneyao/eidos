import {
  $createEfmInlineNode,
  $isEfmInlineNode,
  type EfmInlineData,
} from "../../nodes/efm-semantic-node"
import type { MarkdownInlineSyntax } from "../../core/inline-syntax"
import { vaultInlineMatches, scanVaultInline } from "./semantics"

function syntax(id: string, kind: EfmInlineData["kind"]): MarkdownInlineSyntax {
  return {
    id,
    capturesContent: kind !== "obsidian-tag" && kind !== "obsidian-block-id",
    scan(source, context) {
      return scanVaultInline(
        source,
        (feature) => context.options.syntaxFeatures?.has(feature) ?? true,
        context.protectedRanges
      )
        .filter((match) => match.data.kind === kind)
        .map(({ start, end }) => ({ start, end }))
    },
    import(source) {
      const match = vaultInlineMatches(source, () => true, []).find(
        (match) =>
          match.data.kind === kind &&
          match.start === 0 &&
          match.end === source.length
      )
      if (!match) throw new Error(`Invalid source for inline syntax "${id}".`)
      return $createEfmInlineNode(match.data)
    },
    export(node) {
      return $isEfmInlineNode(node) && node.getData().kind === kind
        ? node.getData().source
        : null
    },
  }
}
export const wikilinkSyntax = syntax(
  "markdown.wikilink.syntax",
  "obsidian-link"
)
export const tagSyntax = syntax("markdown.tag.syntax", "obsidian-tag")
export const commentSyntax = syntax(
  "markdown.comment.syntax",
  "obsidian-comment"
)
export const blockIdSyntax = syntax(
  "markdown.block-id.syntax",
  "obsidian-block-id"
)
export const inlineFootnoteSyntax = syntax(
  "markdown.inline-footnote.syntax",
  "obsidian-inline-footnote"
)
export const vaultInlineSyntax = [
  wikilinkSyntax,
  tagSyntax,
  commentSyntax,
  blockIdSyntax,
  inlineFootnoteSyntax,
] as const
