import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, vi } from "vitest"

const editorModuleLoaded = vi.hoisted(() => vi.fn())
const saveTextFile = vi.hoisted(() => vi.fn())
const editorSurfaceRendered = vi.hoisted(() =>
  vi.fn<(props: { onChange(content: string): void }) => void>()
)

vi.mock("./pierre-text-editor-surface", () => {
  editorModuleLoaded()
  return {
    default: (props: { onChange(content: string): void }) => {
      editorSurfaceRendered(props)
      return null
    },
  }
})

import { prepareTextFilePreview, TextFilePreview } from "./text-file-preview"

describe("TextFilePreview", () => {
  beforeEach(() => {
    editorModuleLoaded.mockClear()
    editorSurfaceRendered.mockClear()
    saveTextFile.mockClear()
    vi.stubGlobal("window", { eidosLite: { saveTextFile } })
  })

  it("renders bounded text as an explicit read-only preview", () => {
    const markup = renderToStaticMarkup(
      createElement(TextFilePreview, {
        preview: {
          type: "text",
          relativePath: "notes/readme.md",
          content: "first line\nsecond line",
          encoding: "utf-8",
          bom: false,
          revision: "a".repeat(64),
          size: 2_097_200,
          modifiedAtMs: 0,
          truncated: true,
        },
        theme: "light",
        platform: "darwin",
        onReveal: () => undefined,
        onSaved: () => undefined,
        onReload: () => undefined,
        onDraftChange: () => undefined,
      })
    )

    expect(markup).toContain('data-text-file-preview="notes/readme.md"')
    expect(markup).toContain('data-text-file-preview-state="text"')
    expect(markup).toContain('data-text-file-preview-truncated="true"')
    expect(markup).toContain("Read-only")
    expect(markup).not.toContain("2 lines")
    expect(markup).toContain("Showing the first 2 MB")
  })

  it("keeps binary files in-app with a safe fallback", () => {
    const markup = renderToStaticMarkup(
      createElement(TextFilePreview, {
        preview: {
          type: "unavailable",
          relativePath: "assets/image.bin",
          reason: "binary",
          size: 4,
          modifiedAtMs: 0,
        },
        theme: "dark",
        platform: "darwin",
        onReveal: () => undefined,
        onSaved: () => undefined,
        onReload: () => undefined,
        onDraftChange: () => undefined,
      })
    )

    expect(markup).toContain('data-text-file-preview-state="binary"')
    expect(markup).toContain("Preview unavailable")
    expect(markup).toContain("Reveal in Finder")
  })

  it("prepares the editor before an editable document becomes active", async () => {
    const preview = {
      type: "text",
      relativePath: "notes/readme.md",
      content: "# Readme",
      encoding: "utf-8",
      bom: false,
      revision: "a".repeat(64),
      size: 8,
      modifiedAtMs: 0,
      truncated: false,
    } as const
    const onDraftChange = vi.fn()

    await prepareTextFilePreview(preview)
    const markup = renderToStaticMarkup(
      createElement(TextFilePreview, {
        preview,
        theme: "light",
        platform: "darwin",
        onReveal: () => undefined,
        onSaved: () => undefined,
        onReload: () => undefined,
        onDraftChange,
      })
    )
    editorSurfaceRendered.mock.lastCall?.[0].onChange("# Changed")

    expect(editorModuleLoaded).toHaveBeenCalledTimes(1)
    expect(markup).not.toContain("Loading text editor")
    expect(markup).not.toContain("text-preview-meta")
    expect(onDraftChange).toHaveBeenCalledWith("notes/readme.md", {
      content: "# Changed",
      revision: "a".repeat(64),
    })
    expect(saveTextFile).not.toHaveBeenCalled()
  })

  it.each(["preview", "source"] as const)(
    "opens HTML in %s mode without a toolbar",
    async (htmlFileOpenMode) => {
      const preview = {
        type: "text",
        relativePath: "dashboard.html",
        content: "<!doctype html><title>Dashboard</title>",
        encoding: "utf-8",
        bom: false,
        revision: "a".repeat(64),
        browserPreview: {
          kind: "html",
          url: "eidos-space-document://preview/example-ticket",
        },
        size: 40,
        modifiedAtMs: 0,
        truncated: false,
      } as const

      await prepareTextFilePreview(preview)
      const markup = renderToStaticMarkup(
        createElement(TextFilePreview, {
          preview,
          htmlFileOpenMode,
          theme: "light",
          platform: "darwin",
          onReveal: () => undefined,
          onSaved: () => undefined,
          onReload: () => undefined,
          onDraftChange: () => undefined,
        })
      )

      expect(markup).toContain('data-document-file-preview="dashboard.html"')
      expect(markup).toContain('data-document-file-preview-kind="html"')
      expect(markup).toContain(
        `data-document-file-preview-mode="${htmlFileOpenMode === "source" ? "edit" : "preview"}"`
      )
      if (htmlFileOpenMode === "preview")
        expect(markup).toContain('class="html-preview-host"')
      else expect(markup).not.toContain('class="html-preview-host"')
      expect(markup).not.toContain("<iframe")
      expect(markup).not.toContain('src="eidos-space-document:')
      expect(markup).not.toContain("document-preview-toolbar")
      if (htmlFileOpenMode === "preview") {
        expect(editorModuleLoaded).not.toHaveBeenCalled()
        expect(editorSurfaceRendered).not.toHaveBeenCalled()
      }
    }
  )

  it("opens Markdown directly in the source editor by default", async () => {
    const preview = {
      type: "text",
      relativePath: "README.md",
      content: "# Read me",
      encoding: "utf-8",
      bom: false,
      revision: "b".repeat(64),
      browserPreview: {
        kind: "markdown",
      },
      size: 9,
      modifiedAtMs: 0,
      truncated: false,
    } as const

    await prepareTextFilePreview(preview)
    const markup = renderToStaticMarkup(
      createElement(TextFilePreview, {
        preview,
        theme: "dark",
        platform: "darwin",
        onReveal: () => undefined,
        onSaved: () => undefined,
        onReload: () => undefined,
        onDraftChange: () => undefined,
      })
    )

    expect(markup).toContain('data-text-file-editor="README.md"')
    expect(markup).not.toContain("Document view mode")
    expect(markup).not.toContain(">Preview<")
    expect(markup).not.toContain(">Edit<")
    expect(editorSurfaceRendered).toHaveBeenCalledTimes(1)
  })

  it("opens Markdown directly in the editor when WYSIWYG is selected", async () => {
    const preview = {
      type: "text",
      relativePath: "README.md",
      content: "# Read me",
      encoding: "utf-8",
      bom: false,
      revision: "b".repeat(64),
      browserPreview: { kind: "markdown" },
      size: 9,
      modifiedAtMs: 0,
      truncated: false,
    } as const

    await prepareTextFilePreview(preview, "wysiwyg")
    const markup = renderToStaticMarkup(
      createElement(TextFilePreview, {
        preview,
        markdownFileEditingMode: "wysiwyg",
        theme: "dark",
        platform: "darwin",
        onReveal: () => undefined,
        onSaved: () => undefined,
        onReload: () => undefined,
        onDraftChange: () => undefined,
      })
    )

    expect(markup).toContain('data-text-file-editor="README.md"')
    expect(markup).not.toContain("Document view mode")
    expect(markup).not.toContain(">Preview<")
    expect(markup).not.toContain(">Edit<")
  })

  it("offers recovery immediately when reopening a draft against a newer disk revision", () => {
    const markup = renderToStaticMarkup(
      createElement(TextFilePreview, {
        preview: {
          type: "text",
          relativePath: "note.md",
          content: "external edit",
          encoding: "utf-8",
          bom: false,
          revision: "new",
          size: 13,
          modifiedAtMs: 1,
          truncated: false,
        },
        draft: { content: "my draft", revision: "old" },
        theme: "light",
        platform: "darwin",
        onReveal: () => {},
        onSaved: () => {},
        onReload: () => {},
        onDraftChange: () => {},
      })
    )
    expect(markup).toContain("Changed on disk")
    expect(markup).toContain("Save a copy")
    expect(markup).toContain("Reload from disk")
  })
})
