import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $isLinkNode, LinkNode } from "@lexical/link"
import { $getNodeByKey } from "lexical"

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

  useEffect(
    () =>
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
      ),
    [editor]
  )

  return null
}
