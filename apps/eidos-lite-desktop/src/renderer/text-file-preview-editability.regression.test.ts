// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const editorSurfaceRendered = vi.hoisted(() =>
  vi.fn<(props: { editingMode?: string }) => void>()
)

vi.mock("./markdown-editor-surface", () => ({
  prepareMarkdownEditorSurface: vi.fn(async () => undefined),
  MarkdownEditorSurface: (props: { editingMode?: string }) => {
    editorSurfaceRendered(props)
    return null
  },
}))

import { prepareTextFilePreview, TextFilePreview } from "./text-file-preview"

describe("Markdown editability regression", () => {
  beforeEach(() => {
    editorSurfaceRendered.mockClear()
    ;(window as unknown as { eidosLite: unknown }).eidosLite = {
      saveTextFile: vi.fn(),
    }
  })

  it("opens a new Markdown file directly in WYSIWYG edit mode", async () => {
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
          markdownEditingMode: "wysiwyg",
          theme: "light",
          platform: "darwin",
          onReveal: () => undefined,
          onSaved: () => undefined,
          onReload: () => undefined,
          onDraftChange: () => undefined,
        })
      )
    })

    expect(editorSurfaceRendered).toHaveBeenCalledWith(
      expect.objectContaining({ editingMode: "wysiwyg" })
    )
    expect(host.querySelector('[data-document-preview-mode="edit"]')).toBeNull()

    await act(async () => root.unmount())
  })
})
