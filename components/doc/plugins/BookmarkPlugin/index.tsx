import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $insertNodeToNearestRoot,
  mergeRegister
} from "@lexical/utils"
import {
  COMMAND_PRIORITY_EDITOR,
  LexicalCommand,
  createCommand
} from "lexical"
import { useEffect } from "react"

import {
  $createBookmarkNode,
  BookmarkNode,
  BookmarkPayload,
} from "../../nodes/BookmarkNode"

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
          const BookmarkNode = $createBookmarkNode(payload)
          $insertNodeToNearestRoot(BookmarkNode)
          return true
        },
        COMMAND_PRIORITY_EDITOR
      )
    )
  }, [captionsEnabled, editor])

  return null
}
