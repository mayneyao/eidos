import { act } from "react"
import { createRoot } from "react-dom/client"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $createCodeNode, CodeNode } from "@lexical/code-core"
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  PASTE_COMMAND,
  type LexicalEditor,
} from "lexical"
import { EfmInlineNode, $isEfmInlineNode } from "../../nodes/efm-semantic-node"
import { WikiLinkPaste } from "./wiki-link-paste"

it.each([
  ["[[#^block]]", "paragraph", "", true],
  ["[[/data.eidos|Database]]", "paragraph", "", true],
  ["ordinary text", "paragraph", "", false],
  ["![[image.png]]", "paragraph", "", false],
  ["[[broken", "paragraph", "", false],
  ["[[note]]", "code", "", false],
  ["[[note]]", "inline-code", "", false],
  ["[[note]]", "code-caret", "", false],
  ["[[note]]", "readonly", "", false],
  ["[[note]]", "paragraph", "<b>[[note]]</b>", false],
])("pastes %s in %s with HTML %s: %s", async (source, mode, html, handled) => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  let editor!: LexicalEditor
  function Capture() {
    ;[editor] = useLexicalComposerContext()
    return <WikiLinkPaste />
  }
  const host = document.createElement("div")
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <LexicalComposer
          initialConfig={{
            namespace: "paste-test",
            nodes: [EfmInlineNode, CodeNode],
            onError: (error) => {
              throw error
            },
          }}
        >
          <Capture />
        </LexicalComposer>
      )
    )
    await act(async () =>
      editor.update(
        () => {
          const paragraph =
            mode === "code" ? $createCodeNode() : $createParagraphNode()
          const text = $createTextNode("prefix ")
          if (mode === "inline-code") text.toggleFormat("code")
          paragraph.append(text)
          $getRoot().clear().append(paragraph)
          paragraph.selectEnd()
          if (mode === "code-caret") {
            const selection = $getSelection()
            if ($isRangeSelection(selection)) selection.toggleFormat("code")
          }
        },
        { discrete: true }
      )
    )
    if (mode === "readonly") editor.setEditable(false)
    const event = new Event("paste", { cancelable: true }) as ClipboardEvent
    Object.defineProperty(event, "clipboardData", {
      value: {
        files: [],
        getData: (type: string) =>
          type === "text/plain" ? source : type === "text/html" ? html : "",
      },
    })
    await act(async () => {
      expect(editor.dispatchCommand(PASTE_COMMAND, event)).toBe(handled)
    })
    expect(event.defaultPrevented).toBe(handled)
    editor.getEditorState().read(() => {
      const node = $getRoot().getFirstDescendant()?.getNextSibling()
      expect($isEfmInlineNode(node)).toBe(handled)
    })
  } finally {
    await act(async () => root.unmount())
  }
})
