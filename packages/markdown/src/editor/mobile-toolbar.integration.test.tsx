import { act } from "react"
import { createRoot } from "react-dom/client"
import { MarkdownEditor } from "./markdown-editor"

it("opens touch panels without changing text and restores the selection for formatting", async () => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const dismiss = vi.fn()
  const changed = vi.fn()
  const click = async (label: string) => {
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
        .click()
    )
  }
  try {
    await act(async () =>
      root.render(
        <MarkdownEditor
          documentKey="touch-test"
          markdown="Hello world"
          onMarkdownChange={changed}
          toolbarMode="mobile"
          autoFocus
          onDismissKeyboard={dismiss}
        />
      )
    )
    const editable = host.querySelector<HTMLElement>(
      '[contenteditable="true"]'
    )!
    await act(async () => {
      editable.focus()
      const text = editable.querySelector("p")!.firstChild!
      const range = document.createRange()
      range.selectNodeContents(text)
      window.getSelection()!.removeAllRanges()
      window.getSelection()!.addRange(range)
      document.dispatchEvent(new Event("selectionchange"))
    })
    await click("Text format")
    expect(host.querySelector(".eme-insert-trigger")).toBeNull()
    expect(host.querySelector(".eme-block-drag-handle")).toBeNull()
    expect(dismiss).toHaveBeenCalledOnce()
    expect(host.querySelector(".eme-mobile-panel")).not.toBeNull()
    await click("Bold")
    expect(host.querySelector(".eme-mobile-panel")).toBeNull()
    expect(editable.textContent).toBe("Hello world")
    expect(editable.querySelector("strong, b, .eme-text-bold")).not.toBeNull()
    await click("Insert block")
    await click("Heading 1")
    expect(editable.querySelector("h1")?.textContent).toBe("Hello world")
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
