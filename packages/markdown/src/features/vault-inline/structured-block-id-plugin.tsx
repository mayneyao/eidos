import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $getNodeByKey,
  $getRoot,
  $hasUpdateTag,
  RootNode,
  type NodeKey,
} from "lexical"
import {
  $setStructuredBlockId,
  $structuredBlockId,
} from "./structured-block-id"

export function StructuredBlockIdPlugin() {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    const owners = new Map<string, NodeKey>()
    const elements = new Set<HTMLElement>()
    const unregisterTransform = editor.registerNodeTransform(
      RootNode,
      (root) => {
        for (const node of root.getChildren()) {
          const id = $structuredBlockId(node)
          if (!id) continue
          const key = owners.get(id)
          const owner = key ? $getNodeByKey(key) : null
          const inserted = editor
            .getEditorState()
            .read(() => $getNodeByKey(node.getKey()) === null)
          if (
            inserted &&
            editor.isEditable() &&
            !$hasUpdateTag("eidos-markdown-editor:external") &&
            owner?.isAttached() &&
            owner.getKey() !== node.getKey() &&
            $structuredBlockId(owner) === id
          ) {
            const next = `b-${crypto.randomUUID().replace(/-/gu, "").slice(0, 12)}`
            $setStructuredBlockId(node, next)
            owners.set(next, node.getKey())
          } else if (!owner?.isAttached()) owners.set(id, node.getKey())
        }
      }
    )
    const update = () =>
      editor.getEditorState().read(() => {
        for (const element of elements)
          element.removeAttribute("data-obsidian-block-id")
        elements.clear()
        for (const node of $getRoot().getChildren()) {
          const id = $structuredBlockId(node)
          const element = id ? editor.getElementByKey(node.getKey()) : null
          if (element) {
            element.dataset.obsidianBlockId = id
            elements.add(element)
          }
        }
      })
    const unregisterUpdate = editor.registerUpdateListener(update)
    const unregisterRoot = editor.registerRootListener(update)
    update()
    return () => {
      unregisterTransform()
      unregisterUpdate()
      unregisterRoot()
      for (const element of elements)
        element.removeAttribute("data-obsidian-block-id")
    }
  }, [editor])
  return null
}
