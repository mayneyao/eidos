import { $createCodeNode } from "@lexical/code-core"
import { $createListNode, $createListItemNode } from "@lexical/list"
import { $createHorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode"
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text"
import type { LexicalNode } from "lexical"
import type { MarkdownPluginInsertion } from "../../plugin-system/plugin-api"

export function blockInsertion(
  metadata: Omit<MarkdownPluginInsertion, "execute" | "contexts" | "section">,
  createNode: () => LexicalNode,
  focus: "start" | "after" = "start"
): MarkdownPluginInsertion {
  return {
    ...metadata,
    contexts: ["block"],
    section: "basic",
    execute(context) {
      const key = context.insertBlock(createNode, { focus })
      if (!key) return
      context.closeMenu()
      context.focusEditor()
    },
  }
}

export const headingInsertions: readonly MarkdownPluginInsertion[] = [
  blockInsertion(
    {
      id: "eidos.commonmark.heading-1",
      order: 100,
      glyph: "H1",
      labelKey: "heading1",
    },
    () => $createHeadingNode("h1")
  ),
  blockInsertion(
    {
      id: "eidos.commonmark.heading-2",
      order: 110,
      glyph: "H2",
      labelKey: "heading2",
    },
    () => $createHeadingNode("h2")
  ),
  blockInsertion(
    {
      id: "eidos.commonmark.heading-3",
      order: 120,
      glyph: "H3",
      labelKey: "heading3",
    },
    () => $createHeadingNode("h3")
  ),
]

export const quoteInsertions: readonly MarkdownPluginInsertion[] = [
  blockInsertion(
    { id: "eidos.commonmark.quote", order: 130, glyph: "❯", labelKey: "quote" },
    $createQuoteNode
  ),
]

export const listInsertions: readonly MarkdownPluginInsertion[] = [
  blockInsertion(
    {
      id: "eidos.commonmark.bullet-list",
      order: 140,
      glyph: "•",
      labelKey: "bulletList",
    },
    () => $createListNode("bullet").append($createListItemNode())
  ),
  blockInsertion(
    {
      id: "eidos.commonmark.number-list",
      order: 150,
      glyph: "1.",
      labelKey: "numberedList",
    },
    () => $createListNode("number").append($createListItemNode())
  ),
]

export const codeBlockInsertions: readonly MarkdownPluginInsertion[] = [
  blockInsertion(
    {
      id: "eidos.commonmark.code",
      order: 170,
      glyph: "</>",
      labelKey: "codeBlock",
    },
    $createCodeNode
  ),
]

export const thematicBreakInsertions: readonly MarkdownPluginInsertion[] = [
  blockInsertion(
    {
      id: "eidos.commonmark.divider",
      order: 190,
      glyph: "—",
      labelKey: "divider",
    },
    $createHorizontalRuleNode,
    "after"
  ),
]
