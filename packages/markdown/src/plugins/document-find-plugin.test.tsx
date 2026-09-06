import { act } from "react"
import { createRoot } from "react-dom/client"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  UNDO_COMMAND,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
} from "lexical"
import { DocumentFindPlugin } from "./document-find-plugin"

it("opens scoped find, navigates matches and closes without changing editor state", async () => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  let editor!: LexicalEditor
  const labels = {
    findInDocument: "Find",
    noTextMatches: "No matches",
    previousMatch: "Previous",
    nextMatch: "Next",
    closeFind: "Close",
  }
  function Capture() {
    ;[editor] = useLexicalComposerContext()
    return <DocumentFindPlugin labels={labels} />
  }
  const host = document.createElement("div")
  document.body.append(host)
  const reactRoot = createRoot(host)
  try {
    await act(async () =>
      reactRoot.render(
        <LexicalComposer
          initialConfig={{
            namespace: "find-test",
            onError: (error) => {
              throw error
            },
          }}
        >
          <Capture />
          <HistoryPlugin />
          <RichTextPlugin
            contentEditable={<ContentEditable />}
            placeholder={null}
            ErrorBoundary={LexicalErrorBoundary}
          />
        </LexicalComposer>
      )
    )
    await act(async () =>
      editor.update(
        () => {
          $getRoot()
            .clear()
            .append(
              $createParagraphNode().append($createTextNode("中文 first 中文"))
            )
        },
        { discrete: true }
      )
    )
    const before = JSON.stringify(editor.getEditorState().toJSON())
    await act(async () =>
      editor.getRootElement()!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "f",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        })
      )
    )
    const input = host.querySelector("input")!
    expect(input).not.toBeNull()
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(input, "中文")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    expect(host.querySelector('[role="status"]')?.textContent).toBe("1 / 2")
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Next"]')!.click()
    )
    expect(host.querySelector('[role="status"]')?.textContent).toBe("2 / 2")
    await act(async () => {
      editor.update(
        () =>
          $getRoot().append(
            $createParagraphNode().append($createTextNode("中文"))
          ),
        { discrete: true, tag: HISTORY_PUSH_TAG }
      )
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(host.querySelector('[role="status"]')?.textContent).toBe("2 / 3")
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined)
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(host.querySelector('[role="status"]')?.textContent).toBe("2 / 2")
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Next"]')!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        )
    )
    expect(host.querySelector("input")).toBeNull()
    expect(JSON.stringify(editor.getEditorState().toJSON())).toBe(before)
  } finally {
    await act(async () => reactRoot.unmount())
    host.remove()
  }
})
