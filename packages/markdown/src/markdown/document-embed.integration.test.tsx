import { act } from "react"
import { createRoot } from "react-dom/client"
import { MarkdownEditor } from "../editor/markdown-editor"

it("keeps wiki embeds literal while retaining ordinary wiki links", async () => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const onChange = vi.fn()
  try {
    await act(async () =>
      root.render(
        <MarkdownEditor
          documentKey="owner"
          markdown="![[Note#Heading|Excerpt]]\n\n![[pic.png]]\n\n[[Other]]"
          onMarkdownChange={onChange}
          readOnly
        />
      )
    )
    expect(host.textContent).toContain("![[Note#Heading|Excerpt]]")
    expect(host.textContent).toContain("![[pic.png]]")
    expect(host.querySelector("img")).toBeNull()
    expect(host.querySelector(".eme-obsidian-link")?.textContent).toBe("Other")
    expect(onChange).not.toHaveBeenCalled()
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
