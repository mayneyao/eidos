import type { MarkdownInlineSyntax } from "../../core/inline-syntax"
import {
  $createEfmInlineNode,
  $isEfmInlineNode,
} from "../../nodes/efm-semantic-node"
import { scanInlineMath } from "./syntax"

export const mathInlineSyntax: MarkdownInlineSyntax = {
  id: "eidos.math.inline",
  scan(source, { protectedRanges }) {
    return scanInlineMath(
      source,
      { start: 0, end: source.length },
      protectedRanges
    )
  },
  import(source) {
    return $createEfmInlineNode({
      kind: "math",
      source,
      value: source.slice(1, -1),
    })
  },
  export(node) {
    return $isEfmInlineNode(node) && node.getData().kind === "math"
      ? node.getData().source
      : null
  },
}
