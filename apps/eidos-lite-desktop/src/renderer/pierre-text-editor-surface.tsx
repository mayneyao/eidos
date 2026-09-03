import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ClipboardEvent,
} from "react"
import { Editor, type EditorOptions } from "@pierre/diffs/edit"
import { EditProvider, File, Virtualizer } from "@pierre/diffs/react"
import {
  markdownImageSource,
  type MarkdownEditorPasteImageHandler,
} from "@eidos.space/markdown"

import type { ResolvedAppearance } from "./app-appearance"
import { shouldDisableTextEditorLineNumbers } from "./text-editor-options"

function ensureEmptyEditorCaretTarget(
  fileContainer: HTMLElement,
  content: string
) {
  if (content !== "") return

  const emptyLine = fileContainer.shadowRoot?.querySelector<HTMLElement>(
    '[data-line="1"][data-line-type="context"]'
  )
  if (
    !emptyLine ||
    emptyLine.textContent !== "" ||
    emptyLine.querySelector("br")
  ) {
    return
  }

  // Pierre renders a brand-new empty file as an empty token span. Chromium
  // can focus the contenteditable host, but it cannot place a DOM caret in
  // that span, so real keyboard input never reaches the editor. Pierre uses a
  // <br> for empty lines after edits, so normalize the initial row to the same
  // caret-bearing shape before the editor attaches.
  emptyLine.replaceChildren(document.createElement("br"))
}

function focusTextEditor(editor: Editor<undefined>, content: string) {
  if (editor.getState().selections?.length) {
    editor.focus({ preventScroll: true })
    return
  }

  editor.focus(
    content.length === 0
      ? { lineNumber: 1, character: 0, preventScroll: true }
      : { lineNumber: "first-visible", preventScroll: true }
  )
}

function clipboardImageFiles(event: ClipboardEvent<HTMLElement>): File[] {
  const itemFiles = Array.from(event.clipboardData.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
  if (itemFiles.length > 0) return itemFiles
  return Array.from(event.clipboardData.files).filter((file) =>
    file.type.startsWith("image/")
  )
}

export default function PierreTextEditorSurface({
  relativePath,
  content,
  theme,
  persistEditorState = true,
  autoFocus = false,
  focusRequestToken = 0,
  onPasteImage,
  onPasteImageError,
  onChange,
}: {
  relativePath: string
  content: string
  theme: ResolvedAppearance
  persistEditorState?: boolean
  autoFocus?: boolean
  focusRequestToken?: number
  onPasteImage?: MarkdownEditorPasteImageHandler
  onPasteImageError?(error: Error): void
  onChange(content: string): void
}) {
  const editorRef = useRef<Editor<undefined> | null>(null)
  const acceptedFocusRequestTokenRef = useRef(focusRequestToken)
  const contentPropRef = useRef(content)
  const currentContentRef = useRef(content)
  const pasteControllersRef = useRef(new Set<AbortController>())
  if (contentPropRef.current !== content) {
    contentPropRef.current = content
    currentContentRef.current = content
  }
  const createEditor = useCallback(
    (options: EditorOptions<undefined>) => {
      const persistentOptions: EditorOptions<undefined> = {
        ...options,
        persistState: persistEditorState,
      }
      if (editorRef.current) {
        editorRef.current.setOptions(persistentOptions)
      } else {
        editorRef.current = new Editor<undefined>(persistentOptions)
      }
      return editorRef.current
    },
    [persistEditorState]
  )
  useEffect(() => {
    editorRef.current?.setOptions({ persistState: persistEditorState })
  }, [persistEditorState])
  useEffect(() => {
    if (acceptedFocusRequestTokenRef.current === focusRequestToken) return
    acceptedFocusRequestTokenRef.current = focusRequestToken
    if (editorRef.current) {
      focusTextEditor(editorRef.current, currentContentRef.current)
    }
  }, [focusRequestToken])
  useEffect(
    () => () => {
      for (const controller of pasteControllersRef.current) controller.abort()
      pasteControllersRef.current.clear()
    },
    []
  )
  const handlePasteCapture = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (!onPasteImage) return
      const files = clipboardImageFiles(event)
      if (files.length === 0) return
      const editor = editorRef.current
      const selection = editor?.getState().selections?.[0]
      if (!editor || !selection) return
      event.preventDefault()
      event.stopPropagation()

      const capturedContent = currentContentRef.current
      const capturedRange = {
        start: { ...selection.start },
        end: { ...selection.end },
      }
      const controller = new AbortController()
      pasteControllersRef.current.add(controller)
      void (async () => {
        try {
          const sources: string[] = []
          for (const [index, file] of files.entries()) {
            const asset = await onPasteImage({
              documentKey: relativePath,
              file,
              index,
              total: files.length,
              signal: controller.signal,
            })
            if (controller.signal.aborted) return
            if (asset) {
              sources.push(
                markdownImageSource(
                  asset.markdownUrl,
                  asset.alt ?? file.name,
                  asset.title
                )
              )
            }
          }
          if (sources.length === 0 || controller.signal.aborted) return
          const liveSelection = editor.getState().selections?.[0]
          const range =
            currentContentRef.current === capturedContent
              ? capturedRange
              : liveSelection
                ? {
                    start: { ...liveSelection.start },
                    end: { ...liveSelection.end },
                  }
                : capturedRange
          editor.applyEdits([{ range, newText: sources.join("\n\n") }], true)
        } catch (cause) {
          if (!controller.signal.aborted) {
            onPasteImageError?.(
              cause instanceof Error ? cause : new Error(String(cause))
            )
          }
        } finally {
          pasteControllersRef.current.delete(controller)
        }
      })()
    },
    [onPasteImage, onPasteImageError, relativePath]
  )
  // Pierre keeps the editable tokenizer and theme CSS inside an imperative
  // Shadow DOM instance. Recreate that instance for each application theme,
  // while carrying the live buffer across the remount.
  const file = useMemo(
    () => ({
      name: relativePath.split("/").at(-1) ?? relativePath,
      contents: currentContentRef.current,
      cacheKey: relativePath,
    }),
    [content, relativePath, theme]
  )
  const handlePostRender = useCallback((fileContainer: HTMLElement) => {
    ensureEmptyEditorCaretTarget(fileContainer, currentContentRef.current)
  }, [])
  return (
    <div
      className="text-file-editor-paste-surface"
      onPasteCapture={handlePasteCapture}
    >
      <EditProvider createEditor={createEditor}>
        <Virtualizer
          className="text-file-editor-virtualizer"
          contentClassName="text-file-editor-virtualizer-content"
        >
          <File
            key={`${relativePath}:${theme}`}
            file={file}
            edit
            editorOptions={{
              clipboard: {
                readText: () => window.eidosLite.readClipboardText(),
              },
              onAttach: (editor) => {
                if (!autoFocus) return
                focusTextEditor(editor, currentContentRef.current)
              },
              onChange: (nextFile) => {
                currentContentRef.current = nextFile.contents
                onChange(nextFile.contents)
              },
            }}
            options={{
              themeType: theme,
              disableFileHeader: true,
              disableLineNumbers:
                shouldDisableTextEditorLineNumbers(relativePath),
              stickyHeader: false,
              overflow: "wrap",
              onPostRender: handlePostRender,
            }}
          />
        </Virtualizer>
      </EditProvider>
    </div>
  )
}
