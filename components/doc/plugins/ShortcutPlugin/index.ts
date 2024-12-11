import { $isListItemNode, ListItemNode, ListNode } from "@lexical/list"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useKeyPress } from "ahooks"
import { $getSelection } from "lexical"

export function ShortcutPlugin() {
  const [editor] = useLexicalComposerContext()

  //   toggle check list
  useKeyPress(
    ["ctrl.Enter", "meta.Enter"],
    (e) => {
      e.stopPropagation()
      editor.update(() => {
        if (!editor.isEditable()) {
          return
        }
        const selection = $getSelection()
        const nodes = selection?.getNodes()
        if (nodes?.length === 1) {
          const node = nodes[0]
          if ($isListItemNode(node)) {
            const parent = node.getParent() as ListNode
            if (parent.getListType() === "check") {
              ; (node as ListItemNode).toggleChecked()
            }
          } else if ($isListItemNode(node.getParent())) {
            const parent = node.getParent() as ListItemNode
            const listNode = parent.getParent() as ListNode
            if (listNode.getListType() === "check") {
              parent.toggleChecked()
            }
          }
        }
      })
    },
    {
      useCapture: true,
    }
  )
  return null
}
