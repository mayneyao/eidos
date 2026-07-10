import { markdownHeadingSlug } from "@eidos.space/file-space/markdown"

interface MarkdownNode {
  type: string
  value?: string
  alt?: string
  children?: MarkdownNode[]
  data?: {
    hProperties?: Record<string, unknown>
    [key: string]: unknown
  }
}

function isMarkdownNode(value: unknown): value is MarkdownNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  )
}

function nodeText(node: MarkdownNode): string {
  if (typeof node.value === "string") return node.value
  if (typeof node.alt === "string") return node.alt
  return node.children?.map(nodeText).join("") ?? ""
}

export function remarkHeadingIds() {
  return (tree: unknown) => {
    if (!isMarkdownNode(tree)) return
    const counts = new Map<string, number>()

    const visit = (node: MarkdownNode) => {
      if (node.type === "heading") {
        const text = nodeText(node)
        const base = markdownHeadingSlug(text)
        const occurrence = counts.get(base) ?? 0
        counts.set(base, occurrence + 1)
        node.data = {
          ...node.data,
          hProperties: {
            ...node.data?.hProperties,
            id: markdownHeadingSlug(text, occurrence),
          },
        }
      }
      node.children?.forEach(visit)
    }

    visit(tree)
  }
}
