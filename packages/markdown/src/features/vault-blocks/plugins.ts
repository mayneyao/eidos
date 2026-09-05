import { EfmBlockNode } from "../../nodes/efm-semantic-node"
import { defineMarkdownPlugin } from "../../plugin-system/plugin-api"
import { MARKDOWN_FEATURES } from "../../plugin-system/feature-ids"
import { calloutBlockSyntax } from "./callout-syntax"

export const calloutPlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "markdown.callout",
  version: "1.0.0",
  requires: ["markdown.quote"],
  conflicts: ["obsidian.syntax"],
  features: [MARKDOWN_FEATURES.obsidianCallout],
  nodes: [EfmBlockNode],
  blockSyntax: [calloutBlockSyntax],
})

/** Presentation modifier for Markdown images, not a storage adapter. */
export const attachmentPlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "markdown.attachment",
  version: "1.0.0",
  requires: ["eidos.image"],
  conflicts: ["obsidian.syntax"],
  features: [MARKDOWN_FEATURES.obsidianAttachment],
})

/** Compatibility descriptor: relative paths are now owned by markdown.link. */
export const vaultLinkPlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "markdown.vault-link",
  version: "1.0.0",
  requires: ["markdown.link"],
  conflicts: ["obsidian.syntax"],
})
