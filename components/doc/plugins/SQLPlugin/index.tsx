import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $insertNodeToNearestRoot } from "@lexical/utils"
import { COMMAND_PRIORITY_EDITOR, LexicalCommand, createCommand } from "lexical"

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
        $insertNodeToNearestRoot(sqlNode)
        return true
      },
      COMMAND_PRIORITY_EDITOR
    )
  }, [editor])

  return <div>
    <button onClick={() => {
      editor.dispatchCommand(INSERT_SQL_COMMAND, "SELECT count(*)  as allCount FROM tb_a0adf70bdb504e7e8dd72a0db9250145")
    }}>
      insert sql
    </button>
  </div>
}
