import { useEffect } from "react"
import { $isListItemNode, ListItemNode } from "@lexical/list"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $insertNodeToNearestRoot, mergeRegister } from "@lexical/utils"
import {
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  LexicalCommand,
  createCommand,
} from "lexical"

import {
  $createBookmarkNode,
  BookmarkNode,
  BookmarkPayload,
} from "../../nodes/BookmarkNode"
import { getSelectedNode } from "../../utils/getSelectedNode"

export type InsertBookmarkPayload = Readonly<BookmarkPayload>

export const INSERT_BOOKMARK_COMMAND: LexicalCommand<InsertBookmarkPayload> =
  createCommand("INSERT_BOOKMARK_COMMAND")

export function BookmarkPlugin({
  captionsEnabled,
}: {
  captionsEnabled?: boolean
}): JSX.Element | null {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor.hasNodes([BookmarkNode])) {
      throw new Error("BookmarkPlugin: BookmarkNode not registered on editor")
    }
    return mergeRegister(
      editor.registerCommand<InsertBookmarkPayload>(
        INSERT_BOOKMARK_COMMAND,
        (payload) => {
          const selection = $getSelection()
          const bookmarkNode = $createBookmarkNode(payload)
          if ($isRangeSelection(selection)) {
            // $insertNodes([bookmarkNode])
            const node = getSelectedNode(selection)
            if ($isListItemNode(node)) {
              node.append(bookmarkNode)
            } else {
              $insertNodeToNearestRoot(bookmarkNode)
            }
          } else {
            $insertNodeToNearestRoot(bookmarkNode)
          }
          return true
        },
        COMMAND_PRIORITY_EDITOR
      )
    )
  }, [captionsEnabled, editor])

  return null
}
