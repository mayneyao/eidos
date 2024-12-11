import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $insertNodeToNearestRoot } from "@lexical/utils"
import { COMMAND_PRIORITY_EDITOR, LexicalCommand, createCommand } from "lexical"

import { $createSyncBlockNode, SyncBlockNode } from "./node"

export const INSERT_SYNC_BLOCK_COMMAND: LexicalCommand<string> = createCommand()

export const SyncBlockPlugin = () => {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor.hasNodes([SyncBlockNode])) {
      throw new Error("SyncBlockPlugin: SyncBlockNode not registered on editor")
    }

    return editor.registerCommand<string>(
      INSERT_SYNC_BLOCK_COMMAND,
      (payload) => {
        const syncBlockNode = $createSyncBlockNode(payload)
        $insertNodeToNearestRoot(syncBlockNode)
        return true
      },
      COMMAND_PRIORITY_EDITOR
    )
  }, [editor])

  return null
} 