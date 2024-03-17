import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
    $getSelection,
    COMMAND_PRIORITY_EDITOR,
    KEY_ESCAPE_COMMAND,
    LexicalCommand,
    createCommand,
} from "lexical"
import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"

import {
    useInitWebLLMWorker
} from "@/components/ai-chat/webllm/hooks"

import { AITools } from "./ai-tools"

export const INSERT_AI_COMMAND: LexicalCommand<string> =
  createCommand("INSERT_AI_COMMAND")

export const AIToolsPlugin = (props: any) => {
  const [showCommentInput, setShowCommentInput] = useState(false)
  const [editor] = useLexicalComposerContext()
  const [content, setContent] = useState("")

  const { reload } = useInitWebLLMWorker()
  useEffect(() => {
    reload("gemma-2b-it-q4f16_1")
  }, [reload])

  const cancelAIAction = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection()
      // Restore selection
      if (selection !== null) {
        selection.dirty = true
      }
    })
    setShowCommentInput(false)
  }, [editor])

  useEffect(() => {
    return editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      (event: KeyboardEvent) => {
        event.preventDefault()
        cancelAIAction()
        return true
      },
      2
    )
  }, [cancelAIAction, editor])

  useEffect(() => {
    return editor.registerCommand(
      INSERT_AI_COMMAND,
      (content) => {
        setShowCommentInput(true)
        setContent(content)
        const domSelection = window.getSelection()
        if (domSelection !== null) {
          domSelection.removeAllRanges()
        }
        return true
      },
      COMMAND_PRIORITY_EDITOR
    )
  }, [editor])

  return (
    <div>
      {showCommentInput &&
        createPortal(
          <AITools cancelAIAction={cancelAIAction} content={content} />,
          document.body
        )}
    </div>
  )
}
