import { useEffect } from "react"
import { ListItemNode, ListNode } from "@lexical/list"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $getNodeByKey } from "lexical"

export type TodoListItem = {
  text: string | undefined
  checked: boolean | undefined
  nodeKey: string
  listNodeKey: string
}

interface TodoPluginProps {
  onItemUpdate?: (item: TodoListItem) => void
  onItemAdded?: (item: TodoListItem) => void
  onItemRemoved?: (item: TodoListItem) => void
  deleteByListId?: (listId: string) => void
}

export function TodoPlugin(props: TodoPluginProps) {
  const { onItemAdded, onItemRemoved, onItemUpdate, deleteByListId } = props
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerMutationListener(ListItemNode, (mutatedNodes) => {
      editor.getEditorState().read(() => {
        // mutatedNodes is a Map where each key is the NodeKey, and the value is the state of mutation.
        for (let [nodeKey, mutation] of mutatedNodes) {
          const node = $getNodeByKey(nodeKey) as ListItemNode | undefined
          const listNode = node?.getParent()
          const listType = listNode?.getType()
          if (listType === "check") {
            const checked = node?.getChecked()
            const text = node?.getTextContent()
            const item: TodoListItem = {
              text,
              checked,
              nodeKey,
              listNodeKey: listNode?.getKey() ?? "",
            }
            switch (mutation) {
              case "created":
                console.log("created", item)
                onItemAdded?.(item)
                break
              case "updated":
                onItemUpdate?.(item)
                break
              case "destroyed":
                onItemRemoved?.(item)
                break
            }
          }
        }
      })
    })
  }, [editor, onItemAdded, onItemRemoved, onItemUpdate])

  useEffect(() => {
    return editor.registerMutationListener(ListNode, (mutatedNodes) => {
      editor.getEditorState().read(() => {
        for (let [nodeKey, mutation] of mutatedNodes) {
          if (mutation === "destroyed") {
            deleteByListId?.(nodeKey)
          }
        }
      })
    })
  }, [editor, deleteByListId])

  return null
}
