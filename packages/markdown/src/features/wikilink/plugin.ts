import { EfmInlineNode } from "../../nodes/efm-semantic-node"
import { defineMarkdownPlugin } from "../../plugin-system/plugin-api"
import { MARKDOWN_FEATURES } from "../../plugin-system/feature-ids"
import { wikilinkSyntax } from "../vault-inline/syntax"

/** Wiki links only; embeds, tags and other vault syntax are separate choices. */
export const wikilinkPlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "markdown.wikilink",
  version: "1.0.0",
  conflicts: ["obsidian.syntax"],
  features: [MARKDOWN_FEATURES.obsidianWikilink],
  nodes: [EfmInlineNode],
  inlineSyntax: [wikilinkSyntax],
})
