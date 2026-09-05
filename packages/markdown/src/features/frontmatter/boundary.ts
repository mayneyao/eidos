import type { MarkdownBlockBoundary } from "../../core/block-boundary"
import { $isEfmBlockNode } from "../../nodes/efm-semantic-node"
import { $isEfmSourceBlockNode } from "../../nodes/efm-source-block-node"

export const frontmatterBoundary: MarkdownBlockBoundary = {
  id: "eidos.frontmatter.boundary",
  placement: "start",
  matches: (node) =>
    ($isEfmBlockNode(node) && node.getData().kind === "frontmatter") ||
    ($isEfmSourceBlockNode(node) && node.getKind() === "frontmatter"),
}
