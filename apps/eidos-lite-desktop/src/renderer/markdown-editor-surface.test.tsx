// @vitest-environment jsdom

import { act, createElement, StrictMode } from "react"
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
    Object.defineProperties(URL, {
      createObjectURL: {
        configurable: true,
        value: vi.fn(() => "blob:pasted"),
      },
      revokeObjectURL: { configurable: true, value: vi.fn() },
    })
    Object.assign(window, {
      eidosLite: {
        openExternalUrl: vi.fn(),
        importMarkdownImage: vi.fn(),
        resolveMarkdownImage: vi.fn(),
      },
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    Reflect.deleteProperty(URL, "createObjectURL")
    Reflect.deleteProperty(URL, "revokeObjectURL")
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
    expect(wysiwygEditor.mock.calls[0][0].onPasteImage).toBeUndefined()
    expect(wysiwygEditor.mock.calls[0][0].resolveImageUrl).toBeUndefined()
    expect(sourceEditor).not.toHaveBeenCalled()
  })

  it.each(["source", "wysiwyg"] as const)(
    "enables document-local image services in %s mode",
    async (editingMode) => {
      await act(async () => {
        root.render(
          createElement(MarkdownEditorSurface, {
            documentKey: "notes/readme.md",
            relativePath: "notes/readme.md",
            assetDocumentPath: "notes/readme.md",
            content: "# Readme",
            editingMode,
            theme: "light",
            onChange: vi.fn(),
          })
        )
        await Promise.resolve()
      })

      const props =
        editingMode === "source"
          ? sourceEditor.mock.calls.at(-1)?.[0]
          : wysiwygEditor.mock.calls.at(-1)?.[0]
      expect(props.onPasteImage).toEqual(expect.any(Function))
      if (editingMode === "wysiwyg") {
        expect(props.resolveImageUrl).toEqual(expect.any(Function))
      }
    }
  )

  it("keeps the image host active through Strict Mode effect replay", async () => {
    vi.mocked(window.eidosLite.importMarkdownImage).mockResolvedValue({
      markdownUrl: "assets/pasted.png",
      relativePath: "notes/assets/pasted.png",
      mediaType: "image/png",
    })
    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(MarkdownEditorSurface, {
            documentKey: "notes/readme.md",
            relativePath: "notes/readme.md",
            assetDocumentPath: "notes/readme.md",
            content: "# Readme",
            editingMode: "wysiwyg",
            theme: "light",
            onChange: vi.fn(),
          })
        )
      )
      await Promise.resolve()
    })

    const onPasteImage = wysiwygEditor.mock.calls.at(-1)?.[0]
      .onPasteImage as (request: {
      documentKey: string
      file: File
      index: number
      total: number
      signal: AbortSignal
    }) => Promise<unknown>
    await expect(
      onPasteImage({
        documentKey: "notes/readme.md",
        file: new File(["png"], "pasted.png", { type: "image/png" }),
        index: 0,
        total: 1,
        signal: new AbortController().signal,
      })
    ).resolves.toMatchObject({ markdownUrl: "assets/pasted.png" })
    expect(window.eidosLite.importMarkdownImage).toHaveBeenCalledOnce()
  })
})
