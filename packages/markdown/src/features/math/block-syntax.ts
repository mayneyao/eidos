import type { MarkdownBlockSyntax } from "../../core/block-syntax"
import {
  $createEfmBlockNode,
  $isEfmBlockNode,
} from "../../nodes/efm-semantic-node"
import { $createEfmSourceBlockNode } from "../../nodes/efm-source-block-node"
import { scanDisplayMath } from "./syntax"

export const mathBlockSyntax: MarkdownBlockSyntax = {
  id: "eidos.math.block",
  scan(source, { protectedRanges }) {
    const scan = scanDisplayMath(source, protectedRanges)
    return scan.ranges.map((range) => ({
      ...range,
      diagnostics: scan.unterminated
        .filter((opening) => opening.start === range.start)
        .map((opening) => ({
          ...opening,
          code: "efm-math-unterminated",
          severity: "error" as const,
          message:
            "Display mathematics is missing a closing $$ delimiter line.",
        })),
    }))
  },
  import(source) {
    const lines = source.split("\n")
    if (lines.length < 2 || !/^ {0,3}\$\$$/u.test(lines.at(-1) ?? ""))
      return $createEfmSourceBlockNode(source, "math")
    return $createEfmBlockNode({
      kind: "math",
      source,
      value: lines.slice(1, -1).join("\n"),
    })
  },
  export(node) {
    return $isEfmBlockNode(node) && node.getData().kind === "math"
      ? node.getData().source
      : null
  },
}
