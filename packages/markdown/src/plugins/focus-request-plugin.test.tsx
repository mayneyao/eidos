import { act } from "react"
import { createRoot } from "react-dom/client"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import {
  $getSelection,
  $isRangeSelection,
  $setSelection,
  type LexicalEditor,
} from "lexical"
import { FocusRequestPlugin } from "./focus-request-plugin"

it("restores a caret when the root is already focused, preserving later selections", async () => {
  const originalRect = Range.prototype.getBoundingClientRect
  Range.prototype.getBoundingClientRect = () => new DOMRect()
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  let editor!: LexicalEditor
  function Probe() {
    ;[editor] = useLexicalComposerContext()
    return null
  }
  const render = (token: number, readOnly = false) =>
    root.render(
      <LexicalComposer
        initialConfig={{
          namespace: "focus-test",
          onError: (error) => {
            throw error
          },
        }}
      >
        <RichTextPlugin
          contentEditable={<ContentEditable />}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <Probe />
        <FocusRequestPlugin token={token} readOnly={readOnly} />
      </LexicalComposer>
    )
  try {
    await act(async () => render(0))
    const editable = host.querySelector<HTMLElement>(
      '[contenteditable="true"]'
    )!
    await act(async () => {
      editable.focus()
    })
    await act(async () => {
      window.getSelection()?.removeAllRanges()
      editor.update(() => $setSelection(null))
    })
    // A second DOM focus does not restore the missing Lexical selection.
    editable.focus()
    expect(document.activeElement).toBe(editable)
    expect(editor.getEditorState().read($getSelection)).toBeNull()
    await act(async () => render(1))
    expect(
      editor.getEditorState().read(() => $isRangeSelection($getSelection()))
    ).toBe(true)
    await act(async () =>
      editor.update(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          selection.insertText("Hello")
          selection.anchor.set(selection.anchor.key, 2, "text")
          selection.focus.set(selection.focus.key, 2, "text")
        }
      })
    )
    const saved = editor.getEditorState().read(() => $getSelection()?.clone())
    await act(async () => render(2))
    expect(document.activeElement).toBe(editable)
    expect(
      editor.getEditorState().read(() => $getSelection()?.is(saved ?? null))
    ).toBe(true)
    editable.blur()
    await act(async () => render(2))
    expect(document.activeElement).not.toBe(editable)
    await act(async () => render(3, true))
    expect(document.activeElement).not.toBe(editable)
  } finally {
    Range.prototype.getBoundingClientRect = originalRect
    await act(async () => root.unmount())
    host.remove()
  }
})
