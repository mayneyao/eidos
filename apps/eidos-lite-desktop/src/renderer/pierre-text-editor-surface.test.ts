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
  fileOptions: vi.fn(),
  onEditorChange: undefined as
    | ((file: { contents: string }) => void)
    | undefined,
}))

vi.mock("@pierre/diffs/edit", () => ({
  Editor: class Editor {
    initialOptions: Record<string, unknown>
    cleanUp = vi.fn()
    setOptions = vi.fn()

    constructor(options: Record<string, unknown>) {
      this.initialOptions = options
    }
  },
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
    editorOptions: { onChange(file: { contents: string }): void }
    file: { contents: string }
    options: { themeType: "light" | "dark" }
  }) => {
    pierre.fileContents(file.contents)
    pierre.fileOptions(options)
    pierre.onEditorChange = editorOptions.onChange
    useEffect(() => {
      const editor = pierre.createEditor?.(editorOptions)
      pierre.editorInstances(editor)
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
    expect(editor.setOptions).toHaveBeenCalledTimes(2)
    expect(editor.setOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ persistState: true })
    )

    await act(async () => root.unmount())
  })
})
