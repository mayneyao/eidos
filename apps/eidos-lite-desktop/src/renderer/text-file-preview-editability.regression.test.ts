// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const editorSurfaceRendered = vi.hoisted(() =>
  vi.fn<(props: { autoFocus?: boolean }) => void>()
)

vi.mock("./pierre-text-editor-surface", () => ({
  default: (props: { autoFocus?: boolean }) => {
    editorSurfaceRendered(props)
    return null
  },
}))

import { prepareTextFilePreview, TextFilePreview } from "./text-file-preview"

describe("Markdown source editability regression", () => {
  beforeEach(() => {
    editorSurfaceRendered.mockClear()
    ;(window as unknown as { eidosLite: unknown }).eidosLite = {
      saveTextFile: vi.fn(),
    }
  })

  it("focuses the editor after switching a new Markdown file to source", async () => {
    await prepareTextFilePreview({
      type: "text",
      relativePath: "editor-loader.txt",
      content: "",
      encoding: "utf-8",
      bom: false,
      revision: "a".repeat(64),
      size: 0,
      modifiedAtMs: 0,
      truncated: false,
    })

    const host = document.createElement("div")
    const root = createRoot(host)
    await act(async () => {
      root.render(
        createElement(TextFilePreview, {
          preview: {
            type: "text",
            relativePath: "Untitled.md",
            content: "",
            encoding: "utf-8",
            bom: false,
            revision: "b".repeat(64),
            browserPreview: { kind: "markdown" },
            size: 0,
            modifiedAtMs: 0,
            truncated: false,
          },
          theme: "light",
          platform: "darwin",
          onReveal: () => undefined,
          onSaved: () => undefined,
          onReload: () => undefined,
          onDraftChange: () => undefined,
        })
      )
    })

    const source = host.querySelector<HTMLButtonElement>(
      '[data-document-preview-mode="source"]'
    )
    expect(source).not.toBeNull()
    await act(async () => source?.click())

    expect(editorSurfaceRendered).toHaveBeenCalledWith(
      expect.objectContaining({ autoFocus: true })
    )

    await act(async () => root.unmount())
  })
})
