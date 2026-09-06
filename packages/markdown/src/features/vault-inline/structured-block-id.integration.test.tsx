import { act } from "react"
import { createRoot } from "react-dom/client"
import { MarkdownEditor } from "../../editor/markdown-editor"

it.each([
  ["ul", "- first\n- second"],
  ["table", "| A | B |\n| --- | --- |\n| one | two |"],
  ["aside", "> [!note] Title\n> Body"],
])(
  "navigates to the complete %s without creating an ID paragraph",
  async (selector, body) => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal("CSS", { escape: (value: string) => value })
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const onChange = vi.fn()
    const onError = vi.fn()
    try {
      await act(async () =>
        root.render(
          <MarkdownEditor
            documentKey="structured-navigation"
            markdown={`[[#^target|Go]]\n\n${body}\n\n^target`}
            readOnly
            onMarkdownChange={onChange}
            onError={onError}
          />
        )
      )
      const target = host.querySelector<HTMLElement>(
        "[data-obsidian-block-id='target']"
      )!
      expect(target).not.toBeNull()
      expect(
        target.matches(selector) || target.querySelector(selector)
      ).toBeTruthy()
      target.scrollIntoView = vi.fn()
      await act(async () =>
        host.querySelector<HTMLButtonElement>(".eme-obsidian-link")!.click()
      )
      expect(target.scrollIntoView).toHaveBeenCalledOnce()
      expect(onError).not.toHaveBeenCalled()
      expect(onChange).not.toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      host.remove()
      vi.unstubAllGlobals()
    }
  }
)
