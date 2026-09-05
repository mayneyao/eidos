import { useCallback, useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import type { Transformer } from "@lexical/markdown"
import {
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  type EditorState,
  type LexicalEditor,
} from "lexical"

import type { MarkdownProfileCodec } from "../profile-system/profile-api"
import { useMarkdownShortcuts } from "../shortcuts/shortcut-context"
import type { EfmInputProfile } from "../types"
import {
  EXTERNAL_MARKDOWN_CONFLICT_MESSAGE,
  SOURCE_RANGE_COMMIT_TAG,
  useEfmSourceBlockContext,
} from "../ui/efm-source-block-context"

const EXTERNAL_MARKDOWN_TAG = "eidos-markdown-editor:external"

function readMarkdown(
  editorState: EditorState,
  transformers: readonly Transformer[],
  codec: MarkdownProfileCodec
): string {
  return editorState.read(() => codec.export(transformers))
}

export function MarkdownStatePlugin({
  markdown,
  readOnly,
  onMarkdownChange,
  onSaveRequest,
  onError,
  inputProfile,
  baseUri,
  syntaxFeatures,
  transformers,
  codec,
}: {
  markdown: string
  readOnly: boolean
  onMarkdownChange(markdown: string): void
  onSaveRequest?(markdown: string): void | Promise<void>
  onError(error: Error): void
  inputProfile: EfmInputProfile
  baseUri?: string
  syntaxFeatures: ReadonlySet<string>
  transformers: readonly Transformer[]
  codec: MarkdownProfileCodec
}) {
  const [editor] = useLexicalComposerContext()
  const { matches } = useMarkdownShortcuts()
  const { session, activeDrafts, externalMarkdownConflict } =
    useEfmSourceBlockContext()

  useEffect(() => editor.setEditable(!readOnly), [editor, readOnly])

  useEffect(() => {
    session.setCanonical(
      readMarkdown(editor.getEditorState(), transformers, codec)
    )
  }, [codec, editor, session, transformers])

  useEffect(() => {
    const observation = session.observeExternal(markdown)
    if (observation.newConflict)
      onError(new Error(EXTERNAL_MARKDOWN_CONFLICT_MESSAGE))
    if (observation.importMarkdown === undefined) return
    const nextMarkdown = observation.importMarkdown
    editor.update(
      () => {
        codec.import(nextMarkdown, transformers, {
          inputProfile,
          baseUri,
          syntaxFeatures,
        })
      },
      { discrete: true, tag: EXTERNAL_MARKDOWN_TAG }
    )
    session.setCanonical(
      readMarkdown(editor.getEditorState(), transformers, codec)
    )
  }, [
    activeDrafts,
    baseUri,
    editor,
    externalMarkdownConflict,
    inputProfile,
    markdown,
    onError,
    session,
    syntaxFeatures,
    transformers,
    codec,
  ])

  const handleChange = useCallback(
    (editorState: EditorState, _editor: LexicalEditor, tags: Set<string>) => {
      if (tags.has(EXTERNAL_MARKDOWN_TAG)) return
      const nextCanonical = readMarkdown(editorState, transformers, codec)
      const result = session.commitCanonical(
        nextCanonical,
        tags.has(SOURCE_RANGE_COMMIT_TAG)
      )
      if (result.error) onError(result.error)
      if (result.markdown !== null) onMarkdownChange(result.markdown)
    },
    [session, onMarkdownChange, onError, transformers, codec]
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
        const nextCanonical = readMarkdown(
          editor.getEditorState(),
          transformers,
          codec
        )
        const nextMarkdown = session.previewCanonical(nextCanonical)
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
  }, [
    codec,
    editor,
    matches,
    onError,
    onSaveRequest,
    readOnly,
    session,
    transformers,
  ])

  return <OnChangePlugin ignoreSelectionChange onChange={handleChange} />
}
