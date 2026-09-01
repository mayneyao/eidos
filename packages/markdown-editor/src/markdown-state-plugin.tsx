import { useCallback, useEffect, useRef } from "react"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import {
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  type EditorState,
  type LexicalEditor,
} from "lexical"

import { EIDOS_MARKDOWN_TRANSFORMERS } from "./markdown-transformers"

const EXTERNAL_MARKDOWN_TAG = "eidos-markdown-editor:external"

function readMarkdown(editorState: EditorState): string {
  return editorState.read(() =>
    $convertToMarkdownString([...EIDOS_MARKDOWN_TRANSFORMERS])
  )
}

export function MarkdownStatePlugin({
  markdown,
  readOnly,
  onMarkdownChange,
  onSaveRequest,
  onError,
}: {
  markdown: string
  readOnly: boolean
  onMarkdownChange(markdown: string): void
  onSaveRequest?(markdown: string): void | Promise<void>
  onError(error: Error): void
}) {
  const [editor] = useLexicalComposerContext()
  const acceptedMarkdownRef = useRef(markdown)

  useEffect(() => editor.setEditable(!readOnly), [editor, readOnly])

  useEffect(() => {
    if (markdown === acceptedMarkdownRef.current) return
    acceptedMarkdownRef.current = markdown
    editor.update(
      () => {
        $convertFromMarkdownString(
          markdown,
          [...EIDOS_MARKDOWN_TRANSFORMERS],
          undefined,
          false,
          true
        )
      },
      { tag: EXTERNAL_MARKDOWN_TAG }
    )
  }, [editor, markdown])

  const handleChange = useCallback(
    (editorState: EditorState, _editor: LexicalEditor, tags: Set<string>) => {
      if (tags.has(EXTERNAL_MARKDOWN_TAG)) return
      const nextMarkdown = readMarkdown(editorState)
      if (nextMarkdown === acceptedMarkdownRef.current) return
      acceptedMarkdownRef.current = nextMarkdown
      onMarkdownChange(nextMarkdown)
    },
    [onMarkdownChange]
  )

  useEffect(() => {
    if (!onSaveRequest) return
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (
          readOnly ||
          event.altKey ||
          !(event.metaKey || event.ctrlKey) ||
          event.key.toLowerCase() !== "s"
        ) {
          return false
        }
        event.preventDefault()
        const nextMarkdown = readMarkdown(editor.getEditorState())
        acceptedMarkdownRef.current = nextMarkdown
        try {
          void Promise.resolve(onSaveRequest(nextMarkdown)).catch((cause) =>
            onError(cause instanceof Error ? cause : new Error(String(cause)))
          )
        } catch (cause) {
          onError(cause instanceof Error ? cause : new Error(String(cause)))
        }
        return true
      },
      COMMAND_PRIORITY_HIGH
    )
  }, [editor, onError, onSaveRequest, readOnly])

  return <OnChangePlugin ignoreSelectionChange onChange={handleChange} />
}
