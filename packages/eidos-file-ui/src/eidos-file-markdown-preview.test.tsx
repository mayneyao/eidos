// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EidosFileMarkdownPreview } from "./eidos-file-markdown-preview"
import { EidosFileUIProvider } from "./context"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("EidosFileMarkdownPreview", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("falls back to the safe renderer without a Host renderer", () => {
    act(() => {
      root.render(<EidosFileMarkdownPreview markdown={"# Title\n\nBody"} />)
    })
    expect(
      container.querySelector("[data-eidos-file-markdown-preview] h1")
        ?.textContent
    ).toBe("Title")
  })

  it("uses the Host renderer and its wrapper class", () => {
    const renderMarkdownHtml = vi.fn(() => ({
      html: '<p class="host-output">Host rendered</p>',
      className: "eme-static",
    }))
    act(() => {
      root.render(
        <EidosFileUIProvider renderMarkdownHtml={renderMarkdownHtml}>
          <EidosFileMarkdownPreview markdown="Body" />
        </EidosFileUIProvider>
      )
    })
    const surface = container.querySelector<HTMLElement>(
      "[data-eidos-file-markdown-preview]"
    )
    expect(surface?.className).toContain("eme-static")
    expect(renderMarkdownHtml).toHaveBeenCalledWith("Body", {
      imageBaseUrl: undefined,
    })
    expect(container.querySelector(".host-output")?.textContent).toBe(
      "Host rendered"
    )
  })

  it("resolves document-local image sources through the Host", async () => {
    const resolveMarkdownImageUrl = vi.fn(
      async () => "eidos-space-media://media-preview/token"
    )
    act(() => {
      root.render(
        <EidosFileUIProvider
          renderMarkdownHtml={() => ({
            html: '<p><img src="assets/a.png" alt="a"></p>',
            className: "eme-static",
          })}
          resolveMarkdownImageUrl={resolveMarkdownImageUrl}
        >
          <EidosFileMarkdownPreview markdown="![a](assets/a.png)" />
        </EidosFileUIProvider>
      )
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(resolveMarkdownImageUrl).toHaveBeenCalledWith("assets/a.png")
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "eidos-space-media://media-preview/token"
    )
  })

  it("routes external link activation through the Host", () => {
    const activateUrl = vi.fn()
    render(activateUrl, '<p><a href="https://example.com/x">link</a></p>')
    const anchor = container.querySelector<HTMLAnchorElement>("a")
    alsoPreventNavigation()
    act(() => {
      anchor?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      )
    })
    expect(activateUrl).toHaveBeenCalledWith("https://example.com/x")
  })

  function alsoPreventNavigation() {
    container.addEventListener("click", (event) => event.preventDefault(), true)
  }

  function render(activateUrl: (uri: string) => void, html: string) {
    act(() => {
      root.render(
        <EidosFileUIProvider
          activateUrl={activateUrl}
          renderMarkdownHtml={() => ({ html, className: "eme-static" })}
        >
          <EidosFileMarkdownPreview markdown="Body" />
        </EidosFileUIProvider>
      )
    })
  }
})
