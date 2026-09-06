import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $createTextNode,
  $getNodeByKey,
  $hasUpdateTag,
  $isParagraphNode,
  $isTextNode,
  ParagraphNode,
  type NodeKey,
} from "lexical"
import { useEffect } from "react"
import { EfmInlineNode, $isEfmInlineNode } from "../../nodes/efm-semantic-node"

/** Retain the original anchor when a paragraph containing it is duplicated. */
export function BlockIdIdentityPlugin() {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    const owners = new Map<string, NodeKey>()
    const unregisterParagraph = editor.registerNodeTransform(
      ParagraphNode,
      (paragraph) => {
        if (!editor.isEditable()) return
        if ($hasUpdateTag("eidos-markdown-editor:external")) {
          return
        }
        for (const marker of paragraph.getChildren()) {
          if (
            !$isEfmInlineNode(marker) ||
            marker.getData().kind !== "obsidian-block-id"
          )
            continue
          const originalKey = editor
            .getEditorState()
            .read(() => $getNodeByKey(marker.getKey())?.getParent()?.getKey())
          const original = originalKey ? $getNodeByKey(originalKey) : null
          // Splitting a paragraph must not move its reference to the new paragraph.
          const owner =
            $isParagraphNode(original) && original.isAttached()
              ? original
              : paragraph
          if (
            marker.getParent() !== owner ||
            marker
              .getNextSiblings()
              .some(
                (next) =>
                  !(
                    $isTextNode(next) && /^\s*$/u.test(next.getTextContent())
                  ) &&
                  (!$isEfmInlineNode(next) ||
                    next.getData().kind !== "obsidian-block-id")
              )
          )
            owner.append(marker)
          const previous = marker.getPreviousSibling()
          if (previous && !/\s$/u.test(previous.getTextContent()))
            marker.insertBefore($createTextNode(" "))
        }
      }
    )
    const unregisterInline = editor.registerNodeTransform(
      EfmInlineNode,
      (node) => {
        const data = node.getData()
        if (data.kind !== "obsidian-block-id" || !data.identifier) return
        if (!editor.isEditable()) return
        const key = owners.get(data.identifier)
        const owner = key ? $getNodeByKey(key) : null
        if ($hasUpdateTag("eidos-markdown-editor:external")) {
          if (!owner?.isAttached()) owners.set(data.identifier, node.getKey())
          return
        }
        if (
          owner &&
          owner.isAttached() &&
          owner.getKey() !== node.getKey() &&
          $isEfmInlineNode(owner) &&
          owner.getData().identifier === data.identifier
        ) {
          const identifier = `b-${crypto.randomUUID().replace(/-/gu, "").slice(0, 12)}`
          node.setData({ ...data, identifier, source: `^${identifier}` })
          owners.set(identifier, node.getKey())
        } else {
          owners.set(data.identifier, node.getKey())
        }
      }
    )
    return () => {
      unregisterInline()
      unregisterParagraph()
    }
  }, [editor])
  return null
}
