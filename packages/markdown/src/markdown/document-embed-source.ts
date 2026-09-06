import { fromMarkdown } from "mdast-util-from-markdown"
import type { Nodes } from "mdast"
import { analyzeEfmMarkdown } from "./efm-document"
import { MARKDOWN_FEATURES } from "../plugin-system/feature-ids"

function text(node: Nodes): string {
  if ("value" in node) return node.value
  if ("children" in node) return node.children.map(text).join("")
  return ""
}

export function markdownReferenceTargets(
  markdown: string
): { target: string; title: string }[] {
  const { segments } = analyzeEfmMarkdown(markdown, {
    syntaxFeatures: new Set(Object.values(MARKDOWN_FEATURES)),
  })
  const targets: { target: string; title: string }[] = []
  const ancestors: { depth: number; title: string }[] = []
  for (const segment of segments) {
    const node = fromMarkdown(segment.source).children[0]
    if (node?.type === "heading") {
      while (ancestors.length && ancestors.at(-1)!.depth >= node.depth)
        ancestors.pop()
      ancestors.push({ depth: node.depth, title: text(node) })
      targets.push({
        target: `#${ancestors.map((entry) => entry.title).join("#")}`,
        title: text(node),
      })
    }
    const id =
      segment.structuredBlockId?.identifier ??
      (node?.type === "paragraph"
        ? /(?:^|\s)\^([A-Za-z0-9-]+)\s*$/u.exec(segment.source)?.[1]
        : undefined)
    if (id)
      targets.push({
        target: `#^${id}`,
        title: `${id} — ${text(node!).replace(/\s+/gu, " ").slice(0, 80)}`,
      })
  }
  return targets
}
