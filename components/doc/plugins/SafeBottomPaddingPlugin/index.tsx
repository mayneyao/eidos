import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $insertNodeToNearestRoot } from "@lexical/utils"
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
      className="h-12 w-full"
      role="safe-bottom-padding"
      onClick={inertPlaceholder}
    ></div>
  )
}