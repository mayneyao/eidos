import { act } from "react"
import { createRoot } from "react-dom/client"
import { MarkdownEditor } from "../editor/markdown-editor"
import { eidosPreset, minimalPreset, createMarkdownPreset } from "../presets"
import { wikilinkPlugin } from "../features/wikilink/plugin"
import type { MarkdownFileDropHandler, MarkdownNoteCandidate } from "../types"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
it.each([
  "document-changed",
  "document-switched",
  "image-disabled",
  "unsafe-image",
])("handles a host file drop when %s", async (mode) => {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  let finish!: (files: readonly MarkdownNoteCandidate[]) => void
  const onError = vi.fn()
  const changed = vi.fn()
  const handler: MarkdownFileDropHandler = {
    accepts: (types) => types.includes("test/file"),
    resolve: () =>
      new Promise((resolve) => {
        finish = resolve
      }),
    onError,
  }
  const preset =
    mode === "image-disabled"
      ? createMarkdownPreset({
          id: "test.drop-link-only",
          extends: minimalPreset,
          plugins: [wikilinkPlugin],
        })
      : eidosPreset
  const render = (documentKey = "before", markdown = "Keep text") =>
    act(async () =>
      root.render(
        <MarkdownEditor
          documentKey={documentKey}
          markdown={markdown}
          preset={preset}
          fileDrop={handler}
          onMarkdownChange={changed}
        />
      )
    )
  try {
    await render()
    const event = new MouseEvent("drop", {
      bubbles: true,
      cancelable: true,
      clientX: -1,
      clientY: -1,
    })
    Object.defineProperty(event, "dataTransfer", {
      value: { types: ["test/file"] },
    })
    await act(async () =>
      host.querySelector("[contenteditable=true]")!.dispatchEvent(event)
    )
    expect(event.defaultPrevented).toBe(true)
    if (mode === "document-changed") await render("before", "Updated text")
    if (mode === "document-switched") await render("after", "New document")
    await act(async () => {
      finish([
        {
          path: "/image.png",
          title: "image",
          imageUrl:
            mode === "unsafe-image" ? "file:///private.png" : "/image.png",
        },
      ])
      await Promise.resolve()
    })
    if (mode === "document-changed") {
      expect(host.textContent).toContain("Updated text")
      expect(host.querySelector("[data-efm-image-block]")).toBeNull()
      expect(onError).toHaveBeenCalledOnce()
    } else if (mode === "document-switched") {
      expect(host.textContent).toContain("New document")
      expect(host.querySelector("[data-efm-image-block]")).toBeNull()
      expect(onError).not.toHaveBeenCalled()
    } else if (mode === "image-disabled") {
      expect(host.querySelector(".eme-obsidian-link")).not.toBeNull()
      expect(host.querySelector("[data-efm-image-block]")).toBeNull()
    } else expect(host.textContent).toContain("Keep text")
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
