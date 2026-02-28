import { visit } from "unist-util-visit"
import type { Plugin } from "unified"
import type { Root, Text, Parent } from "mdast"

interface InternalLinkNode {
  type: "internalLink"
  id: string
  title: string
  data?: {
    hName: string
    hProperties: Record<string, any>
  }
}

// Regular expression to match [[ ID | title ]] syntax
const INTERNAL_LINK_REGEX = /\[\[\s*([^\|\]]+)\s*\|\s*([^\]]+)\s*\]\]/g

const remarkInternalLinks: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index?: number, parent?: Parent) => {
      if (!parent || index === undefined) return

      const { value } = node
      const matches = Array.from(value.matchAll(INTERNAL_LINK_REGEX))

      if (matches.length === 0) return

      const newNodes: any[] = []
      let lastIndex = 0

      matches.forEach((match) => {
        const [fullMatch, id, title] = match
        const startIndex = match.index!

        // Add text before the match
        if (startIndex > lastIndex) {
          newNodes.push({
            type: "text",
            value: value.slice(lastIndex, startIndex),
          })
        }

        // Add the internal link node
        newNodes.push({
          type: "internalLink",
          id: id.trim(),
          title: title.trim(),
          data: {
            hName: "internal-link",
            hProperties: {
              "data-id": id.trim(),
              "data-title": title.trim(),
            },
          },
        } as InternalLinkNode)

        lastIndex = startIndex + fullMatch.length
      })

      // Add remaining text after the last match
      if (lastIndex < value.length) {
        newNodes.push({
          type: "text",
          value: value.slice(lastIndex),
        })
      }

      // Replace the original text node with the new nodes
      parent.children.splice(index, 1, ...newNodes)
    })
  }
}

export default remarkInternalLinks
