import { useCallback, useEffect, useMemo, useRef } from "react"
import { Editor, type EditorOptions } from "@pierre/diffs/edit"
import { EditProvider, File, Virtualizer } from "@pierre/diffs/react"

import type { ResolvedAppearance } from "./app-appearance"
import { shouldDisableTextEditorLineNumbers } from "./text-editor-options"

export default function PierreTextEditorSurface({
  relativePath,
  content,
  theme,
  persistEditorState = true,
  autoFocus = false,
  onChange,
}: {
  relativePath: string
  content: string
  theme: ResolvedAppearance
  persistEditorState?: boolean
  autoFocus?: boolean
  onChange(content: string): void
}) {
  const editorRef = useRef<Editor<undefined> | null>(null)
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
  const contentPropRef = useRef(content)
  const currentContentRef = useRef(content)
  if (contentPropRef.current !== content) {
    contentPropRef.current = content
    currentContentRef.current = content
  }
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
  return (
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
              if (content.length === 0) {
                editor.focus({ lineNumber: 1, character: 0 })
                return
              }
              editor.focus()
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
          }}
        />
      </Virtualizer>
    </EditProvider>
  )
}
