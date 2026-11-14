// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import { MarkdownEditorSurface } from "./markdown-editor-surface"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

it("keeps external search focus when the real Markdown surface rerenders", async () => {
  await import("@eidos.space/markdown/presets")
  Range.prototype.getBoundingClientRect = () => new DOMRect()
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  HTMLElement.prototype.scrollIntoView = () => {}
  Object.assign(window, { eidosLite: { openExternalUrl: vi.fn() } })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const render = () => (
    <>
      <input aria-label="External search" />
      <MarkdownEditorSurface
        documentKey="focus"
        relativePath="note.md"
        content={"# Note\n\nBody"}
        editingMode="wysiwyg"
        theme="light"
        onChange={() => {}}
      />
    </>
  )
  try {
    await act(async () => root.render(render()))
    await vi.waitFor(() =>
      expect(host.querySelector('[contenteditable="true"]')).not.toBeNull()
    )
    const editable = host.querySelector<HTMLElement>(
      '[contenteditable="true"]'
    )!
    await act(async () => {
      editable.focus()
      const text = editable.querySelector("p")!.firstChild!
      window.getSelection()!.setBaseAndExtent(text, 1, text, 1)
      document.dispatchEvent(new Event("selectionchange"))
    })
    const input = host.querySelector("input")!
    input.focus()
    expect(document.activeElement).toBe(input)
    await act(async () => root.render(render()))
    expect(document.activeElement).toBe(input)
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
