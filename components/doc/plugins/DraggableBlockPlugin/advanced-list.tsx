import { useEffect } from "react"
import { $isListNode, ListItemNode, ListNode } from "@lexical/list"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"

export default function AdvancedListPlugin() {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    const unregisterListNodeTransform = editor.registerNodeTransform(
      ListNode,
      (node) => {
        //   if listNode has no children, remove it
        if (node.getFirstChild() === null) {
          editor.update(() => {
            node.remove()
          })
        }
      }
    )
    // const unregisterListItemNodeTransform = editor.registerNodeTransform(
    //   ListItemNode,
    //   (node) => {
    //     const firstChild = node.getFirstChild()
    //     if ($isListNode(firstChild)) {
    //       editor.update(() => {
    //         node.remove()
    //       })
    //     }
    //   }
    // )
    return () => {
      unregisterListNodeTransform()
      // unregisterListItemNodeTransform()
    }
  }, [])
  return null
}
