import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import {
  $getRoot,
  PASTE_COMMAND,
  type LexicalEditor,
  type PasteCommandType,
} from "lexical"

import { MARKDOWN_EDITOR_NODES } from "../nodes/node-registry"
import { ClipboardImagePlugin } from "./clipboard-image-plugin"

function CaptureEditor({ onReady }: { onReady(editor: LexicalEditor): void }) {
  const [editor] = useLexicalComposerContext()
  onReady(editor)
  return null
}

describe("ClipboardImagePlugin integration", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("handles an Electron-style image File from the paste command", async () => {
    let editor: LexicalEditor | null = null
    const onPasteImage = vi.fn(async () => ({
      markdownUrl: "assets/image.png",
      displayUrl: "blob:preview",
    }))
    await act(async () => {
      root.render(
        <LexicalComposer
          initialConfig={{
            namespace: "ClipboardImagePluginTest",
            nodes: MARKDOWN_EDITOR_NODES,
            onError: (error) => {
              throw error
            },
          }}
        >
          <RichTextPlugin
            contentEditable={<ContentEditable />}
            placeholder={null}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <ClipboardImagePlugin
            documentKey="notes/test.md"
            onError={(error) => {
              throw error
            }}
            onPasteImage={onPasteImage}
            readOnly={false}
          />
          <CaptureEditor onReady={(value) => (editor = value)} />
        </LexicalComposer>
      )
    })

    const file = new File([new Uint8Array([1, 2, 3])], "image.png", {
      type: "image/png",
    })
    const event = new Event("paste", {
      bubbles: true,
      composed: true,
      cancelable: true,
    }) as PasteCommandType
    Object.defineProperty(event, "clipboardData", {
      value: {
        items: [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => file,
          },
        ],
        files: [file],
      },
    })

    act(() => {
      editor!.update(() => $getRoot().selectEnd())
      editor!.dispatchCommand(PASTE_COMMAND, event)
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onPasteImage).toHaveBeenCalledWith(
      expect.objectContaining({
        documentKey: "notes/test.md",
        file,
        index: 0,
        total: 1,
      })
    )
  })
})
