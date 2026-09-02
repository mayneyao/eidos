import { CodeNode } from "@lexical/code-core"
import { LinkNode } from "@lexical/link"
import { ListItemNode, ListNode } from "@lexical/list"
import {
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  CHECK_LIST,
  CODE,
  HEADING,
  HIGHLIGHT,
  INLINE_CODE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  LINK,
  ORDERED_LIST,
  QUOTE,
  STRIKETHROUGH,
  UNORDERED_LIST,
} from "@lexical/markdown"
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode"
import { HeadingNode, QuoteNode } from "@lexical/rich-text"
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table"

import { TABLE } from "../markdown/table-transformer"
import { HORIZONTAL_RULE } from "../markdown/markdown-transformers"
import { EfmBlockNode, EfmInlineNode } from "../nodes/efm-semantic-node"
import { defineMarkdownPlugin } from "./plugin-api"
import {
  compileMarkdownPlugins,
  defineMarkdownPlugins,
} from "./plugin-compiler"
import { MARKDOWN_FEATURES } from "./feature-ids"

export const commonmarkPlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "eidos.commonmark",
  version: "1.0.0",
  features: [
    MARKDOWN_FEATURES.paragraph,
    MARKDOWN_FEATURES.heading,
    MARKDOWN_FEATURES.quote,
    MARKDOWN_FEATURES.list,
    MARKDOWN_FEATURES.code,
    MARKDOWN_FEATURES.inlineCode,
    MARKDOWN_FEATURES.emphasis,
    MARKDOWN_FEATURES.link,
    MARKDOWN_FEATURES.thematicBreak,
  ],
  nodes: [
    HeadingNode,
    QuoteNode,
    ListNode,
    ListItemNode,
    CodeNode,
    LinkNode,
    HorizontalRuleNode,
  ],
  transformers: [
    { order: 30, transformer: HORIZONTAL_RULE },
    { order: 40, transformer: HEADING },
    { order: 50, transformer: QUOTE },
    { order: 60, transformer: UNORDERED_LIST },
    { order: 70, transformer: ORDERED_LIST },
    { order: 80, transformer: CODE },
    { order: 90, transformer: INLINE_CODE },
    { order: 100, transformer: BOLD_ITALIC_STAR },
    { order: 110, transformer: BOLD_ITALIC_UNDERSCORE },
    { order: 120, transformer: BOLD_STAR },
    { order: 130, transformer: BOLD_UNDERSCORE },
    { order: 140, transformer: ITALIC_STAR },
    { order: 150, transformer: ITALIC_UNDERSCORE },
    { order: 180, transformer: LINK },
  ],
  toolbar: [
    {
      id: "format.bold",
      order: 100,
      glyph: "B",
      labelKey: "bold",
      shortcutId: "format.bold",
      format: "bold",
    },
    {
      id: "format.italic",
      order: 110,
      glyph: "I",
      labelKey: "italic",
      shortcutId: "format.italic",
      format: "italic",
    },
    {
      id: "format.inline-code",
      order: 140,
      glyph: "</>",
      labelKey: "inlineCode",
      format: "code",
    },
  ],
  insertions: [
    {
      id: "heading-1",
      order: 100,
      contexts: ["block"],
      glyph: "H1",
      labelKey: "heading1",
      section: "basic",
    },
    {
      id: "heading-2",
      order: 110,
      contexts: ["block"],
      glyph: "H2",
      labelKey: "heading2",
      section: "basic",
    },
    {
      id: "heading-3",
      order: 120,
      contexts: ["block"],
      glyph: "H3",
      labelKey: "heading3",
      section: "basic",
    },
    {
      id: "quote",
      order: 130,
      contexts: ["block"],
      glyph: "❯",
      labelKey: "quote",
      section: "basic",
    },
    {
      id: "bullet-list",
      order: 140,
      contexts: ["block"],
      glyph: "•",
      labelKey: "bulletList",
      section: "basic",
    },
    {
      id: "number-list",
      order: 150,
      contexts: ["block"],
      glyph: "1.",
      labelKey: "numberedList",
      section: "basic",
    },
    {
      id: "code",
      order: 170,
      contexts: ["block"],
      glyph: "</>",
      labelKey: "codeBlock",
      section: "basic",
    },
    {
      id: "divider",
      order: 190,
      contexts: ["block"],
      glyph: "—",
      labelKey: "divider",
      section: "basic",
    },
  ],
})

