import { useCallback, useEffect, useRef } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import type { Transformer } from "@lexical/markdown"
import {
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  type EditorState,
  type LexicalEditor,
} from "lexical"

import {
  $convertFromEfmMarkdownString,
  $convertToEfmMarkdownString,
} from "../markdown/efm-document"
import { preserveMarkdownSourceEdits } from "../markdown/source-fidelity"
import { useMarkdownShortcuts } from "../shortcuts/shortcut-context"
import type { EfmInputProfile } from "../types"
import {
  EXTERNAL_MARKDOWN_CONFLICT_MESSAGE,
  useEfmSourceBlockContext,
} from "../ui/efm-source-block-context"

const EXTERNAL_MARKDOWN_TAG = "eidos-markdown-editor:external"

function readMarkdown(
  editorState: EditorState,
  transformers: readonly Transformer[]
): string {
  return editorState.read(() => $convertToEfmMarkdownString(transformers))
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
}) {
  const [editor] = useLexicalComposerContext()
  const { matches } = useMarkdownShortcuts()
  const {
    activeDrafts,
    externalMarkdownConflict,
    setExternalMarkdownConflict,
  } = useEfmSourceBlockContext()
  const acceptedMarkdownRef = useRef(markdown)
  const canonicalMarkdownRef = useRef<string | null>(null)
  const observedMarkdownPropRef = useRef(markdown)
  const pendingExternalMarkdownRef = useRef<string | null>(null)
  const suppressedExternalMarkdownRef = useRef<string | null>(null)

  useEffect(() => editor.setEditable(!readOnly), [editor, readOnly])

  useEffect(() => {
    canonicalMarkdownRef.current = readMarkdown(
      editor.getEditorState(),
      transformers
    )
  }, [editor, transformers])

  useEffect(() => {
    const propChanged = markdown !== observedMarkdownPropRef.current
    observedMarkdownPropRef.current = markdown

    if (markdown === acceptedMarkdownRef.current) {
      pendingExternalMarkdownRef.current = null
      suppressedExternalMarkdownRef.current = null
      if (externalMarkdownConflict) setExternalMarkdownConflict(false)
      return
    }
    if (activeDrafts > 0) {
      if (markdown === suppressedExternalMarkdownRef.current) return
      pendingExternalMarkdownRef.current = markdown
      if (!externalMarkdownConflict) {
        setExternalMarkdownConflict(true)
        onError(new Error(EXTERNAL_MARKDOWN_CONFLICT_MESSAGE))
      }
      return
    }

    const pendingMarkdown = pendingExternalMarkdownRef.current
    if (!propChanged && pendingMarkdown === null) return
    const nextMarkdown = pendingMarkdown ?? markdown
    pendingExternalMarkdownRef.current = null
    if (externalMarkdownConflict) setExternalMarkdownConflict(false)
    acceptedMarkdownRef.current = nextMarkdown
    editor.update(
      () => {
        $convertFromEfmMarkdownString(nextMarkdown, transformers, {
          inputProfile,
          baseUri,
          syntaxFeatures,
        })
      },
      { discrete: true, tag: EXTERNAL_MARKDOWN_TAG }
    )
    canonicalMarkdownRef.current = readMarkdown(
      editor.getEditorState(),
      transformers
    )
  }, [
    activeDrafts,
    baseUri,
    editor,
    externalMarkdownConflict,
    inputProfile,
    markdown,
    onError,
    setExternalMarkdownConflict,
    syntaxFeatures,
    transformers,
  ])

  const handleChange = useCallback(
    (editorState: EditorState, _editor: LexicalEditor, tags: Set<string>) => {
      if (tags.has(EXTERNAL_MARKDOWN_TAG)) return
      const nextCanonical = readMarkdown(editorState, transformers)
      const canonicalBefore = canonicalMarkdownRef.current
      const nextMarkdown = canonicalBefore
        ? preserveMarkdownSourceEdits(
            acceptedMarkdownRef.current,
            canonicalBefore,
            nextCanonical
          )
        : nextCanonical
      canonicalMarkdownRef.current = nextCanonical
      if (nextMarkdown === acceptedMarkdownRef.current) return
      pendingExternalMarkdownRef.current = null
      if (externalMarkdownConflict) {
        suppressedExternalMarkdownRef.current = observedMarkdownPropRef.current
      }
      if (externalMarkdownConflict) setExternalMarkdownConflict(false)
      acceptedMarkdownRef.current = nextMarkdown
      onMarkdownChange(nextMarkdown)
    },
    [
      externalMarkdownConflict,
      onMarkdownChange,
      setExternalMarkdownConflict,
      transformers,
    ]
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
          transformers
        )
        const canonicalBefore = canonicalMarkdownRef.current
        const nextMarkdown = canonicalBefore
          ? preserveMarkdownSourceEdits(
              acceptedMarkdownRef.current,
              canonicalBefore,
              nextCanonical
            )
          : nextCanonical
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
  }, [editor, matches, onError, onSaveRequest, readOnly, transformers])

  return <OnChangePlugin ignoreSelectionChange onChange={handleChange} />
}
