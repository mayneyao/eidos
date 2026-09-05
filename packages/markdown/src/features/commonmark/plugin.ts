import { CodeNode } from "@lexical/code-core"
import { LinkNode } from "@lexical/link"
import { ListItemNode, ListNode } from "@lexical/list"
import {
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  CODE,
  HEADING,
  INLINE_CODE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  LINK,
  QUOTE,
} from "@lexical/markdown"
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode"
import { HeadingNode, QuoteNode } from "@lexical/rich-text"
import {
  HORIZONTAL_RULE,
  RICH_ORDERED_LIST,
  RICH_UNORDERED_LIST,
} from "../../markdown/markdown-transformers"
import { defineMarkdownPlugin } from "../../plugin-system/plugin-api"
import { MARKDOWN_FEATURES } from "../../plugin-system/feature-ids"
import {
  headingInsertions,
  quoteInsertions,
  listInsertions,
  codeBlockInsertions,
  thematicBreakInsertions,
} from "./insertions"
import {
  CommonmarkBehaviors,
  ListBehaviors,
  CodeBehaviors,
  ThematicBreakBehaviors,
} from "./behaviors"
import { COMMONMARK_CONSTRUCTS } from "../../core/markdown-grammar"
import { EfmInlineNode } from "../../nodes/efm-semantic-node"
import { RelativeLinkBehavior } from "./relative-link-behavior"
import type { MarkdownPlugin } from "../../plugin-system/plugin-api"

/** Syntax owners declare contributions directly. Legacy bundles only aggregate. */
function syntax(
  name: string,
  feature: string,
  contributions: Omit<
    MarkdownPlugin,
    "apiVersion" | "id" | "version" | "features" | "conflicts"
  >
): MarkdownPlugin {
  return defineMarkdownPlugin({
    apiVersion: 1,
    id: `markdown.${name}`,
    version: "1.0.0",
    conflicts: ["eidos.commonmark"],
    features: [feature],
    ...contributions,
  })
}

export const paragraphPlugin = syntax(
  "paragraph",
  MARKDOWN_FEATURES.paragraph,
  {
    grammar: { commonmark: [] },
  }
)
export const headingPlugin = syntax("heading", MARKDOWN_FEATURES.heading, {
  grammar: { commonmark: ["headingAtx", "setextUnderline"] },
  nodes: [HeadingNode],
  transformers: [{ order: 40, transformer: HEADING }],
  insertions: headingInsertions,
})
export const quotePlugin = syntax("quote", MARKDOWN_FEATURES.quote, {
  grammar: { commonmark: ["blockQuote"] },
  nodes: [QuoteNode],
  transformers: [{ order: 50, transformer: QUOTE }],
  insertions: quoteInsertions,
})
export const listPlugin = syntax("list", MARKDOWN_FEATURES.list, {
  grammar: { commonmark: ["list"] },
  nodes: [ListNode, ListItemNode],
  transformers: [
    { order: 60, transformer: RICH_UNORDERED_LIST },
    { order: 70, transformer: RICH_ORDERED_LIST },
  ],
  insertions: listInsertions,
  behaviors: [{ id: "markdown.list.behavior", component: ListBehaviors }],
})
export const codeBlockPlugin = syntax("code", MARKDOWN_FEATURES.code, {
  grammar: { commonmark: ["codeFenced", "codeIndented"] },
  nodes: [CodeNode],
  transformers: [{ order: 80, transformer: CODE }],
  insertions: codeBlockInsertions,
  behaviors: [{ id: "markdown.code.behavior", component: CodeBehaviors }],
})
export const inlineCodePlugin = syntax(
  "inline-code",
  MARKDOWN_FEATURES.inlineCode,
  {
    grammar: { commonmark: ["codeText"] },
    transformers: [{ order: 90, transformer: INLINE_CODE }],
    toolbar: [
      {
        id: "format.inline-code",
        order: 140,
        glyph: "</>",
        labelKey: "inlineCode",
        format: "code",
      },
    ],
  }
)
export const emphasisPlugin = syntax("emphasis", MARKDOWN_FEATURES.emphasis, {
  grammar: { commonmark: ["attention"] },
  transformers: [
    { order: 100, transformer: BOLD_ITALIC_STAR },
    { order: 110, transformer: BOLD_ITALIC_UNDERSCORE },
    { order: 120, transformer: BOLD_STAR },
    { order: 130, transformer: BOLD_UNDERSCORE },
    { order: 140, transformer: ITALIC_STAR },
    { order: 150, transformer: ITALIC_UNDERSCORE },
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
  ],
})
export const linkPlugin = syntax("link", MARKDOWN_FEATURES.link, {
  grammar: { commonmark: ["autolink", "labelStartLink", "definition"] },
  nodes: [LinkNode, EfmInlineNode],
  transformers: [{ order: 180, transformer: LINK }],
  behaviors: [
    { id: "markdown.link.relative-dom", component: RelativeLinkBehavior },
  ],
})
export const thematicBreakPlugin = syntax(
  "thematic-break",
  MARKDOWN_FEATURES.thematicBreak,
  {
    grammar: { commonmark: ["thematicBreak"] },
    nodes: [HorizontalRuleNode],
    transformers: [{ order: 30, transformer: HORIZONTAL_RULE }],
    insertions: thematicBreakInsertions,
    behaviors: [
      {
        id: "markdown.thematic-break.behavior",
        component: ThematicBreakBehaviors,
      },
    ],
  }
)

export const commonmarkSyntaxPlugins = [
  paragraphPlugin,
  headingPlugin,
  quotePlugin,
  listPlugin,
  codeBlockPlugin,
  inlineCodePlugin,
  emphasisPlugin,
  linkPlugin,
  thematicBreakPlugin,
] as const

/** Compatibility entry point. New presets compose the individual owners. */
export const commonmarkPlugin: MarkdownPlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "eidos.commonmark",
  version: "1.0.0",
  // The legacy bundle historically enabled the complete parser grammar.
  grammar: { commonmark: COMMONMARK_CONSTRUCTS },
  features: commonmarkSyntaxPlugins.flatMap((plugin) => plugin.features ?? []),
  nodes: [
    ...new Set(commonmarkSyntaxPlugins.flatMap((plugin) => plugin.nodes ?? [])),
  ],
  transformers: commonmarkSyntaxPlugins
    .flatMap((plugin) => plugin.transformers ?? [])
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  toolbar: commonmarkSyntaxPlugins
    .flatMap((plugin) => plugin.toolbar ?? [])
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  insertions: commonmarkSyntaxPlugins
    .flatMap((plugin) => plugin.insertions ?? [])
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  behaviors: [
    { id: "eidos.commonmark.behavior", component: CommonmarkBehaviors },
  ],
})
