import type { MarkdownBlockBoundary } from "../../core/block-boundary"
import { $isEfmBlockNode } from "../../nodes/efm-semantic-node"

export const footnoteBoundary: MarkdownBlockBoundary = {
  id: "eidos.footnote.boundary",
  placement: "end",
  matches: (node) =>
    $isEfmBlockNode(node) && node.getData().kind === "footnote-definition",
}
