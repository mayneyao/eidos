import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $insertNodeToNearestRoot } from "@lexical/utils"
import { COMMAND_PRIORITY_EDITOR, LexicalCommand, createCommand } from "lexical"

import { $createFileNode, FileNode } from "./node"

export const INSERT_FILE_COMMAND: LexicalCommand<{ src: string, fileName: string }> = createCommand()

export const FilePlugin = () => {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        if (!editor.hasNodes([FileNode])) {
            throw new Error(
                "FilePlugin: FileNode not registered on editor (initialConfig.nodes)"
            )
        }
        return editor.registerCommand<{ src: string, fileName: string }>(
            INSERT_FILE_COMMAND,
            (payload) => {
                const fileNode = $createFileNode(payload)
                $insertNodeToNearestRoot(fileNode)
                return true
            },
            COMMAND_PRIORITY_EDITOR
        )
    }, [editor])

    return null
}