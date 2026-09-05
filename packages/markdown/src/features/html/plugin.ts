import { ACTIVE_HTML } from "../../core/html-safety"
import type { MarkdownBlockSyntax } from "../../core/block-syntax"
import { markdownPreviewHtml } from "../../markdown/preview"
import { $createEfmSourceBlockNode } from "../../nodes/efm-source-block-node"
import {
  EfmBlockNode,
  $createEfmBlockNode,
  $isEfmBlockNode,
} from "../../nodes/efm-semantic-node"
import { MARKDOWN_FEATURES } from "../../plugin-system/feature-ids"
import { defineMarkdownPlugin } from "../../plugin-system/plugin-api"

export const htmlBlockSyntax: MarkdownBlockSyntax = {
  id: "markdown.html.block",
  // Active HTML stays in the diagnostic/source-fallback path, even when this
  // plugin is enabled. Claiming it would hide the core's safety diagnostics.
  matchParsedBlock: (block) =>
    block.type === "html" && !ACTIVE_HTML.test(block.source),
  import(source, options) {
    return ACTIVE_HTML.test(source)
      ? $createEfmSourceBlockNode(source, "raw-html")
      : $createEfmBlockNode({
          kind: "raw-html",
          source,
          previewHtml: markdownPreviewHtml(source, options.grammar),
        })
  },
  export(node) {
    return $isEfmBlockNode(node) && node.getData().kind === "raw-html"
      ? node.getData().source
      : null
  },
}

export const rawHtmlPlugin = defineMarkdownPlugin({
  grammar: { commonmark: ["htmlFlow", "htmlText"] },
  apiVersion: 1,
  id: "eidos.raw-html",
  version: "1.0.0",
  features: [MARKDOWN_FEATURES.rawHtml],
  nodes: [EfmBlockNode],
  blockSyntax: [htmlBlockSyntax],
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
