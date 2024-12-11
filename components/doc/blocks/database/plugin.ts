import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_EDITOR, LexicalCommand, createCommand } from "lexical"
import { useEffect } from "react"
import { $createDatabaseTableNode, DatabaseTableNode } from "./node"
import { $isListItemNode } from "@lexical/list"
import { getSelectedNode } from "../../utils/getSelectedNode"
import { $insertNodeToNearestRoot } from "@lexical/utils"

export const INSERT_DATABASE_TABLE_COMMAND: LexicalCommand<{ id: string }> =
    createCommand("INSERT_DATABASE_TABLE_COMMAND")

export const DatabaseTablePlugin = () => {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        if (!editor.hasNodes([DatabaseTableNode])) {
            throw new Error("DatabaseTablePlugin: DatabaseTableNode not registered on editor")
        }

        return editor.registerCommand<{ id: string }>(
            INSERT_DATABASE_TABLE_COMMAND,
            (payload) => {
                const selection = $getSelection()
                const databaseTableNode = $createDatabaseTableNode(payload.id)
                if ($isRangeSelection(selection)) {
                    const node = getSelectedNode(selection)
                    if ($isListItemNode(node)) {
                        node.append(databaseTableNode)
                    } else {
                        $insertNodeToNearestRoot(databaseTableNode)
                    }
                } else {
                    $insertNodeToNearestRoot(databaseTableNode)
                }
                return true
            },
            COMMAND_PRIORITY_EDITOR
        )
    }, [editor])

    return null
} 