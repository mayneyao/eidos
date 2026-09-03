// @vitest-environment jsdom

import { act, createElement, type ReactNode, useEffect } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const pierre = vi.hoisted(() => ({
  createEditor: undefined as
    | ((options: Record<string, unknown>) => unknown)
    | undefined,
  editorInstances: vi.fn(),
  fileContents: vi.fn(),
  fileLifecycle: vi.fn(),
  fileLineMarkup: vi.fn(),
  fileOptions: vi.fn(),
  onEditorChange: undefined as
    | ((file: { contents: string }) => void)
    | undefined,
}))

vi.mock("@pierre/diffs/edit", () => ({
  Editor: class Editor {
    initialOptions: Record<string, unknown>
    applyEdits = vi.fn()
    cleanUp = vi.fn()
    focus = vi.fn()
    getState = vi.fn(() => ({ selections: undefined, view: undefined }))
    setOptions = vi.fn()

    constructor(options: Record<string, unknown>) {
      this.initialOptions = options
    }
  },
}))

vi.mock("@eidos.space/markdown", () => ({
  markdownImageSource: (url: string, alt: string) => `![${alt}](<${url}>)`,
}))

vi.mock("@pierre/diffs/react", () => ({
  EditProvider: ({
    children,
    createEditor,
  }: {
    children: ReactNode
    createEditor(options: Record<string, unknown>): unknown
  }) => {
    pierre.createEditor = createEditor
    return children
  },
  Virtualizer: ({ children }: { children: ReactNode }) => children,
  File: ({
    editorOptions,
    file,
    options,
  }: {
    editorOptions: {
      onAttach?(editor: { focus(): void }): void
      onChange(file: { contents: string }): void
    }
    file: { contents: string }
    options: {
      themeType: "light" | "dark"
      onPostRender?(node: HTMLElement): void
    }
  }) => {
    pierre.fileContents(file.contents)
    pierre.fileOptions(options)
    const fileContainer = document.createElement("div")
    const shadowRoot = fileContainer.attachShadow({ mode: "open" })
    shadowRoot.innerHTML =
      '<div data-line="1" data-line-type="context"><span data-char="0"></span></div>'
    options.onPostRender?.(fileContainer)
    pierre.fileLineMarkup(
      shadowRoot.querySelector('[data-line="1"]')?.innerHTML
    )
    pierre.onEditorChange = editorOptions.onChange
    useEffect(() => {
      const editor = pierre.createEditor?.(editorOptions)
      pierre.editorInstances(editor)
      editorOptions.onAttach?.(editor as { focus(): void })
      pierre.fileLifecycle(`mount:${options.themeType}`)
      return () => {
        ;(editor as { cleanUp?(): void } | undefined)?.cleanUp?.()
        pierre.fileLifecycle(`unmount:${options.themeType}`)
      }
    }, [])
    return null
  },
}))

import PierreTextEditorSurface from "./pierre-text-editor-surface"

