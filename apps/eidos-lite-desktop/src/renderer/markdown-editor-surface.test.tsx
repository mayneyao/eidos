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
  markdownReferenceTargets: (source: string) =>
    source.includes("# Target")
      ? [
          { target: "#Target", title: "Target" },
          { target: "#^id", title: "id — Body" },
        ]
      : [],
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

  beforeEach(async () => {
    await import("@eidos.space/markdown/presets")
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
        previewTextFile: vi.fn().mockResolvedValue({
          type: "text",
          content: "# Target\n\nBody",
          truncated: false,
        }),
        searchSpacePaths: vi.fn().mockResolvedValue([
          { name: "Note.md", relativePath: "Notes/Note.md", kind: "file" },
          { name: "image.png", relativePath: "image.png", kind: "file" },
          {
            name: "customers.eidos",
            relativePath: "business/customers.eidos",
            kind: "eidos",
          },
          { name: "secret.md", relativePath: "secret.md", kind: "symlink" },
        ]),
        searchMarkdownNotes: vi.fn().mockResolvedValue([]),
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

  it("uses alias matches as labels but keeps canonical file destinations", async () => {
    vi.mocked(window.eidosLite.searchSpacePaths).mockResolvedValue([])
    vi.mocked(window.eidosLite.searchMarkdownNotes).mockResolvedValue([
      {
        relativePath: "Notes/Actual.md",
        name: "Actual.md",
        kind: "file",
        score: 100,
        matchedAlias: "Guide",
      },
    ])
    await act(async () =>
      root.render(
        <MarkdownEditorSurface
          documentKey="index.md"
          relativePath="index.md"
          content=""
          editingMode="wysiwyg"
          theme="light"
          onChange={vi.fn()}
        />
      )
    )
    const search = wysiwygEditor.mock.calls.at(-1)![0].searchNotes
    expect(
      await search({
        query: "Guide",
        documentKey: "index.md",
        signal: new AbortController().signal,
      })
    ).toEqual([
      { title: "Guide", path: "Notes/Actual.md", displayText: "Guide" },
    ])
  })

  it("offers an unresolved note reference without creating a file during search", async () => {
    vi.mocked(window.eidosLite.searchSpacePaths).mockResolvedValue([])
    const createTextFile = vi.fn()
    Object.assign(window.eidosLite, { createTextFile })
    await act(async () => {
      root.render(
        <MarkdownEditorSurface
          documentKey="Notes/index.md"
          relativePath="Notes/index.md"
          content=""
          editingMode="wysiwyg"
          theme="light"
          onChange={vi.fn()}
        />
      )
    })
    const search = wysiwygEditor.mock.calls.at(-1)![0].searchNotes
    const signal = new AbortController().signal
    expect(
      await search({ query: "New note", documentKey: "Notes/index.md", signal })
    ).toEqual([
      { path: "/Notes/New note.md", title: "Link to new note: New note" },
    ])
    expect(
      await search({
        query: "data.eidos",
        documentKey: "Notes/index.md",
        signal,
      })
    ).toEqual([])
    expect(createTextFile).not.toHaveBeenCalled()
  })

  it("completes heading and block destinations using the referenced file", async () => {
    await act(async () => {
      root.render(
        <MarkdownEditorSurface
          documentKey="index.md"
          relativePath="index.md"
          content="# Target"
          editingMode="wysiwyg"
          theme="light"
          onChange={vi.fn()}
        />
      )
    })
    const search = wysiwygEditor.mock.calls.at(-1)![0].searchNotes
    const signal = new AbortController().signal
    expect(
      await search({ query: "#Tar", documentKey: "index.md", signal })
    ).toEqual([{ path: "/index.md#Target", title: "Target" }])
    expect(window.eidosLite.previewTextFile).not.toHaveBeenCalled()
    expect(
      await search({
        query: "Notes/Note.md#^",
        documentKey: "index.md",
        signal,
      })
    ).toEqual([{ path: "/Notes/Note.md#^id", title: "id — Body" }])
    expect(window.eidosLite.previewTextFile).toHaveBeenCalledWith(
      "Notes/Note.md"
    )
  })

  it("does not install a wiki-embed renderer or fetch embedded files", async () => {
    await act(async () => {
      root.render(
        <MarkdownEditorSurface
          documentKey="index.md"
          relativePath="index.md"
          content="![[Note]]"
          editingMode="wysiwyg"
          theme="light"
          onChange={vi.fn()}
        />
      )
    })
    expect(
      wysiwygEditor.mock.calls.at(-1)![0].renderDocumentEmbed
    ).toBeUndefined()
    expect(window.eidosLite.previewTextFile).not.toHaveBeenCalled()
  })

  it("enables wiki-link authoring for the default Lite profile", async () => {
    await import("@eidos.space/markdown/presets")
    await import("@eidos.space/markdown/plugins")
    await act(async () => {
      root.render(
        <MarkdownEditorSurface
          documentKey="index.md"
          relativePath="index.md"
          content=""
          editingMode="wysiwyg"
          theme="light"
          onChange={vi.fn()}
        />
      )
    })
    await vi.waitFor(() => expect(wysiwygEditor).toHaveBeenCalled())
    const props = wysiwygEditor.mock.calls.at(-1)![0]
    expect(props.profile).toBeUndefined()
    expect(props.preset.plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "markdown.wikilink" }),
      ])
    )
    expect(props.preset.plugins).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "obsidian.syntax" }),
      ])
    )
    const signal = new AbortController().signal
    await expect(
      props.searchNotes({ documentKey: "index.md", query: "", signal })
    ).resolves.toEqual([
      { title: "Note", path: "Notes/Note.md" },
      { title: "image.png", path: "/image.png" },
      { title: "customers.eidos", path: "business/customers.eidos" },
    ])
    expect(window.eidosLite.searchSpacePaths).toHaveBeenCalledWith(".", 200)
  })

  it("routes rich-text mode to the Lexical package", async () => {
    const onOpenInternalLink = vi.fn()
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
          compatibilityProfile: "obsidian",
          onOpenInternalLink,
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
        profile: undefined,
        preset: expect.objectContaining({ id: "eidos.composable" }),
        onOpenInternalLink,
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
    "toggles %s mode while preserving the current draft",
    async (editingMode) => {
      const onChange = vi.fn()
      await act(async () => {
        root.render(
          createElement(MarkdownEditorSurface, {
            documentKey: "readme.md",
            relativePath: "readme.md",
            assetDocumentPath: "readme.md",
            content: "# Unsaved draft",
            editingMode,
            theme: "light",
            onChange,
          })
        )
      })
      await act(async () => {
        window.dispatchEvent(
          new CustomEvent("eidos-lite:toggle-markdown-editing-mode", {
            detail: { relativePath: "readme.md" },
          })
        )
      })
      const next = editingMode === "source" ? "wysiwyg" : "source"
      expect(
        container
          .querySelector("[data-markdown-editing-mode]")
          ?.getAttribute("data-markdown-editing-mode")
      ).toBe(next)
      const props = (
        next === "source" ? sourceEditor : wysiwygEditor
      ).mock.calls.at(-1)?.[0]
      expect(next === "source" ? props.content : props.markdown).toBe(
        "# Unsaved draft"
      )
      expect(props.autoFocus).toBe(true)
      expect(onChange).not.toHaveBeenCalled()
    }
  )

  it.each(["example.html", "example.txt"])(
    "does not toggle %s",
    async (relativePath) => {
      await act(async () => {
        root.render(
          createElement(MarkdownEditorSurface, {
            documentKey: relativePath,
            relativePath,
            assetDocumentPath: relativePath,
            content: "Draft",
            editingMode: "source",
            theme: "light",
            onChange: vi.fn(),
          })
        )
      })
      await act(async () => {
        window.dispatchEvent(
          new CustomEvent("eidos-lite:toggle-markdown-editing-mode", {
            detail: { relativePath },
          })
        )
      })
      expect(
        container
          .querySelector("[data-markdown-editing-mode]")
          ?.getAttribute("data-markdown-editing-mode")
      ).toBe("source")
    }
  )

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
