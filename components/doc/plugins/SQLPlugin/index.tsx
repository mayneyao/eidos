import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $insertNodes,
  COMMAND_PRIORITY_EDITOR,
  LexicalCommand,
  createCommand
} from "lexical"
import { useEffect } from "react"

import { $createSQLNode, SQLNode } from "../../nodes/SQLNode"

export const INSERT_SQL_COMMAND: LexicalCommand<string> = createCommand()

export const SQLPlugin = () => {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor.hasNodes([SQLNode])) {
      throw new Error(
        "SQLPlugin: SQLNode not registered on editor (initialConfig.nodes)"
      )
    }

    return editor.registerCommand<string>(
      INSERT_SQL_COMMAND,
      (payload) => {
        const sqlNode = $createSQLNode(payload)
        $insertNodes([sqlNode])
        return true
      },
      COMMAND_PRIORITY_EDITOR
    )
  }, [editor])

  return null
}
