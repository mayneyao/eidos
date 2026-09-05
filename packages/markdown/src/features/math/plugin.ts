import { EfmBlockNode, EfmInlineNode } from "../../nodes/efm-semantic-node"
import { MARKDOWN_FEATURES } from "../../plugin-system/feature-ids"
import { defineMarkdownPlugin } from "../../plugin-system/plugin-api"
import { mathInsertions } from "./insertions"
import { mathBlockSyntax } from "./block-syntax"
import { mathInlineSyntax } from "./inline-syntax"

export const mathPlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "eidos.math",
  version: "1.0.0",
  features: [MARKDOWN_FEATURES.math],
  nodes: [EfmBlockNode, EfmInlineNode],
  insertions: mathInsertions,
  blockSyntax: [mathBlockSyntax],
  inlineSyntax: [mathInlineSyntax],
})
