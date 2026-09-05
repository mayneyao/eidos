import { act } from "react"
import { createRoot } from "react-dom/client"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isElementNode,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
} from "lexical"
import { MarkdownEditor } from "../editor/markdown-editor"
import { eidosMarkdownProfile } from "../profile-system/builtins"
import { defineMarkdownPlugin } from "../plugin-system/plugin-api"
import { $isListNode } from "@lexical/list"
import { $isHeadingNode } from "@lexical/rich-text"
import { $isTableNode } from "@lexical/table"

const cases = [
  ["eidos.commonmark.heading-1", "heading", "h1"],
  ["eidos.commonmark.heading-2", "heading", "h2"],
  ["eidos.commonmark.heading-3", "heading", "h3"],
  ["eidos.commonmark.quote", "quote", ""],
  ["eidos.commonmark.bullet-list", "list", "bullet"],
  ["eidos.commonmark.number-list", "list", "number"],
  ["eidos.commonmark.code", "code", ""],
  ["eidos.commonmark.divider", "horizontalrule", ""],
  ["eidos.gfm.check-list", "list", "check"],
  ["eidos.gfm.table", "table", ""],
] as const

describe.each(["after", "replace-empty"])(
  "basic plugin insertion: %s",
  (placement) => {
    it.each(cases)(
      "inserts %s and retains the intended editing position",
      async (id, type, variant) => {
        let editor: LexicalEditor | undefined
        function Capture() {
          ;[editor] = useLexicalComposerContext()
          return null
        }
        const capture = defineMarkdownPlugin({
          apiVersion: 1,
          id: "test.capture",
          version: "1",
          behaviors: [{ id: "test.capture", component: Capture }],
        })
        ;(
          globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
        ).IS_REACT_ACT_ENVIRONMENT = true
        const scroll = Object.getOwnPropertyDescriptor(
          HTMLElement.prototype,
          "scrollIntoView"
        )
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
          configurable: true,
          value: () => {},
        })
        const container = document.createElement("div")
        document.body.append(container)
        const root = createRoot(container)
        const warningTrace = vi.spyOn(console, "warn")
        try {
          await act(async () =>
            root.render(
              <MarkdownEditor
                documentKey="basic"
                markdown={placement === "after" ? "Original" : ""}
                onMarkdownChange={() => {}}
                profile={{
                  ...eidosMarkdownProfile,
                  plugins: [...eidosMarkdownProfile.plugins, capture],
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
          act(() => {
            if (placement === "after")
              container
                .querySelector<HTMLButtonElement>(".eme-insert-trigger")!
                .click()
            else
              editor!.dispatchCommand(
                KEY_DOWN_COMMAND,
                new KeyboardEvent("keydown", { key: "/", cancelable: true })
              )
          })
          const option = container.querySelector<HTMLButtonElement>(
            `[id$="-option-${id}"]`
          )
          expect(option).not.toBeNull()
          await act(async () => option!.click())
          await act(async () => {
            await new Promise<void>((resolve) =>
              window.requestAnimationFrame(() => resolve())
            )
          })
          expect(
            warningTrace.mock.calls.filter(([message]) =>
              String(message).includes("read-only context")
            )
          ).toEqual([])
          expect(document.activeElement).toBe(editor!.getRootElement())
          editor!.getEditorState().read(() => {
            const blocks = $getRoot().getChildren()
            if (placement === "after")
              expect(blocks[0].getTextContent()).toBe("Original")
            const inserted = blocks[placement === "after" ? 1 : 0]
            expect(inserted.getType()).toBe(type)
            if ($isHeadingNode(inserted))
              expect(inserted.getTag()).toBe(variant)
            if ($isListNode(inserted)) {
              expect(inserted.getListType()).toBe(variant)
              expect(inserted.getChildrenSize()).toBe(1)
            }
            if ($isTableNode(inserted)) {
              expect(inserted.getChildrenSize()).toBe(3)
              const row = inserted.getFirstChild()
              expect($isElementNode(row) ? row.getChildrenSize() : 0).toBe(3)
            }
            const selection = $getSelection()
            expect($isRangeSelection(selection)).toBe(true)
            if ($isRangeSelection(selection)) {
              const anchor = selection.anchor.getNode()
              const expected =
                type === "horizontalrule" ? inserted.getNextSibling() : inserted
              expect(
                [anchor, ...anchor.getParents()].some(
                  (node) => node.getKey() === expected?.getKey()
                )
              ).toBe(true)
            }
          })
          expect(container.querySelector(".eme-insert-menu")).toBeNull()
        } finally {
          warningTrace.mockRestore()
          act(() => root.unmount())
          container.remove()
          if (scroll)
            Object.defineProperty(
              HTMLElement.prototype,
              "scrollIntoView",
              scroll
            )
          else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
        }
      }
    )
  }
)
