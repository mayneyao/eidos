import { act } from "react"
import { createRoot } from "react-dom/client"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $getRoot,
  $isElementNode,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
  type LexicalNode,
} from "lexical"
import { MarkdownEditor } from "../editor/markdown-editor"
import { eidosMarkdownProfile } from "../profile-system/builtins"
import { defineMarkdownPlugin } from "../plugin-system/plugin-api"

describe("plugin boundaries through the shared gutter", () => {
  it.each(["start", "end", null] as const)(
    "applies %s placement to a third-party ordinary paragraph",
    async (placement) => {
      let editor: LexicalEditor | undefined
      function Capture() {
        ;[editor] = useLexicalComposerContext()
        return null
      }
      const plugin = defineMarkdownPlugin({
        apiVersion: 1,
        id: "test.boundary",
        version: "1",
        behaviors: [{ id: "test.capture", component: Capture }],
        blockBoundaries: placement
          ? [
              {
                id: "test.fixed",
                placement,
                matches: (node: LexicalNode) =>
                  node.getTextContent() === "Fixed",
              },
            ]
          : [],
      })
      ;(
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
      ).IS_REACT_ACT_ENVIRONMENT = true
      const container = document.createElement("div")
      document.body.append(container)
      const root = createRoot(container)
      try {
        await act(async () =>
          root.render(
            <MarkdownEditor
              documentKey="boundary"
              markdown="Fixed"
              onMarkdownChange={() => {}}
              profile={{
                ...eidosMarkdownProfile,
                plugins: [...eidosMarkdownProfile.plugins, plugin],
              }}
            />
          )
        )
        await act(async () =>
          editor!.update(
            () => {
              const first = $getRoot().getFirstChild()
              if ($isElementNode(first)) first.selectStart()
            },
            { discrete: true }
          )
        )
        expect(Boolean(container.querySelector(".eme-insert-trigger"))).toBe(
          placement !== "end"
        )
        expect(Boolean(container.querySelector(".eme-block-drag-handle"))).toBe(
          placement === null
        )
        if (placement === "end") {
          act(() =>
            editor!.dispatchCommand(
              KEY_DOWN_COMMAND,
              new KeyboardEvent("keydown", { key: "/", cancelable: true })
            )
          )
          expect(container.querySelector(".eme-insert-menu")).toBeNull()
        }
      } finally {
        act(() => root.unmount())
        container.remove()
      }
    }
  )
})
