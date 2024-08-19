import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $insertNodeToNearestRoot } from "@lexical/utils"
import { COMMAND_PRIORITY_EDITOR, LexicalCommand, createCommand } from "lexical"

import { $createAudioNode, AudioNode } from "../../blocks/audio/node"

export const INSERT_AUDIO_FILE_COMMAND: LexicalCommand<string> = createCommand()

export const AudioPlugin = () => {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        if (!editor.hasNodes([AudioNode])) {
            throw new Error(
                "FilePlugin: AudioNode not registered on editor (initialConfig.nodes)"
            )
        }
        return editor.registerCommand<string>(
            INSERT_AUDIO_FILE_COMMAND,
            (payload) => {
                const audioNode = $createAudioNode(payload)
                $insertNodeToNearestRoot(audioNode)
                return true
            },
            COMMAND_PRIORITY_EDITOR
        )
    }, [editor])

    return null
}
