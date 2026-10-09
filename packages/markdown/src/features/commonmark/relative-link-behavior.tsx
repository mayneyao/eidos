import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $isLinkNode, LinkNode } from "@lexical/link"
import { $getNodeByKey, TextNode } from "lexical"
import type { LinkNode as Link } from "@lexical/link"
import { mergeRegister } from "@lexical/utils"
import {
  $editableAutolinkDestination,
  $isEditableAutolink,
} from "./editable-autolink"

/** Only restore relative destinations; leave URL scheme sanitization to Lexical. */
export function isRelativeMarkdownDestination(destination: string): boolean {
  const target = destination.trim()
  return (
    target.length > 0 &&
    !/[\u0000-\u001f\u007f\\]/u.test(target) &&
    !target.startsWith("//") &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(target)
  )
}

/** Markdown paths must not acquire Lexical's automatic https:// prefix. */
export function RelativeLinkBehavior() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const updateAutolink = (node: Link) => {
      if (!$isEditableAutolink(node)) return
      const destination = $editableAutolinkDestination(node)
      if (!destination) {
        for (const child of node.getChildren()) node.insertBefore(child)
        node.remove()
      } else if (destination !== node.getURL()) node.setURL(destination)
    }
    return mergeRegister(
      editor.registerNodeTransform(LinkNode, updateAutolink),
      editor.registerNodeTransform(TextNode, (node) => {
        const parent = node.getParent()
        if ($isLinkNode(parent)) updateAutolink(parent)
      }),
      editor.registerMutationListener(
        LinkNode,
        (mutations) => {
          editor.getEditorState().read(() => {
            for (const [key, mutation] of mutations) {
              if (mutation === "destroyed") continue
              const node = $getNodeByKey(key)
              if (!$isLinkNode(node)) continue
              const destination = node.getURL()
              if (!isRelativeMarkdownDestination(destination)) continue
              const element = editor.getElementByKey(key)
              if (element instanceof HTMLAnchorElement) {
                element.setAttribute("href", destination)
              }
            }
          })
        },
        { skipInitialization: false }
      )
    )
  }, [editor])

  return null
}
