import {
  $getState,
  $setState,
  createState,
  type ElementNode,
  type LexicalNode,
} from "lexical"
import type { Transformer } from "@lexical/markdown"

export const structuredBlockIdState = createState("markdownStructuredBlockId", {
  parse: (value: unknown) =>
    typeof value === "string" && /^[A-Za-z0-9-]+$/u.test(value) ? value : "",
})

export function $structuredBlockId(node: LexicalNode): string {
  return $getState(node, structuredBlockIdState)
}

export function $setStructuredBlockId(node: LexicalNode, id: string): void {
  $setState(node, structuredBlockIdState, id)
}

/** Attach the suffix to whichever exporter owns the block, without changing it. */
export function withStructuredBlockIds(
  transformers: readonly Transformer[]
): Transformer[] {
  return transformers.map((transformer) => {
    if (
      (transformer.type !== "element" &&
        transformer.type !== "multiline-element") ||
      !transformer.export
    )
      return transformer
    const exportNode = transformer.export
    return {
      ...transformer,
      export: (node: LexicalNode, children: (node: ElementNode) => string) => {
        const markdown = exportNode(node, children)
        const id = $structuredBlockId(node)
        return markdown !== null && id ? `${markdown}\n\n^${id}` : markdown
      },
    }
  })
}
