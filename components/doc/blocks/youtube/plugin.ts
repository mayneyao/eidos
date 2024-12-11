import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { COMMAND_PRIORITY_EDITOR, LexicalCommand, createCommand } from "lexical"
import { useEffect } from "react"

import { $insertDecoratorBlockNode } from "../helper"
import { $createYouTubeNode, YouTubeNode } from "./node"

export const INSERT_YOUTUBE_COMMAND: LexicalCommand<{ videoId: string }> =
    createCommand("INSERT_YOUTUBE_COMMAND")

export const YouTubePlugin = () => {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        if (!editor.hasNodes([YouTubeNode])) {
            throw new Error("YouTubePlugin: YouTubeNode not registered on editor")
        }

        return editor.registerCommand<{ videoId: string }>(
            INSERT_YOUTUBE_COMMAND,
            (payload) => {
                const youtubeNode = $createYouTubeNode(payload.videoId)
                $insertDecoratorBlockNode(youtubeNode)
                return true
            },
            COMMAND_PRIORITY_EDITOR
        )
    }, [editor])

    return null
} 