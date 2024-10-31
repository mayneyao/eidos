import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $insertNodeToNearestRoot } from "@lexical/utils"
import { COMMAND_PRIORITY_EDITOR, LexicalCommand, createCommand } from "lexical"

import { $createCustomBlockNode, CustomBlockNode } from "./node"

export const INSERT_CUSTOM_BLOCK_COMMAND: LexicalCommand<string> = createCommand()

export const CustomBlockPlugin = () => {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        if (!editor.hasNodes([CustomBlockNode])) {
            throw new Error(
                "FilePlugin: CustomBlockNode not registered on editor (initialConfig.nodes)"
            )
        }
        return editor.registerCommand<string>(
            INSERT_CUSTOM_BLOCK_COMMAND,
            (payload) => {
                const customBlockNode = $createCustomBlockNode(payload)
                $insertNodeToNearestRoot(customBlockNode)
                return true
            },
            COMMAND_PRIORITY_EDITOR
        )
    }, [editor])

    return null
}
