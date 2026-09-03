import { fromMarkdown } from "mdast-util-from-markdown"
import { gfmFromMarkdown } from "mdast-util-gfm"

interface DefinitionNode {
  type: "definition"
  identifier: string
  label?: string | null
  title?: string | null
  url: string
}

interface MarkdownRoot {
  children?: unknown[]
}

export interface ParsedReferenceDefinition {
  destination: string
  identifier: string
  label: string
  title?: string
}

export function normalizeMarkdownIdentifier(identifier: string): string {
  return identifier.trim().replace(/\s+/gu, " ").toLowerCase()
}

export function parseReferenceDefinitionSource(
  source: string
): ParsedReferenceDefinition | null {
  const root = fromMarkdown(source, {
    mdastExtensions: [gfmFromMarkdown()],
  }) as MarkdownRoot
  if (root.children?.length !== 1) return null
  const node = root.children[0] as Partial<DefinitionNode>
  if (
    node.type !== "definition" ||
    typeof node.identifier !== "string" ||
    typeof node.url !== "string"
  ) {
    return null
  }
  return {
    destination: node.url,
    identifier: normalizeMarkdownIdentifier(node.identifier),
    label: node.label ?? node.identifier,
    ...(node.title ? { title: node.title } : {}),
  }
}
