import { useCallback, useEffect, useRef } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import {
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  type EditorState,
  type LexicalEditor,
} from "lexical"

import { EIDOS_MARKDOWN_TRANSFORMERS } from "../markdown/markdown-transformers"
import {
  $convertFromEfmMarkdownString,
  $convertToEfmMarkdownString,
} from "../markdown/efm-document"
import { useMarkdownShortcuts } from "../shortcuts/shortcut-context"
import type { EfmInputProfile } from "../types"

const EXTERNAL_MARKDOWN_TAG = "eidos-markdown-editor:external"

function readMarkdown(editorState: EditorState): string {
  return editorState.read(() =>
    $convertToEfmMarkdownString(EIDOS_MARKDOWN_TRANSFORMERS)
  )
}

export function MarkdownStatePlugin({
  markdown,
  readOnly,
  onMarkdownChange,
  onSaveRequest,
  onError,
  inputProfile,
  baseUri,
}: {
  markdown: string
  readOnly: boolean
  onMarkdownChange(markdown: string): void
  onSaveRequest?(markdown: string): void | Promise<void>
  onError(error: Error): void
  inputProfile: EfmInputProfile
  baseUri?: string
}) {
  const [editor] = useLexicalComposerContext()
  const { matches } = useMarkdownShortcuts()
  const acceptedMarkdownRef = useRef(markdown)

  useEffect(() => editor.setEditable(!readOnly), [editor, readOnly])

  useEffect(() => {
    if (markdown === acceptedMarkdownRef.current) return
    acceptedMarkdownRef.current = markdown
    editor.update(
      () => {
        $convertFromEfmMarkdownString(markdown, EIDOS_MARKDOWN_TRANSFORMERS, {
          inputProfile,
          baseUri,
        })
      },
      { tag: EXTERNAL_MARKDOWN_TAG }
    )
  }, [baseUri, editor, inputProfile, markdown])

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
        if (readOnly || !matches(event, "document.save")) {
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
  }, [editor, matches, onError, onSaveRequest, readOnly])

  return <OnChangePlugin ignoreSelectionChange onChange={handleChange} />
}
