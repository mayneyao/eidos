import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $insertNodeToNearestRoot } from "@lexical/utils"
import { COMMAND_PRIORITY_EDITOR, LexicalCommand, createCommand } from "lexical"
import { $createVideoNode, VideoNode } from "./node"


export const INSERT_VIDEO_FILE_COMMAND: LexicalCommand<string> = createCommand()

export const VideoPlugin = () => {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!editor.hasNodes([VideoNode])) {
      throw new Error(
        "VideoPlugin: VideoNode not registered on editor (initialConfig.nodes)"
      )
    }
    return editor.registerCommand<string>(
      INSERT_VIDEO_FILE_COMMAND,
      (payload) => {
        const VideoNode = $createVideoNode(payload)
        $insertNodeToNearestRoot(VideoNode)
        return true
      },
      COMMAND_PRIORITY_EDITOR
    )
  }, [editor])

  return null
}
