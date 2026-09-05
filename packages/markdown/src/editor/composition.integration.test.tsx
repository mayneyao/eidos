import { act } from "react"
import { createRoot } from "react-dom/client"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  KEY_DOWN_COMMAND,
  PASTE_COMMAND,
  type PasteCommandType,
  type LexicalEditor,
} from "lexical"
import { MarkdownEditor } from "./markdown-editor"
import { minimalPreset, createMarkdownPreset } from "../presets"
import { emphasisPlugin, headingPlugin } from "../features/commonmark/plugin"
import { defineMarkdownPlugin } from "../plugin-system/plugin-api"

it("mounts a minimal editor without optional nodes and blocks disabled emphasis shortcuts", async () => {
  vi.stubGlobal("DragEvent", class extends MouseEvent {})
  vi.stubGlobal("ClipboardEvent", class extends Event {})
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  let editor: LexicalEditor | undefined
  function Capture() {
    ;[editor] = useLexicalComposerContext()
    return null
  }
  const capture = defineMarkdownPlugin({
    apiVersion: 1,
    id: "test.capture-minimal",
    version: "1",
    behaviors: [{ id: "test.capture-minimal", component: Capture }],
  })
  const preset = createMarkdownPreset({
    id: "test.minimal-ui",
    extends: minimalPreset,
    plugins: [capture],
  })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const errors: Error[] = []
  const render = (value: typeof preset) => (
    <MarkdownEditor
      documentKey="minimal"
      preset={value}
      markdown={"# Literal heading\n\n**Literal emphasis**"}
      onMarkdownChange={() => {}}
      onError={(error) => errors.push(error)}
    />
  )
  try {
    await act(async () => root.render(render(preset)))
    expect(errors).toEqual([])
    expect(host.querySelector("h1")).toBeNull()
    expect(host.querySelector("strong")).toBeNull()
    expect(editor).toBeDefined()
    await act(async () => {
      editor!.update(() => $getRoot().getFirstChildOrThrow().selectStart(), {
        discrete: true,
      })
      editor!.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", {
          key: "b",
          ctrlKey: true,
          cancelable: true,
        })
      )
    })
    editor!.getEditorState().read(() => {
      const selection = $getSelection()
      expect($isRangeSelection(selection) && selection.hasFormat("bold")).toBe(
        false
      )
    })
    const paste = new Event("paste", { cancelable: true }) as PasteCommandType
    Object.defineProperty(paste, "clipboardData", {
      value: {
        types: ["text/html", "text/plain"],
        items: [],
        files: [],
        getData: (type: string) =>
          type === "text/html"
            ? "<p><strong>Pasted bold</strong></p>"
            : type === "text/plain"
              ? "Pasted bold"
              : "",
      },
    })
    await act(async () => {
      editor!.dispatchCommand(PASTE_COMMAND, paste)
    })
    expect(errors).toEqual([])
    expect(host.textContent).toContain("Pasted bold")
    expect(host.querySelector("strong")).toBeNull()
    await act(async () =>
      root.render(
        render(
          createMarkdownPreset({
            id: "test.heading-ui",
            extends: preset,
            plugins: [headingPlugin],
          })
        )
      )
    )
    expect(errors).toEqual([])
    expect(host.querySelector("h1")?.textContent).toBe("Literal heading")
    expect(host.querySelector("strong")).toBeNull()
    await act(async () =>
      root.render(
        render(
          createMarkdownPreset({
            id: "test.emphasis-ui",
            extends: preset,
            plugins: [emphasisPlugin],
          })
        )
      )
    )
    await act(async () => {
      editor!.update(() => $getRoot().getFirstChildOrThrow().selectStart(), {
        discrete: true,
      })
      editor!.dispatchCommand(PASTE_COMMAND, paste)
    })
    expect(errors).toEqual([])
    expect(
      Array.from(host.querySelectorAll("strong"), (node) => node.textContent)
    ).toContain("Pasted bold")
  } finally {
    await act(async () => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  }
})
