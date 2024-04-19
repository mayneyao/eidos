import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $insertNodes,
  COMMAND_PRIORITY_EDITOR,
  LexicalCommand,
  createCommand,
} from "lexical"
import { useEffect } from "react"

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
        $insertNodes([DatabaseNode])
        return true
      },
      COMMAND_PRIORITY_EDITOR
    )
  }, [editor])

  return null
}
