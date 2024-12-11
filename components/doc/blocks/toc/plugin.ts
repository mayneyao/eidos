import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { COMMAND_PRIORITY_EDITOR, LexicalCommand, createCommand } from "lexical"
import { useEffect } from "react"

import { $insertDecoratorBlockNode } from "../helper"
import { $createTableOfContentsNode, TableOfContentsNode } from "./node"

export const INSERT_TOC_COMMAND: LexicalCommand<string> = createCommand()

export const TableOfContentsPlugin = () => {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        if (!editor.hasNodes([TableOfContentsNode])) {
            throw new Error("TOCPlugin: TableOfContentsNode not registered on editor")
        }

        return editor.registerCommand<string>(
            INSERT_TOC_COMMAND,
            () => {
                const tocNode = $createTableOfContentsNode()
                $insertDecoratorBlockNode(tocNode)
                return true
            },
            COMMAND_PRIORITY_EDITOR
        )
    }, [editor])

    return null
} 