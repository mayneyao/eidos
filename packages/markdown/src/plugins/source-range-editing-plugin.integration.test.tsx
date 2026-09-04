import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $createParagraphNode,
  $createNodeSelection,
  $getRoot,
  $setSelection,
  KEY_DOWN_COMMAND,
  UNDO_COMMAND,
  type LexicalEditor,
} from "lexical"

import { MarkdownEditor } from "../editor/markdown-editor"
import { $isEfmSourceRangeNode } from "../nodes/efm-source-range-node"
import { eidosMarkdownPlugins } from "../plugin-system/builtins"
import { defineMarkdownPlugin } from "../plugin-system/plugin-api"

let capturedEditor: LexicalEditor | null = null

function CaptureEditor() {
  const [editor] = useLexicalComposerContext()
  capturedEditor = editor
  return null
}

const capturePlugin = defineMarkdownPlugin({
  apiVersion: 1,
  id: "test.capture-editor",
  version: "1.0.0",
  behaviors: [{ id: "test.capture-editor.behavior", component: CaptureEditor }],
})
const plugins = [...eidosMarkdownPlugins, capturePlugin]

function changeTextarea(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  )?.set
  setter?.call(textarea, value)
  textarea.dispatchEvent(new Event("input", { bubbles: true }))
}

function commitTextarea(textarea: HTMLTextAreaElement) {
  textarea.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "Enter",
    })
  )
}

function selectBlocks(...indices: number[]) {
  capturedEditor!.update(
    () => {
      const children = $getRoot().getChildren()
      const selection = $createNodeSelection()
      for (const index of indices) selection.add(children[index].getKey())
      $setSelection(selection)
    },
    { discrete: true }
  )
}

function openSourceEditor() {
  return capturedEditor!.dispatchCommand(
    KEY_DOWN_COMMAND,
    new KeyboardEvent("keydown", { key: "e", cancelable: true })
  )
}

async function flushEditor() {
  await act(async () => {
    await Promise.resolve()
  })
}

