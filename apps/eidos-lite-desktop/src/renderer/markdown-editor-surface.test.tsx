// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const sourceEditor = vi.hoisted(() => vi.fn())
const wysiwygEditor = vi.hoisted(() => vi.fn())

vi.mock("./pierre-text-editor-surface", () => ({
  default: (props: Record<string, unknown>) => {
    sourceEditor(props)
    return <div data-testid="source-editor" />
  },
}))

vi.mock("@eidos.space/markdown", () => ({
  MarkdownEditor: (props: Record<string, unknown>) => {
    wysiwygEditor(props)
    return <div data-testid="wysiwyg-editor" />
  },
}))

import { MarkdownEditorSurface } from "./markdown-editor-surface"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("MarkdownEditorSurface", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    sourceEditor.mockClear()
    wysiwygEditor.mockClear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    Object.assign(window, {
      eidosLite: {
        openExternalUrl: vi.fn(),
      },
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("routes source mode to Pierre", async () => {
    await act(async () => {
      root.render(
        createElement(MarkdownEditorSurface, {
          documentKey: "README.md",
          relativePath: "README.md",
          content: "# Source",
          editingMode: "source",
          theme: "light",
          onChange: vi.fn(),
        })
      )
      await Promise.resolve()
    })

    expect(
      container.querySelector('[data-testid="source-editor"]')
    ).not.toBeNull()
    expect(sourceEditor).toHaveBeenCalledWith(
      expect.objectContaining({ content: "# Source" })
    )
    expect(wysiwygEditor).not.toHaveBeenCalled()
  })

  it("routes rich-text mode to the Lexical package", async () => {
    await act(async () => {
      root.render(
        createElement(MarkdownEditorSurface, {
          documentKey: "record:body",
          relativePath: "content.md",
          content: "# WYSIWYG",
          editingMode: "wysiwyg",
          theme: "dark",
          layout: "embedded",
          inputProfile: "fragment",
          onChange: vi.fn(),
        })
      )
      await Promise.resolve()
    })

    expect(
      container.querySelector('[data-testid="wysiwyg-editor"]')
    ).not.toBeNull()
    expect(wysiwygEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        documentKey: "record:body",
        markdown: "# WYSIWYG",
        theme: "dark",
        layout: "embedded",
        inputProfile: "fragment",
      })
    )
    expect(wysiwygEditor.mock.calls[0][0]).not.toHaveProperty(
      "onRequestSourceMode"
    )
    expect(wysiwygEditor.mock.calls[0][0]).not.toHaveProperty(
      "onUnsupportedMarkdown"
    )
    expect(sourceEditor).not.toHaveBeenCalled()
  })
})
