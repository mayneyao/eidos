import { act } from "react"
import { createRoot } from "react-dom/client"
import { MarkdownEditor } from "./markdown-editor"

beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect()
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
})

it.each(["image", "file", "cancel", "failure"] as const)(
  "imports mobile attachments: %s",
  async (mode) => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const changed = vi.fn()
    const onError = vi.fn()
    const onImportFiles = vi.fn(async () => {
      if (mode === "failure") throw new Error("Picker failed")
      if (mode === "cancel") return []
      return [
        {
          markdownUrl: "assets/import/photo%20one.png",
          name: "photo one.png",
          mediaType: "image/png",
        },
      ]
    })
    try {
      await act(async () =>
        root.render(
          <MarkdownEditor
            documentKey="import"
            markdown="Existing text"
            onMarkdownChange={changed}
            toolbarMode="mobile"
            autoFocus
            onImportFiles={onImportFiles}
            onError={onError}
          />
        )
      )
      await act(async () =>
        host
          .querySelector<HTMLButtonElement>(
            'button[aria-label="Insert block"]'
          )!
          .click()
      )
      const label = mode === "image" ? "Image" : "File"
      await act(async () =>
        host
          .querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
          .click()
      )
      expect(onImportFiles).toHaveBeenCalledOnce()
      if (mode === "cancel" || mode === "failure") {
        expect(changed).not.toHaveBeenCalled()
        expect(
          host.querySelector('[contenteditable="true"]')?.textContent
        ).toBe("Existing text")
        expect(onError).toHaveBeenCalledTimes(mode === "failure" ? 1 : 0)
      } else {
        await vi.waitFor(() => expect(changed).toHaveBeenCalled())
        const markdown = changed.mock.lastCall![0] as string
        expect(markdown).toContain(
          mode === "image"
            ? "![photo one.png](<assets/import/photo%20one.png>)"
            : "[photo one.png](assets/import/photo%20one.png)"
        )
        expect(markdown).toContain("Existing text")
        expect(onError).not.toHaveBeenCalled()
      }
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  }
)
