import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $insertNodeToNearestRoot } from "@lexical/utils"
import { COMMAND_PRIORITY_EDITOR, LexicalCommand, createCommand } from "lexical"

import {
  $createDatabaseTableNode,
  DatabaseTableNode,
} from "../../nodes/DatabaseTableNode"

export const INSERT_DATABASE_TABLE_COMMAND: LexicalCommand<string> =
  createCommand()

export const DatabasePlugin = () => {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor.hasNodes([DatabaseTableNode])) {
      throw new Error(
        "DatabasePlugin: DatabaseTableNode not registered on editor (initialConfig.nodes)"
      )
    }

    return editor.registerCommand<string>(
      INSERT_DATABASE_TABLE_COMMAND,
      (payload) => {
        const DatabaseNode = $createDatabaseTableNode(payload)
        $insertNodeToNearestRoot(DatabaseNode)
        return true
      },
      COMMAND_PRIORITY_EDITOR
    )
  }, [editor])

  return null
}
