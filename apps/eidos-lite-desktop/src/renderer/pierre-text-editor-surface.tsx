import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from "react"
import { Editor, type EditorOptions } from "@pierre/diffs/edit"
import { EditProvider, File, Virtualizer } from "@pierre/diffs/react"
import {
  markdownImageSource,
  type MarkdownEditorPasteImageHandler,
  type MarkdownFileDropHandler,
  droppedFileSource,
  fileDropCaretRange,
} from "@eidos.space/markdown"

import type { ResolvedAppearance } from "./app-appearance"
import { shouldDisableTextEditorLineNumbers } from "./text-editor-options"
import {
  resolveTextSearchTarget,
  textOffsetPosition,
  type TextSearchTarget,
} from "../shared/text-search"
import { useEidosLiteI18n } from "./i18n"

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
  documentKey = relativePath,
  content,
  theme,
  persistEditorState = true,
  autoFocus = false,
  focusRequestToken = 0,
  placeholder,
  placeholderHint,
  searchTarget,
  onPasteImage,
  fileDrop,
  onPasteImageError,
  onChange,
}: {
  documentKey?: string
  relativePath: string
  content: string
  theme: ResolvedAppearance
  persistEditorState?: boolean
  autoFocus?: boolean
  focusRequestToken?: number
  placeholder?: string
  placeholderHint?: string
  searchTarget?: TextSearchTarget
  onPasteImage?: MarkdownEditorPasteImageHandler
  fileDrop?: MarkdownFileDropHandler
  onPasteImageError?(error: Error): void
  onChange(content: string): void
}) {
  const editorRef = useRef<Editor<undefined> | null>(null)
  const fileContainerRef = useRef<HTMLElement | null>(null)
  const [searchMissing, setSearchMissing] = useState(false)
  const [empty, setEmpty] = useState(content === "")
  const { t } = useEidosLiteI18n()
  const appliedSearch = useRef<string | null>(null)
  const revealFrame = useRef(0)
  const searchTargetRef = useRef(searchTarget)
  searchTargetRef.current = searchTarget
  const revealSearch = useCallback((editor: Editor<undefined>) => {
    const target = searchTargetRef.current
    if (
      !target ||
      !editor.getFile() ||
      appliedSearch.current === target.requestId
    )
      return
    appliedSearch.current = target.requestId
    const text = editor.getText()
    const resolved = resolveTextSearchTarget(text, target)
    setSearchMissing(!resolved)
    if (!resolved) return
    const start = textOffsetPosition(text, resolved.start)
    const end = textOffsetPosition(text, resolved.end)
    editor.focus({ lineNumber: start.lineNumber, character: start.character })
    editor.setSelections([
      {
        start: { line: start.lineNumber - 1, character: start.character },
        end: { line: end.lineNumber - 1, character: end.character },
        direction: "forward",
      },
    ])
  }, [])
  const scheduleSearchReveal = useCallback(
    (editor: Editor<undefined>) => {
      cancelAnimationFrame(revealFrame.current)
      revealFrame.current = requestAnimationFrame(() => revealSearch(editor))
    },
    [revealSearch]
  )
  useEffect(() => {
    if (editorRef.current) scheduleSearchReveal(editorRef.current)
    return () => cancelAnimationFrame(revealFrame.current)
  }, [searchTarget, scheduleSearchReveal])
  const acceptedFocusRequestTokenRef = useRef(focusRequestToken)
  const contentPropRef = useRef(content)
  const currentContentRef = useRef(content)
  const pasteControllersRef = useRef(new Set<AbortController>())
  const dropControllersRef = useRef(new Set<AbortController>())
  useEffect(
    () => () => {
      for (const controller of dropControllersRef.current) controller.abort()
      dropControllersRef.current.clear()
    },
    [documentKey, fileDrop]
  )
  if (contentPropRef.current !== content) {
    contentPropRef.current = content
    if (!editorRef.current || !persistEditorState)
      currentContentRef.current = content
  }
  useLayoutEffect(() => {
    const editor = editorRef.current
    if (!editor || content === currentContentRef.current) return
    const previous = currentContentRef.current
    const end = textOffsetPosition(previous, previous.length)
    // Host edits must join the editor's undo timeline, rather than replace
    // File's input document (which resets its history).
    editor.applyEdits(
      [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: end.lineNumber - 1, character: end.character },
          },
          newText: content,
        },
      ],
      true
    )
  }, [content])
  useEffect(() => setEmpty(content === ""), [content])
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
  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!fileDrop?.accepts(Array.from(event.dataTransfer.types))) return
      const editor = editorRef.current
      if (!editor) return
      event.preventDefault()
      event.stopPropagation()
      const captured = currentContentRef.current
      const shadow = fileContainerRef.current?.shadowRoot
      const range = fileDropCaretRange(
        event.currentTarget,
        event.clientX,
        event.clientY,
        shadow ? [shadow] : []
      )
      const lineElement = (
        range?.startContainer instanceof Element
          ? range.startContainer
          : range?.startContainer.parentElement
      )?.closest<HTMLElement>("[data-line]")
      let offset = captured.length
      if (range && lineElement) {
        const line = Number(lineElement.dataset.line) - 1
        const prefix = document.createRange()
        prefix.selectNodeContents(lineElement)
        prefix.setEnd(range.startContainer, range.startOffset)
        const lines = captured.split("\n")
        if (line >= 0 && line < lines.length)
          offset =
            lines
              .slice(0, line)
              .reduce((size, text) => size + text.length + 1, 0) +
            Math.min(lines[line]!.length, prefix.toString().length)
      }
      const start = textOffsetPosition(captured, offset)
      const controller = new AbortController()
      dropControllersRef.current.add(controller)
      void fileDrop
        .resolve({
          documentKey,
          dataTransfer: event.dataTransfer,
          signal: controller.signal,
        })
        .then((files) => {
          if (controller.signal.aborted || !files.length) return
          const sources = files.map(droppedFileSource)
          if (sources.some((source) => !source)) return
          if (captured !== currentContentRef.current)
            throw new Error(
              "The document changed while dropping files. Drop them again."
            )
          const images = files.some((file) => file.imageUrl)
          const text = `${images && offset > 0 ? "\n\n" : ""}${sources.join(images ? "\n\n" : " ")}${images && offset < captured.length ? "\n\n" : ""}`
          const point = {
            line: start.lineNumber - 1,
            character: start.character,
          }
          editor.setSelections([
            { start: point, end: point, direction: "none" },
          ])
          editor.applyEdits(
            [{ range: { start: point, end: point }, newText: text }],
            true
          )
          const end = textOffsetPosition(
            currentContentRef.current,
            offset + text.length
          )
          editor.focus({
            lineNumber: end.lineNumber,
            character: end.character,
            preventScroll: true,
          })
        })
        .catch((cause) => {
          if (!controller.signal.aborted)
            (fileDrop.onError ?? onPasteImageError)?.(
              cause instanceof Error ? cause : new Error(String(cause))
            )
        })
        .finally(() => dropControllersRef.current.delete(controller))
    },
    [fileDrop, documentKey, relativePath, onPasteImageError]
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
    fileContainerRef.current = fileContainer
    ensureEmptyEditorCaretTarget(fileContainer, currentContentRef.current)
  }, [])
  return (
    <div
      className="text-file-editor-paste-surface"
      data-line-numbers={
        shouldDisableTextEditorLineNumbers(relativePath) ? "hidden" : "visible"
      }
      onPasteCapture={handlePasteCapture}
      onDragOverCapture={(event) => {
        if (!fileDrop?.accepts(Array.from(event.dataTransfer.types))) return
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = "copy"
      }}
      onDropCapture={handleDrop}
    >
      {placeholder && empty ? (
        <div className="text-file-editor-empty-prompt" aria-hidden="true">
          <span>{placeholder}</span>
          {placeholderHint ? <small>{placeholderHint}</small> : null}
        </div>
      ) : null}
      {searchMissing ? (
        <p role="status">
          {t(
            "The text has changed and this match no longer exists. Search again."
          )}
        </p>
      ) : null}
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
                if (searchTargetRef.current) {
                  scheduleSearchReveal(editor)
                  return
                }
                if (!autoFocus) return
                focusTextEditor(editor, currentContentRef.current)
              },
              onChange: (nextFile) => {
                currentContentRef.current = nextFile.contents
                setEmpty(nextFile.contents === "")
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
