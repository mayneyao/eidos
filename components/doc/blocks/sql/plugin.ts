import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $getSelection, COMMAND_PRIORITY_EDITOR, LexicalCommand, createCommand } from "lexical"
import { useEffect } from "react"

import { $createSQLNode, SQLNode } from "./node"

export const INSERT_SQL_COMMAND: LexicalCommand<string> = createCommand()

export const SQLPlugin = () => {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        if (!editor.hasNodes([SQLNode])) {
            throw new Error("SQLPlugin: SQLNode not registered on editor")
        }

        return editor.registerCommand<string>(
            INSERT_SQL_COMMAND,
            (payload) => {
                const sqlNode = $createSQLNode(payload)
                editor.update(() => {
                    const selection = $getSelection()
                    if (selection) {
                        selection.insertNodes([sqlNode])
                    }
                })
                return true
            },
            COMMAND_PRIORITY_EDITOR
        )
    }, [editor])

    return null
} 