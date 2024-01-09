import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $insertNodes,
  COMMAND_PRIORITY_EDITOR,
  LexicalCommand,
  createCommand,
} from "lexical"

import {
  $createTableOfContentsNode,
  TableOfContentsNode,
} from "../../nodes/TableOfContentsNode"

export const INSERT_TOC_COMMAND: LexicalCommand<string | undefined> =
  createCommand()

export const TableOfContentsPlugin = () => {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor.hasNodes([TableOfContentsNode])) {
      throw new Error(
        "SQLPlugin: SQLNode not registered on editor (initialConfig.nodes)"
      )
    }

    return editor.registerCommand<string>(
      INSERT_TOC_COMMAND,
      (payload) => {
        const sqlNode = $createTableOfContentsNode()
        $insertNodes([sqlNode])
        return true
      },
      COMMAND_PRIORITY_EDITOR
    )
  }, [editor])

  return null
}
