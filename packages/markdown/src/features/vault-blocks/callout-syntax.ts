import type { MarkdownBlockSyntax } from "../../core/block-syntax"
import {
  $createEfmBlockNode,
  $isEfmBlockNode,
} from "../../nodes/efm-semantic-node"
import { markdownPreviewHtml } from "../../markdown/preview"

import { parseCallout } from "./callout"

export const calloutBlockSyntax: MarkdownBlockSyntax = {
  id: "markdown.callout.block",
  matchParsedBlock(block) {
    return block.type === "blockquote" && parseCallout(block.source) !== null
  },
  import(source, options) {
    const callout = parseCallout(source)
    if (!callout) throw new Error("Invalid callout header.")
    const { body, ...metadata } = callout
    return $createEfmBlockNode({
      kind: "obsidian-callout",
      source,
      ...metadata,
      previewHtml: markdownPreviewHtml(body, options.grammar),
    })
  },
  export(node) {
    return $isEfmBlockNode(node) && node.getData().kind === "obsidian-callout"
      ? node.getData().source
      : null
  },
}
