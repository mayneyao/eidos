import { readFileSync } from "node:fs"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { MarkdownEditor } from "../editor/markdown-editor"

it("renders README HTML alignment and resolves local images through the host", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const source = readFileSync("../../README.zh.md", "utf8").split(
    "## 快速开始"
  )[0]!
  const host = document.createElement("div")
  const reset = document.createElement("style")
  reset.textContent = "img { height: auto; width: auto; }"
  document.head.append(reset)
  document.body.append(host)
  const root = createRoot(host)
  const resolveImageUrl = vi.fn(
    async ({ markdownUrl }: { markdownUrl: string }) =>
      markdownUrl.startsWith("static/")
        ? `https://assets.example/${markdownUrl}`
        : null
  )
  try {
    await act(async () =>
      root.render(
        <MarkdownEditor
          documentKey="readme"
          onMarkdownChange={vi.fn()}
          markdown={source}
          readOnly
          resolveImageUrl={resolveImageUrl}
        />
      )
    )
    expect(host.querySelector('[align="center"]')).not.toBeNull()
    const logo = host.querySelector('img[alt="Eidos"]')!
    expect(logo.getAttribute("src")).toContain("https://assets.example/static/")
    expect(logo.getAttribute("height")).toBe("150")
    expect(getComputedStyle(logo).height).toBe("150px")
    expect(
      host.querySelector("picture source")?.getAttribute("srcset")
    ).toContain("horizontal-dark.webp")
    expect(
      host.querySelector('img[width="1280"]')?.getAttribute("src")
    ).toContain("eidos-lite-grid.webp")
  } finally {
    await act(async () => root.unmount())
    host.remove()
    reset.remove()
  }
})
