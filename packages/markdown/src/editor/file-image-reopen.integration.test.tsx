import { act } from "react"
import { createRoot } from "react-dom/client"
import { MarkdownEditor } from "./markdown-editor"
import { eidosPreset } from "../presets"
import { markdownImageSource } from "../markdown/image-source"

it("reopens an image inserted after a paragraph with its special filename", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const name = "中文 [图] (#%).png"
  const source = [
    "Main before ",
    markdownImageSource(`/images/${encodeURIComponent(name)}`, name),
  ].join(String.fromCharCode(10, 10))
  try {
    await act(async () =>
      root.render(
        <MarkdownEditor
          documentKey="notes/main.md"
          documentPath="notes/main.md"
          preset={eidosPreset}
          markdown={source}
          onMarkdownChange={() => {}}
        />
      )
    )
    expect(host.querySelector("[data-efm-image-block]")).not.toBeNull()
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})

it("opens a saved encoded file link with the same decoded destination used during insertion", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const path = "images/中文 [图] (#%).png"
  const target = path.split("/").map(encodeURIComponent).join("/")
  const open = vi.fn()
  try {
    await act(async () =>
      root.render(
        <MarkdownEditor
          documentKey="notes/main.md"
          preset={eidosPreset}
          markdown={`[[${target}]]`}
          onMarkdownChange={() => {}}
          onOpenInternalLink={open}
        />
      )
    )
    await act(async () =>
      host.querySelector<HTMLButtonElement>(".eme-obsidian-link")!.click()
    )
    expect(host.querySelector(".eme-obsidian-link")?.textContent).toBe(path)
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        path,
        target,
        syntax: "wikilink",
        embed: false,
      })
    )
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
