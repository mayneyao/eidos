import {
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $isElementNode,
  $isParagraphNode,
  type LexicalNode,
  type NodeKey,
} from "lexical"
import {
  $createEfmInlineNode,
  $isEfmInlineNode,
} from "../../nodes/efm-semantic-node"

function descendants(node: LexicalNode): LexicalNode[] {
  return $isElementNode(node)
    ? node.getChildren().flatMap((child) => [child, ...descendants(child)])
    : []
}

/** Must run inside an editor update. Only standalone paragraphs are eligible. */
export function $prepareParagraphBlockId(key: NodeKey): string | null {
  const paragraph = $getNodeByKey(key)
  if (!$isParagraphNode(paragraph) || paragraph.getParent() !== $getRoot())
    return null
  const existing = paragraph
    .getChildren()
    .find(
      (node) =>
        $isEfmInlineNode(node) && node.getData().kind === "obsidian-block-id"
    )
  if (existing && $isEfmInlineNode(existing)) {
    const data = existing.getData()
    if (data.kind === "obsidian-block-id" && data.identifier)
      return data.identifier
  }
  const ids = new Set(
    descendants($getRoot()).flatMap((node) => {
      const data = $isEfmInlineNode(node) ? node.getData() : null
      return data?.kind === "obsidian-block-id" ? [data.identifier] : []
    })
  )
  let identifier: string
  do {
    identifier = `b-${crypto.randomUUID().replace(/-/gu, "").slice(0, 12)}`
  } while (ids.has(identifier))
  return identifier
}

export function $ensureParagraphBlockId(
  key: NodeKey,
  preparedId?: string
): string | null {
  const identifier = preparedId ?? $prepareParagraphBlockId(key)
  const paragraph = $getNodeByKey(key)
  if (
    !identifier ||
    !$isParagraphNode(paragraph) ||
    paragraph.getParent() !== $getRoot()
  )
    return null
  const existing = paragraph
    .getChildren()
    .find(
      (node) =>
        $isEfmInlineNode(node) && node.getData().kind === "obsidian-block-id"
    )
  if (existing && $isEfmInlineNode(existing))
    return existing.getData().identifier ?? null
  if (paragraph.getTextContent() && !/\s$/u.test(paragraph.getTextContent()))
    paragraph.append($createTextNode(" "))
  paragraph.append(
    $createEfmInlineNode({
      kind: "obsidian-block-id",
      source: `^${identifier}`,
      identifier,
    })
  )
  return identifier
}

export function blockReferenceMarkdown(
  path: string | undefined,
  identifier: string
): string {
  if (!path) return `[[#^${identifier}]]`
  if (/[\[\]\r\n#|\\]/u.test(path))
    throw new Error("This document path cannot be represented as a wiki link.")
  return `[[${path.startsWith("/") ? path : `/${path}`}#^${identifier}]]`
}
