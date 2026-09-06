import { act } from "react"
import { createRoot } from "react-dom/client"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isElementNode,
  $isTextNode,
  type LexicalEditor,
} from "lexical"
import { eidosPreset } from "../../presets"
import { compileMarkdownPlugins } from "../../plugin-system/plugin-compiler"
import { MARKDOWN_EDITOR_CORE_NODES } from "../../nodes/node-registry"
import { $isEfmInlineNode } from "../../nodes/efm-semantic-node"
import { BlockIdIdentityPlugin } from "./block-id-identity-plugin"

it.each(["append", "split-before-id", "split-middle", "enter-after-id"])(
  "retains a paragraph's ID during %s and source reload",
  async (operation) => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    const registry = compileMarkdownPlugins(eidosPreset.plugins)
    let editor!: LexicalEditor
    function Capture() {
      ;[editor] = useLexicalComposerContext()
      return <BlockIdIdentityPlugin />
    }
    const root = createRoot(document.createElement("div"))
    try {
      await act(async () =>
        root.render(
          <LexicalComposer
            initialConfig={{
              namespace: "block-id-editing",
              nodes: [...MARKDOWN_EDITOR_CORE_NODES, ...registry.nodes],
              onError: (error) => {
                throw error
              },
              editorState: () =>
                eidosPreset.codec.import(
                  "Original paragraph ^target",
                  registry.transformers,
                  {}
                ),
            }}
          >
            <Capture />
          </LexicalComposer>
        )
      )
      await act(async () =>
        editor.update(
          () => {
            const paragraph = $getRoot().getFirstChildOrThrow()
            if (!$isElementNode(paragraph)) throw new Error("Missing paragraph")
            if (operation === "split-before-id")
              paragraph.select(
                paragraph.getChildrenSize() - 1,
                paragraph.getChildrenSize() - 1
              )
            else if (operation === "split-middle") {
              const text = paragraph.getFirstChildOrThrow()
              if (!$isTextNode(text)) throw new Error("Missing text")
              text.select(8, 8)
            } else paragraph.selectEnd()
            const selection = $getSelection()
            if (!$isRangeSelection(selection))
              throw new Error("Missing selection")
            if (operation === "append") selection.insertText("more")
            else selection.insertParagraph()
          },
          { discrete: true }
        )
      )
      const source = editor.getEditorState().read(() => {
        const first = $getRoot().getFirstChildOrThrow()
        if (!$isElementNode(first)) throw new Error("Missing paragraph")
        const marker = first.getLastChildOrThrow()
        expect($isEfmInlineNode(marker) && marker.getData().identifier).toBe(
          "target"
        )
        return eidosPreset.codec.export(registry.transformers)
      })
      expect(source).not.toContain("^targetmore")
      await act(async () =>
        editor.update(
          () => eidosPreset.codec.import(source, registry.transformers, {}),
          { discrete: true, tag: "eidos-markdown-editor:external" }
        )
      )
      editor.getEditorState().read(() => {
        const first = $getRoot().getFirstChildOrThrow()
        if (!$isElementNode(first)) throw new Error("Missing paragraph")
        const marker = first.getLastChildOrThrow()
        expect($isEfmInlineNode(marker) && marker.getData().identifier).toBe(
          "target"
        )
      })
    } finally {
      await act(async () => root.unmount())
    }
  }
)
