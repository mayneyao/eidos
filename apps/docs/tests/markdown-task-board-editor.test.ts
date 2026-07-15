import { act } from "react"
import type { ExtensionFileEditorContext } from "@eidos.space/extension-sdk"
import type {
  ExtensionTextDocumentSnapshot,
  ExtensionTextEdit,
} from "@eidos.space/extension-surface-protocol"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { activate } from "../examples/markdown-task-board/src/editor"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

function applyTextEdits(text: string, edits: readonly ExtensionTextEdit[]) {
  let next = text
  for (const edit of [...edits].reverse()) {
    next = next.slice(0, edit.start) + edit.text + next.slice(edit.end)
  }
  return next
}

describe("Markdown Task Board surface", () => {
  let root: HTMLDivElement

  beforeEach(() => {
    root = document.createElement("div")
    document.body.append(root)
  })

  afterEach(() => {
    root.remove()
  })

  it("renders counts and toggles only the Markdown checkbox marker", async () => {
    let snapshot: ExtensionTextDocumentSnapshot = {
      documentId: "document-1",
      resource: {
        path: "projects/launch.tasks.md",
        mediaType: "text/markdown",
        languageId: "markdown",
        encoding: "utf-8",
      },
      text: "# Launch\n\n- [ ] Finish UI\n- [x] Write docs\n",
      persistedContentDigest: `sha256:${"1".repeat(64)}`,
      revision: 1,
      savedRevision: 1,
      dirty: false,
      readOnly: false,
      canUndo: false,
      canRedo: false,
    }
    const changeListeners = new Set<() => void>()
    const applyEdits = vi.fn(async (edits: readonly ExtensionTextEdit[]) => {
      snapshot = {
        ...snapshot,
        text: applyTextEdits(snapshot.text, edits),
        revision: snapshot.revision + 1,
        dirty: true,
        canUndo: true,
      }
      for (const listener of changeListeners) listener()
      return snapshot.revision
    })
    const disposable = () => ({ dispose() {} })
    const context: ExtensionFileEditorContext = {
      extensionId: "example.markdown-task-board",
      editorId: "example.markdown-task-board.editor",
      viewId: "view-1",
      root,
      capabilities: {
        editable: true,
        save: true,
        undoRedo: true,
        savePolicy: { mode: "afterDelay", delayMs: 700 },
      },
      appearance: {
        current: {
          colorScheme: "light",
          locale: "en",
          theme: {
            background: "#fff",
            foreground: "#111",
            mutedBackground: "#f5f5f5",
            mutedForeground: "#666",
            border: "#ddd",
            accent: "#eee",
            accentForeground: "#111",
            destructive: "#c00",
            destructiveForeground: "#fff",
            focusRing: "#06f",
            fontFamily: "sans-serif",
            monoFontFamily: "monospace",
          },
        },
        onDidChange: disposable,
      },
      subscriptions: { add() {} },
      document: {
        get snapshot() {
          return snapshot
        },
        applyEdits,
        save: vi.fn(async () => snapshot.revision),
        undo: vi.fn(async () => snapshot.revision),
        redo: vi.fn(async () => snapshot.revision),
        resync: vi.fn(async () => snapshot.revision),
        onDidChange(listener) {
          const notify = () =>
            listener({
              type: "document-replaced",
              reason: "resync",
              snapshot,
            })
          changeListeners.add(notify)
          return {
            dispose() {
              changeListeners.delete(notify)
            },
          }
        },
        onDidChangeState: disposable,
        onDidChangeSaveState: disposable,
      },
    }

    const activation = activate(context)
    expect(root.querySelector(".progress-label")?.textContent).toBe(
      "1 to do · 1 completed · 50%"
    )

    const openTask = Array.from(
      root.querySelectorAll<HTMLButtonElement>(".task-card")
    ).find((button) => button.textContent?.includes("Finish UI"))
    await act(async () => {
      openTask?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    const markerOffset = "# Launch\n\n- [ ]".length - 2
    expect(applyEdits).toHaveBeenCalledWith([
      { start: markerOffset, end: markerOffset + 1, text: "x" },
    ])
    expect(snapshot.text).toContain("- [x] Finish UI")
    expect(root.querySelector(".progress-label")?.textContent).toBe(
      "0 to do · 2 completed · 100%"
    )

    activation?.dispose()
    expect(root.childElementCount).toBe(0)
  })
})