describe("SourceRangeEditingPlugin integration", () => {
  let container: HTMLDivElement
  let root: Root
  let onMarkdownChange: ReturnType<typeof vi.fn>
  let onError: ReturnType<typeof vi.fn>

  const renderEditor = async (markdown: string, readOnly = false) => {
    await act(async () => {
      root.render(
        <MarkdownEditor
          documentKey="source-range-test"
          markdown={markdown}
          onMarkdownChange={onMarkdownChange}
          onError={onError}
          plugins={plugins}
          readOnly={readOnly}
          showToolbar={false}
        />
      )
    })
  }

  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    capturedEditor = null
    onMarkdownChange = vi.fn()
    onError = vi.fn()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("commits one exact source slice and reparses it into visual blocks", async () => {
    const original =
      "# Keep\n\n\nMiddle with  \nwrap\n\n> Selected quote\n\nTail\n"
    await renderEditor(original)

    act(() => {
      selectBlocks(1, 2)
      expect(openSourceEditor()).toBe(true)
    })
    await flushEditor()
    const textarea = container.querySelector<HTMLTextAreaElement>(
      "[data-source-range-textarea='true']"
    )!
    expect(textarea.value).toBe("Middle with  \nwrap\n\n> Selected quote")
    expect(textarea.selectionStart).toBe(textarea.value.length)
    expect(textarea.selectionEnd).toBe(textarea.value.length)
    expect(textarea.wrap).toBe("soft")
    expect(container.querySelector(".eme-source-range-header")).toBeNull()
    expect(container.querySelector(".eme-source-range-actions")).toBeNull()

    act(() => {
      changeTextarea(textarea, "## Changed\n\n- one\n- two")
      commitTextarea(textarea)
    })

    expect(onMarkdownChange).toHaveBeenLastCalledWith(
      "# Keep\n\n\n## Changed\n\n- one\n- two\n\nTail\n"
    )
    expect(container.querySelector("[data-source-range-editor]")).toBeNull()
    expect(container.querySelector("h2")?.textContent).toBe("Changed")
    expect(container.querySelectorAll("li")).toHaveLength(2)
  })

  it("contains ordinary multiline editing keys inside the source textarea", async () => {
    await renderEditor("One\n\nTwo")
    act(() => {
      selectBlocks(0)
      openSourceEditor()
    })
    await flushEditor()
    const textarea = container.querySelector<HTMLTextAreaElement>(
      "[data-source-range-textarea='true']"
    )!
    const leakedKeydown = vi.fn()
    document.body.addEventListener("keydown", leakedKeydown)

    act(() => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
        })
      )
    })

    document.body.removeEventListener("keydown", leakedKeydown)
    expect(leakedKeydown).not.toHaveBeenCalled()
    expect(textarea.isConnected).toBe(true)
    expect(onMarkdownChange).not.toHaveBeenCalled()
  })

  it("cancels without a content change and makes a commit one undo step", async () => {
    const original = "One\n\nTwo\n\nThree"
    await renderEditor(original)

    act(() => {
      selectBlocks(1)
      openSourceEditor()
    })
    await flushEditor()
    let textarea = container.querySelector<HTMLTextAreaElement>(
      "[data-source-range-textarea='true']"
    )!
    act(() => {
      changeTextarea(textarea, "Canceled")
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Escape",
        })
      )
    })
    expect(onMarkdownChange).not.toHaveBeenCalled()
    expect(container.textContent).toContain("Two")
    await flushEditor()

    act(() => {
      selectBlocks(1)
      openSourceEditor()
    })
    await flushEditor()
    textarea = container.querySelector<HTMLTextAreaElement>(
      "[data-source-range-textarea='true']"
    )!
    act(() => {
      changeTextarea(textarea, "Changed")
      commitTextarea(textarea)
    })
    await flushEditor()
    expect(onMarkdownChange).toHaveBeenLastCalledWith("One\n\nChanged\n\nThree")

    act(() => {
      capturedEditor!.dispatchCommand(UNDO_COMMAND, undefined)
    })
    await flushEditor()
    expect(onMarkdownChange).toHaveBeenLastCalledWith(original)
    capturedEditor!.getEditorState().read(() => {
      expect($getRoot().getChildren().some($isEfmSourceRangeNode)).toBe(false)
    })
  })

  it("keeps parse errors open and treats empty source as range deletion", async () => {
    await renderEditor("First\n\nSecond")
    act(() => {
      selectBlocks(0)
      openSourceEditor()
    })
    await flushEditor()
    let textarea = container.querySelector<HTMLTextAreaElement>(
      "[data-source-range-textarea='true']"
    )!
    act(() => {
      changeTextarea(textarea, "$$\nunterminated")
      commitTextarea(textarea)
    })
    expect(textarea.getAttribute("aria-invalid")).toBe("true")
    expect(container.querySelector("[role='alert']")?.textContent).toMatch(
      /closing/u
    )
    expect(onMarkdownChange).not.toHaveBeenCalled()

    act(() => {
      changeTextarea(textarea, "")
      commitTextarea(textarea)
    })
    expect(onMarkdownChange).toHaveBeenLastCalledWith("\n\nSecond")
  })

  it("holds an external value during the draft and loads it on cancel", async () => {
    await renderEditor("One\n\nTwo")
    act(() => {
      selectBlocks(1)
      openSourceEditor()
    })
    await flushEditor()
    const textarea = container.querySelector<HTMLTextAreaElement>(
      "[data-source-range-textarea='true']"
    )!
    act(() => changeTextarea(textarea, "Local draft"))

    await renderEditor("External\n\nValue")
    expect(textarea.isConnected).toBe(true)
    expect(container.querySelector("[role='alert']")?.textContent).toMatch(
      /outside/u
    )

    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Escape",
        })
      )
      await Promise.resolve()
    })
    expect(container.textContent).toContain("External")
    expect(container.textContent).toContain("Value")
    expect(container.textContent).not.toContain("Local draft")
  })

  it("does not enter in read-only mode", async () => {
    await renderEditor("One\n\nTwo", true)
    act(() => {
      selectBlocks(0)
      openSourceEditor()
    })
    expect(container.querySelector("[data-source-range-editor]")).toBeNull()
  })

  it("opens the editable selection while leaving a selected footnote tail out", async () => {
    await renderEditor("One\n\n[^n]: Note\n\nTwo")

    act(() => {
      capturedEditor!.update(() => $getRoot().append($createParagraphNode()), {
        discrete: true,
      })
      selectBlocks(0, 1, 2, 3)
      expect(openSourceEditor()).toBe(true)
    })
    await flushEditor()

    expect(
      container.querySelector<HTMLTextAreaElement>(
        "[data-source-range-textarea='true']"
      )?.value
    ).toBe("One\n\nTwo")
    expect(
      container.querySelector(".eme-efm-footnote-definition")
    ).not.toBeNull()
    expect(container.querySelectorAll(".eme-paragraph")).toHaveLength(1)

    const textarea = container.querySelector<HTMLTextAreaElement>(
      "[data-source-range-textarea='true']"
    )!
    act(() => {
      changeTextarea(textarea, "Changed\n\nTwo")
      commitTextarea(textarea)
    })
    expect(onMarkdownChange).toHaveBeenLastCalledWith(
      "Changed\n\nTwo\n\n[^n]: Note"
    )
    expect(
      container.querySelector(".eme-efm-footnote-definition")
    ).not.toBeNull()
  })
})