export const gfmPlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "eidos.gfm",
  version: "1.0.0",
  requires: [commonmarkPlugin.id],
  features: [
    MARKDOWN_FEATURES.gfmStrikethrough,
    MARKDOWN_FEATURES.gfmTable,
    MARKDOWN_FEATURES.gfmTaskList,
  ],
  nodes: [ListNode, ListItemNode, TableNode, TableRowNode, TableCellNode],
  transformers: [
    { order: 10, transformer: TABLE },
    { order: 20, transformer: CHECK_LIST },
    { order: 160, transformer: STRIKETHROUGH },
  ],
  toolbar: [
    {
      id: "format.strikethrough",
      order: 120,
      glyph: "S",
      labelKey: "strikethrough",
      format: "strikethrough",
    },
  ],
  insertions: [
    {
      id: "check-list",
      order: 160,
      contexts: ["block"],
      glyph: "☐",
      labelKey: "checkList",
      section: "basic",
    },
    {
      id: "table",
      order: 180,
      contexts: ["block"],
      glyph: "▦",
      labelKey: "table",
      section: "basic",
    },
  ],
})

export const highlightPlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "eidos.highlight",
  version: "1.0.0",
  features: [MARKDOWN_FEATURES.highlight],
  transformers: [{ order: 170, transformer: HIGHLIGHT }],
  toolbar: [
    {
      id: "format.highlight",
      order: 130,
      glyph: "==",
      labelKey: "highlight",
      format: "highlight",
    },
  ],
})

export const mathPlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "eidos.math",
  version: "1.0.0",
  features: [MARKDOWN_FEATURES.math],
  nodes: [EfmBlockNode, EfmInlineNode],
  insertions: [
    {
      id: "math",
      order: 200,
      contexts: ["block"],
      glyph: "∑",
      labelKey: "mathBlock",
      section: "extended",
    },
    {
      id: "inline-math",
      order: 210,
      contexts: ["inline"],
      glyph: "√x",
      labelKey: "inlineMath",
      section: "extended",
    },
  ],
})

export const imagePlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "eidos.image",
  version: "1.0.0",
  features: [MARKDOWN_FEATURES.image],
  nodes: [EfmBlockNode, EfmInlineNode],
  insertions: [
    {
      id: "image",
      order: 220,
      contexts: ["block"],
      glyph: "▧",
      labelKey: "image",
      section: "extended",
    },
  ],
})

export const footnotePlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "eidos.footnote",
  version: "1.0.0",
  features: [MARKDOWN_FEATURES.footnote],
  nodes: [EfmBlockNode, EfmInlineNode],
  insertions: [
    {
      id: "footnote",
      order: 230,
      contexts: ["block", "inline"],
      glyph: "¹",
      labelKey: "footnote",
      section: "extended",
    },
  ],
})

export const frontmatterPlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "eidos.frontmatter",
  version: "1.0.0",
  features: [MARKDOWN_FEATURES.frontmatter],
  nodes: [EfmBlockNode],
  insertions: [
    {
      id: "frontmatter",
      order: 250,
      contexts: ["block"],
      glyph: "≡",
      labelKey: "frontmatter",
      section: "extended",
    },
  ],
})

export const rawHtmlPlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "eidos.raw-html",
  version: "1.0.0",
  features: [MARKDOWN_FEATURES.rawHtml],
  nodes: [EfmBlockNode],
  insertions: [
    {
      id: "html",
      order: 240,
      contexts: ["block"],
      glyph: "<>",
      labelKey: "rawHtml",
      section: "extended",
    },
  ],
})

export const referencePlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "eidos.reference",
  version: "1.0.0",
  features: [MARKDOWN_FEATURES.reference],
  nodes: [EfmBlockNode, EfmInlineNode],
})

/** The shipped EFM profile. Consumers can remove or append plugins immutably. */
export const eidosMarkdownPlugins = defineMarkdownPlugins([
  commonmarkPlugin,
  gfmPlugin,
  highlightPlugin,
  mathPlugin,
  imagePlugin,
  footnotePlugin,
  frontmatterPlugin,
  rawHtmlPlugin,
  referencePlugin,
])

/** Precompiled default registry reused by the component and advanced hosts. */
export const EIDOS_MARKDOWN_PLUGIN_REGISTRY =
  compileMarkdownPlugins(eidosMarkdownPlugins)
