import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
// import { $insertNodeToNearestRoot } from "@lexical/utils"
import {
  $createParagraphNode,
  $insertNodes,
  COMMAND_PRIORITY_EDITOR,
  LexicalCommand,
  createCommand,
} from "lexical"

export const INSERT_NEW_PARAGRAPH_COMMAND: LexicalCommand<void> =
  createCommand()

export const SafeBottomPaddingPlugin = () => {
  const [editor] = useLexicalComposerContext()

  const inertPlaceholder = () => {
    // there is still a bug here, disable now
    return
    // disable inert placeholder when editor is empty
    if (editor.getEditorState().isEmpty()) {
      return
    }
    editor.dispatchCommand(INSERT_NEW_PARAGRAPH_COMMAND, undefined)
  }
  useEffect(() => {
    return editor.registerCommand<string>(
      INSERT_NEW_PARAGRAPH_COMMAND,
      (payload) => {
        const newParagraphNode = $createParagraphNode()
        $insertNodes([newParagraphNode])
        return true
      },
      COMMAND_PRIORITY_EDITOR
    )
  }, [editor])

  return (
    <div
      className="h-56 w-full"
      role="safe-bottom-padding"
      onClick={inertPlaceholder}
    ></div>
  )
}
