import type { LexicalNode } from "lexical"

/** Fixed document regions constrain ordinary block movement and insertion. */
export interface MarkdownBlockBoundary {
  id: string
  matches(node: LexicalNode): boolean
  placement: "start" | "end"
}

/** Called in a Lexical read/update. Conflicting claims are configuration errors. */
export function resolveBlockBoundary(
  node: LexicalNode,
  boundaries: readonly MarkdownBlockBoundary[]
): "start" | "end" | null {
  let result: "start" | "end" | null = null
  for (const boundary of boundaries) {
    if (!boundary.matches(node)) continue
    if (result !== null && result !== boundary.placement) {
      throw new Error(
        `Conflicting block boundaries for node "${node.getType()}".`
      )
    }
    result = boundary.placement
  }
  return result
}