describe("PierreTextEditorSurface", () => {
  beforeEach(() => {
    pierre.createEditor = undefined
    pierre.editorInstances.mockClear()
    pierre.fileContents.mockClear()
    pierre.fileLifecycle.mockClear()
    pierre.fileLineMarkup.mockClear()
    pierre.fileOptions.mockClear()
    pierre.onEditorChange = undefined
  })

  it.each(["light", "dark"] as const)(
    "synchronizes the %s application theme to Pierre",
    (theme) => {
      renderToStaticMarkup(
        createElement(PierreTextEditorSurface, {
          relativePath: "notes/readme.md",
          content: "# Readme",
          theme,
          onChange: () => undefined,
        })
      )

      expect(pierre.fileOptions).toHaveBeenCalledWith(
        expect.objectContaining({ themeType: theme })
      )
    }
  )

  it("wraps long text instead of adding a horizontal scrollbar", () => {
    renderToStaticMarkup(
      createElement(PierreTextEditorSurface, {
        relativePath: "notes/readme.md",
        content: "A long line",
        theme: "light",
        onChange: () => undefined,
      })
    )

    expect(pierre.fileOptions).toHaveBeenCalledWith(
      expect.objectContaining({ overflow: "wrap" })
    )
  })

  it("recreates the imperative editor with its current buffer when the theme changes", async () => {
    const host = document.createElement("div")
    const root = createRoot(host)
    const onChange = vi.fn()

    await act(async () => {
      root.render(
        createElement(PierreTextEditorSurface, {
          relativePath: "notes/readme.md",
          content: "# Initial",
          theme: "light",
          onChange,
        })
      )
    })

    await act(async () => {
      pierre.onEditorChange?.({ contents: "# Unsaved edit" })
      root.render(
        createElement(PierreTextEditorSurface, {
          relativePath: "notes/readme.md",
          content: "# Initial",
          theme: "dark",
          onChange,
        })
      )
    })

    expect(pierre.fileLifecycle.mock.calls.map(([event]) => event)).toEqual([
      "mount:light",
      "unmount:light",
      "mount:dark",
    ])
    expect(pierre.fileContents).toHaveBeenLastCalledWith("# Unsaved edit")
    expect(onChange).toHaveBeenCalledWith("# Unsaved edit")

    await act(async () => {
      pierre.onEditorChange?.({ contents: "# Second unsaved edit" })
      root.render(
        createElement(PierreTextEditorSurface, {
          relativePath: "notes/readme.md",
          content: "# Initial",
          theme: "light",
          onChange,
        })
      )
    })

    expect(pierre.fileLifecycle.mock.calls.map(([event]) => event)).toEqual([
      "mount:light",
      "unmount:light",
      "mount:dark",
      "unmount:dark",
      "mount:light",
    ])
    expect(pierre.fileContents).toHaveBeenLastCalledWith(
      "# Second unsaved edit"
    )
    const mountedEditors = pierre.editorInstances.mock.calls.map(
      ([editor]) => editor
    )
    expect(new Set(mountedEditors)).toHaveLength(1)
    const editor = mountedEditors[0] as {
      initialOptions: Record<string, unknown>
      setOptions: ReturnType<typeof vi.fn>
    }
    expect(editor.initialOptions).toMatchObject({ persistState: true })
    expect(editor.setOptions).toHaveBeenCalledTimes(3)
    expect(editor.setOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ persistState: true })
    )

    await act(async () => root.unmount())
  })

  it("can disable persisted editor state for externally controlled content", async () => {
    const host = document.createElement("div")
    const root = createRoot(host)

    await act(async () => {
      root.render(
        createElement(PierreTextEditorSurface, {
          relativePath: "notes/readme.md",
          content: "local\n",
          theme: "light",
          persistEditorState: false,
          onChange: () => undefined,
        })
      )
    })

    const editor = pierre.editorInstances.mock.calls[0]?.[0] as {
      initialOptions: Record<string, unknown>
    }
    expect(editor.initialOptions).toMatchObject({ persistState: false })

    await act(async () => {
      root.render(
        createElement(PierreTextEditorSurface, {
          relativePath: "notes/readme.md",
          content: "hosted\n",
          theme: "light",
          persistEditorState: false,
          onChange: () => undefined,
        })
      )
    })

    expect(pierre.fileContents).toHaveBeenLastCalledWith("hosted\n")

    await act(async () => {
      root.render(
        createElement(PierreTextEditorSurface, {
          relativePath: "notes/readme.md",
          content: "hosted\n",
          theme: "light",
          persistEditorState: true,
          onChange: () => undefined,
        })
      )
    })

    expect(
      (
        pierre.editorInstances.mock.calls[0]?.[0] as {
          setOptions: ReturnType<typeof vi.fn>
        }
      ).setOptions
    ).toHaveBeenLastCalledWith({ persistState: true })

    await act(async () => root.unmount())
  })

  it("focuses the editable surface after an auto-focused attach", async () => {
    const host = document.createElement("div")
    const root = createRoot(host)

    await act(async () => {
      root.render(
        createElement(PierreTextEditorSurface, {
          relativePath: "notes/new.md",
          content: "",
          theme: "light",
          autoFocus: true,
          onChange: () => undefined,
        })
      )
    })

    const editor = pierre.editorInstances.mock.calls[0]?.[0] as {
      focus: ReturnType<typeof vi.fn>
    }
    expect(editor.focus).toHaveBeenCalledWith({
      lineNumber: 1,
      character: 0,
      preventScroll: true,
    })
    expect(pierre.fileLineMarkup).toHaveBeenCalledWith("<br>")

    await act(async () => root.unmount())
  })

  it("restores the editor focus when the host requests file-content focus", async () => {
    const host = document.createElement("div")
    const root = createRoot(host)
    const renderEditor = (focusRequestToken: number) =>
      createElement(PierreTextEditorSurface, {
        relativePath: "notes/readme.md",
        content: "# Readme",
        theme: "light" as const,
        focusRequestToken,
        onChange: () => undefined,
      })

    await act(async () => {
      root.render(renderEditor(0))
    })
    const editor = pierre.editorInstances.mock.calls[0]?.[0] as {
      focus: ReturnType<typeof vi.fn>
    }
    expect(editor.focus).not.toHaveBeenCalled()

    await act(async () => {
      root.render(renderEditor(1))
    })
    expect(editor.focus).toHaveBeenCalledWith({
      lineNumber: "first-visible",
      preventScroll: true,
    })

    await act(async () => root.unmount())
  })

  it("preserves an existing Source caret when focus returns", async () => {
    const host = document.createElement("div")
    const root = createRoot(host)
    const renderEditor = (focusRequestToken: number) =>
      createElement(PierreTextEditorSurface, {
        relativePath: "notes/readme.md",
        content: "# Readme",
        theme: "light" as const,
        focusRequestToken,
        onChange: () => undefined,
      })

    await act(async () => {
      root.render(renderEditor(0))
    })
    const editor = pierre.editorInstances.mock.calls[0]?.[0] as {
      focus: ReturnType<typeof vi.fn>
      getState: ReturnType<typeof vi.fn>
    }
    editor.getState.mockReturnValue({ selections: [{}], view: undefined })

    await act(async () => {
      root.render(renderEditor(1))
    })
    expect(editor.focus).toHaveBeenCalledWith({ preventScroll: true })

    await act(async () => root.unmount())
  })

  it("does not rewrite the first line of a non-empty file", () => {
    renderToStaticMarkup(
      createElement(PierreTextEditorSurface, {
        relativePath: "notes/readme.md",
        content: "# Readme",
        theme: "light",
        onChange: () => undefined,
      })
    )

    expect(pierre.fileLineMarkup).toHaveBeenCalledWith(
      '<span data-char="0"></span>'
    )
  })

  it("persists clipboard images and inserts undoable Markdown", async () => {
    const host = document.createElement("div")
    const root = createRoot(host)
    const onPasteImage = vi.fn(async ({ file }: { file: File }) => ({
      markdownUrl: "assets/pasted.png",
      alt: file.name,
    }))

    await act(async () => {
      root.render(
        createElement(PierreTextEditorSurface, {
          relativePath: "notes/readme.md",
          content: "# Readme",
          theme: "light",
          onPasteImage,
          onChange: () => undefined,
        })
      )
    })
    const editor = pierre.editorInstances.mock.calls[0]?.[0] as {
      applyEdits: ReturnType<typeof vi.fn>
      getState: ReturnType<typeof vi.fn>
    }
    editor.getState.mockReturnValue({
      selections: [
        {
          start: { line: 0, character: 8 },
          end: { line: 0, character: 8 },
          direction: 0,
        },
      ],
    })
    const paste = new Event("paste", { bubbles: true, composed: true })
    const image = new File([PNG_BYTES], "pasted.png", { type: "image/png" })
    Object.defineProperty(paste, "clipboardData", {
      value: {
        items: [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => image,
          },
        ],
        files: [image],
      },
    })

    await act(async () => {
      host
        .querySelector(".text-file-editor-paste-surface")
        ?.dispatchEvent(paste)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onPasteImage).toHaveBeenCalledWith(
      expect.objectContaining({
        documentKey: "notes/readme.md",
        file: image,
        index: 0,
        total: 1,
      })
    )
    expect(editor.applyEdits).toHaveBeenCalledWith(
      [
        {
          range: {
            start: { line: 0, character: 8 },
            end: { line: 0, character: 8 },
          },
          newText: "![pasted.png](<assets/pasted.png>)",
        },
      ],
      true
    )

    await act(async () => root.unmount())
  })
})

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])
