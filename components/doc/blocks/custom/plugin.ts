import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { COMMAND_PRIORITY_EDITOR, LexicalCommand, createCommand } from "lexical"
import { useEffect } from "react"

import { $insertDecoratorBlockNode } from "../helper"
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
                $insertDecoratorBlockNode(customBlockNode)
                return true
            },
            COMMAND_PRIORITY_EDITOR
        )
    }, [editor])

    return null
}
