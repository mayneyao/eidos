import { EfmInlineNode } from "../../nodes/efm-semantic-node"
import { BlockIdIdentityPlugin } from "./block-id-identity-plugin"
import { StructuredBlockIdPlugin } from "./structured-block-id-plugin"
import {
  defineMarkdownPlugin,
  type MarkdownPlugin,
} from "../../plugin-system/plugin-api"
import { MARKDOWN_FEATURES } from "../../plugin-system/feature-ids"
import {
  tagSyntax,
  commentSyntax,
  blockIdSyntax,
  inlineFootnoteSyntax,
} from "./syntax"
import type { MarkdownInlineSyntax } from "../../core/inline-syntax"

function inlinePlugin(
  id: string,
  feature: string,
  syntax: MarkdownInlineSyntax
): MarkdownPlugin {
  return defineMarkdownPlugin({
    apiVersion: 1,
    id,
    version: "1.0.0",
    conflicts: ["obsidian.syntax"],
    features: [feature],
    nodes: [EfmInlineNode],
    inlineSyntax: [syntax],
  })
}

export const tagPlugin = inlinePlugin(
  "markdown.tag",
  MARKDOWN_FEATURES.obsidianTag,
  tagSyntax
)
export const commentPlugin = inlinePlugin(
  "markdown.comment",
  MARKDOWN_FEATURES.obsidianComment,
  commentSyntax
)
export const blockIdPlugin = defineMarkdownPlugin({
  ...inlinePlugin(
    "markdown.block-id",
    MARKDOWN_FEATURES.obsidianBlockId,
    blockIdSyntax
  ),
  behaviors: [
    { id: "block-id.identity", component: BlockIdIdentityPlugin },
    { id: "block-id.structured", component: StructuredBlockIdPlugin },
  ],
})
export const inlineFootnotePlugin = inlinePlugin(
  "markdown.inline-footnote",
  MARKDOWN_FEATURES.obsidianInlineFootnote,
  inlineFootnoteSyntax
)
