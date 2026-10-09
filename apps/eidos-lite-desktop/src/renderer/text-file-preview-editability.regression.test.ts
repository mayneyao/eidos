// @vitest-environment jsdom

import { act, createElement, useState } from "react"
import { createRoot } from "react-dom/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const editorSurfaceRendered = vi.hoisted(() =>
  vi.fn<
    (props: {
      editingMode?: string
      onEditingModeChange?(mode: "source" | "wysiwyg"): void
      onChange?(content: string): void
      content?: string
      documentKey?: string
    }) => void
  >()
)

vi.mock("./markdown-editor-surface", () => ({
  prepareMarkdownEditorSurface: vi.fn(async () => undefined),
  MarkdownEditorSurface: (props: {
    editingMode?: string
    onEditingModeChange?(mode: "source" | "wysiwyg"): void
    onChange?(content: string): void
    content?: string
    documentKey?: string
  }) => {
    editorSurfaceRendered(props)
    return null
  },
}))

import { prepareTextFilePreview, TextFilePreview } from "./text-file-preview"
import type { TextFilePreviewResult } from "../shared/contracts"

describe("Markdown editability regression", () => {
  beforeEach(() => {
    editorSurfaceRendered.mockClear()
    ;(window as unknown as { eidosLite: unknown }).eidosLite = {
      saveTextFile: vi.fn(),
    }
  })

  it("opens a new Markdown file directly in WYSIWYG edit mode", async () => {
    const onEditingModeChange = vi.fn()
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
          markdownFileEditingMode: "wysiwyg",
          theme: "light",
          platform: "darwin",
          onEditingModeChange,
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

    editorSurfaceRendered.mock.lastCall?.[0].onEditingModeChange?.("source")
    expect(onEditingModeChange).toHaveBeenCalledWith("source")

    await act(async () => root.unmount())
  })

  it("keeps concurrent typing and editor identity after a hook rename", async () => {
    let complete!: (result: unknown) => void
    const save = vi.fn(
      () =>
        new Promise((resolve) => {
          complete = resolve
        })
    )
    ;(window as unknown as { eidosLite: unknown }).eidosLite = {
      saveTextFile: save,
    }
    const initial = {
      type: "text" as const,
      relativePath: "Old.md",
      content: "# Old",
      encoding: "utf-8" as const,
      bom: false,
      revision: "one",
      browserPreview: { kind: "markdown" as const },
      size: 5,
      modifiedAtMs: 0,
      truncated: false,
    }
    const changes: Record<string, { content: string; revision: string }> = {}
    function Harness() {
      const [preview, setPreview] = useState<
        Extract<TextFilePreviewResult, { type: "text" }>
      >({ ...initial, editorIdentity: "Old.md" })
      const [drafts, setDrafts] = useState(changes)
      return createElement(TextFilePreview, {
        preview,
        draft: drafts[preview.relativePath],
        theme: "light",
        markdownFileEditingMode: "wysiwyg",
        platform: "darwin",
        onSaved: (file) =>
          setPreview({
            ...file,
            browserPreview: { kind: "markdown" },
            editorIdentity: "Old.md",
          }),
        onReload: () => {},
        onReveal: () => {},
        onDraftChange: (path, draft) =>
          setDrafts((current) => {
            const next = { ...current }
            if (draft) next[path] = draft
            else delete next[path]
            return next
          }),
      })
    }
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(createElement(Harness)))
    await act(async () =>
      editorSurfaceRendered.mock.lastCall?.[0].onChange?.("# New")
    )
    const identity = editorSurfaceRendered.mock.lastCall?.[0].documentKey
    await act(async () => {
      host.querySelector("section")!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "s",
          ctrlKey: true,
          bubbles: true,
        })
      )
    })
    await act(async () =>
      editorSurfaceRendered.mock.lastCall?.[0].onChange?.("# New\nStill typing")
    )
    await act(async () =>
      complete({
        status: "saved",
        file: {
          ...initial,
          relativePath: "New.md",
          content: "# New",
          revision: "two",
        },
      })
    )
    expect(editorSurfaceRendered.mock.lastCall?.[0].content).toBe(
      "# New\nStill typing"
    )
    expect(editorSurfaceRendered.mock.lastCall?.[0].documentKey).toBe(identity)
    expect(host.querySelector("section")?.dataset.textFilePreview).toBe(
      "New.md"
    )
    expect(save).toHaveBeenCalledWith({
      relativePath: "Old.md",
      content: "# New",
      expectedRevision: "one",
    })
    await act(async () => root.unmount())
    host.remove()
  })
})
