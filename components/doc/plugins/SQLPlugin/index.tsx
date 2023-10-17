import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $insertNodeToNearestRoot } from "@lexical/utils"
import {
  $getSelection,
  $insertNodes,
  COMMAND_PRIORITY_EDITOR,
  LexicalCommand,
  RangeSelection,
  createCommand,
} from "lexical"

import { $createSQLNode, SQLNode } from "../../nodes/SQL"

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
