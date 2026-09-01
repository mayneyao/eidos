// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  EidosFileUIProvider,
  type EidosFileMarkdownSourceEditorRequest,
} from "./context"
import { EidosFileMarkdownSourceEditor } from "./eidos-file-markdown-source-editor"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("EidosFileMarkdownSourceEditor", () => {
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

  it("uses the host Markdown editor when one is available", async () => {
    const onChange = vi.fn()
    let request: EidosFileMarkdownSourceEditorRequest | undefined

    await act(async () => {
      root.render(
        <EidosFileUIProvider
          renderMarkdownSourceEditor={(nextRequest) => {
            request = nextRequest
            return <div data-testid="host-editor" />
          }}
        >
          <EidosFileMarkdownSourceEditor
            cacheKey="row:body"
            content="# Initial"
            disabled={false}
            onChange={onChange}
          />
        </EidosFileUIProvider>
      )
    })

    expect(request).toMatchObject({
      cacheKey: "row:body",
      content: "# Initial",
      disabled: false,
    })
    expect(
      container.querySelector('[data-testid="host-editor"]')
    ).not.toBeNull()
    expect(
      container.querySelector('[data-eidos-file-markdown-source-editor="host"]')
    ).not.toBeNull()

    await act(async () => request?.onChange("# Updated"))
    expect(onChange).toHaveBeenCalledWith("# Updated")
  })

  it("falls back to one borderless scrolling textarea", async () => {
    const onChange = vi.fn()
    await act(async () => {
      root.render(
        <EidosFileUIProvider>
          <EidosFileMarkdownSourceEditor
            cacheKey="row:body"
            content="# Initial"
            disabled={false}
            onChange={onChange}
          />
        </EidosFileUIProvider>
      )
    })

    const textarea = container.querySelector("textarea")
    expect(textarea).not.toBeNull()
    expect(textarea?.className).toContain("overflow-auto")
    expect(
      container.querySelector(
        '[data-eidos-file-markdown-source-editor="fallback"]'
      )
    ).not.toBeNull()

    await act(async () => {
      if (!textarea) return
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )?.set
      valueSetter?.call(textarea, "# Updated")
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledWith("# Updated")
  })
})
