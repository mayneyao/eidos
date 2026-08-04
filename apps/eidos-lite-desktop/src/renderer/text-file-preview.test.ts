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
})
