import { act } from "react"
import { createRoot } from "react-dom/client"
import { MarkdownEditor } from "../editor/markdown-editor"

it("retains loaded images across callback rerenders and resolver refreshes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const resolveImageUrl = vi.fn(async () => "https://assets.example/image.png")
  const render = async (resolver = resolveImageUrl) =>
    act(async () => {
      root.render(
        <MarkdownEditor
          documentKey="record-body"
          markdown="![Image](./image.png)"
          onMarkdownChange={() => {}}
          onError={() => {}}
          resolveImageUrl={resolver}
        />
      )
    })
  try {
    await render()
    const image = host.querySelector('img[alt="Image"]')!
    expect(image.getAttribute("src")).toBe("https://assets.example/image.png")
    const mutations: MutationRecord[] = []
    const observer = new MutationObserver((records) =>
      mutations.push(...records)
    )
    observer.observe(host, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src"],
    })
    try {
      await render()
      await render()
      expect(resolveImageUrl).toHaveBeenCalledTimes(1)
      expect(host.querySelector('img[alt="Image"]')).toBe(image)
      expect(
        mutations.filter(
          (record) =>
            record.target === image ||
            Array.from(record.removedNodes).some(
              (node) => node === image || node.contains(image)
            )
        )
      ).toEqual([])
      let finish!: (value: string) => void
      const refresh = vi.fn(
        () =>
          new Promise<string>((resolve) => {
            finish = resolve
          })
      )
      await render(refresh)
      expect(host.querySelector('img[alt="Image"]')).toBe(image)
      expect(image.getAttribute("src")).toBe("https://assets.example/image.png")
      await act(async () => finish("https://assets.example/refreshed.png"))
      expect(host.querySelector('img[alt="Image"]')).toBe(image)
      expect(image.getAttribute("src")).toBe(
        "https://assets.example/refreshed.png"
      )
    } finally {
      observer.disconnect()
    }
  } finally {
    await act(async () => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  }
})
