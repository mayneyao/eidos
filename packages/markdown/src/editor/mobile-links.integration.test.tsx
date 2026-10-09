import { act } from "react"
import { createRoot } from "react-dom/client"
import { MarkdownEditor } from "./markdown-editor"

it.each(["mobile", "floating"] as const)(
  "%s link activation preserves the host navigation contract",
  async (toolbarMode) => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const open = vi.fn()
    try {
      await act(async () =>
        root.render(
          <MarkdownEditor
            documentKey="links"
            markdown="[Open](https://example.com/page)"
            toolbarMode={toolbarMode}
            onMarkdownChange={vi.fn()}
            onOpenExternalUrl={open}
          />
        )
      )
      const link = host.querySelector<HTMLAnchorElement>("a")!
      // Suppress jsdom's browser navigation; activation must still reach the host.
      link.addEventListener("click", (event) => event.preventDefault())
      await act(async () => link.click())
      expect(open).toHaveBeenCalledTimes(toolbarMode === "mobile" ? 1 : 0)
      await act(async () =>
        link.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            ctrlKey: true,
          })
        )
      )
      expect(open).toHaveBeenLastCalledWith("https://example.com/page")
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  }
)
