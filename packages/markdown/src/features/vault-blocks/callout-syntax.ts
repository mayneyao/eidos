import type { MarkdownBlockSyntax } from "../../core/block-syntax"
import {
  $createEfmBlockNode,
  $isEfmBlockNode,
} from "../../nodes/efm-semantic-node"
import { markdownPreviewHtml } from "../../markdown/preview"

const headerPattern =
  /^ {0,3}>[ \t]*\[!([A-Za-z][\w-]*)\]([+-])?(?:[ \t]+(.*))?(?:\n|$)/u

export const calloutBlockSyntax: MarkdownBlockSyntax = {
  id: "markdown.callout.block",
  matchParsedBlock(block) {
    return block.type === "blockquote" && headerPattern.test(block.source)
  },
  import(source, options) {
    const header = source.match(headerPattern)
    if (!header) throw new Error("Invalid callout header.")
    const body = source
      .split("\n")
      .slice(1)
      .map((line) => line.replace(/^ {0,3}> ?/u, ""))
      .join("\n")
    return $createEfmBlockNode({
      kind: "obsidian-callout",
      source,
      calloutType: header[1].toLocaleLowerCase(),
      calloutTitle: header[3]?.trim() || header[1],
      ...(header[2] === "+" || header[2] === "-"
        ? { calloutFold: header[2] }
        : {}),
      previewHtml: markdownPreviewHtml(body, options.grammar),
    })
  },
  export(node) {
    return $isEfmBlockNode(node) && node.getData().kind === "obsidian-callout"
      ? node.getData().source
      : null
  },
}
