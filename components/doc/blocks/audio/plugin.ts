import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $insertNodeToNearestRoot } from "@lexical/utils"
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_EDITOR, LexicalCommand, createCommand } from "lexical"

import { $createAudioNode, AudioNode } from "../../blocks/audio/node"
import { getSelectedNode } from "../../utils/getSelectedNode"
import { $isListItemNode } from "@lexical/list"
import { $insertDecoratorBlockNode } from "../helper"

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
                $insertDecoratorBlockNode(audioNode)
                return true
            },
            COMMAND_PRIORITY_EDITOR
        )
    }, [editor])

    return null
}
