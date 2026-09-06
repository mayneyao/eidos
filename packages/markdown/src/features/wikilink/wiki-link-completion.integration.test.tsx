import { act } from "react"
import { createRoot } from "react-dom/client"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $getRoot,
  $createTextNode,
  $isElementNode,
  $isTextNode,
  type LexicalEditor,
} from "lexical"
import {
  createMarkdownPreset,
  obsidianPreset,
  eidosPreset,
} from "../../presets"
import { wikilinkPlugin } from "./plugin"
import { MarkdownEditor } from "../../editor/markdown-editor"
import { defineMarkdownPlugin } from "../../plugin-system/plugin-api"

it.each(["obsidian", "lite-empty", "heading", "alias"])(
  "%s searches notes and replaces only the inline query",
  async (mode) => {
    const input =
      mode === "obsidian"
        ? "before [[Note"
        : mode === "heading"
          ? "[[Note#Head"
          : "[["
    const target =
      mode === "heading" ? "Folder/Note.md#Heading" : "Folder/Note.md"
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      }
    )
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    Range.prototype.getBoundingClientRect = () => new DOMRect(10, 10, 30, 20)
    HTMLElement.prototype.scrollIntoView = () => {}
    let editor: LexicalEditor | undefined
    function Capture() {
      ;[editor] = useLexicalComposerContext()
      return null
    }
    const capture = defineMarkdownPlugin({
      apiVersion: 1,
      id: "test.capture-wiki",
      version: "1",
      behaviors: [{ id: "test.capture-wiki", component: Capture }],
    })
    const preset = createMarkdownPreset({
      id: "test.wiki",
      extends: mode === "obsidian" ? obsidianPreset : eidosPreset,
      plugins: mode === "obsidian" ? [capture] : [wikilinkPlugin, capture],
    })
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const searchNotes = vi.fn().mockResolvedValue([
      {
        title: "Note",
        path: target,
        ...(mode === "alias" ? { displayText: "Guide" } : {}),
      },
    ])
    const onMarkdownChange = vi.fn()
    try {
      await act(async () =>
        root.render(
          <MarkdownEditor
            documentKey="current"
            markdown={mode === "obsidian" ? "before" : ""}
            preset={preset}
            labels={{ linkToFile: "链接到文件" }}
            searchNotes={searchNotes}
            onMarkdownChange={onMarkdownChange}
          />
        )
      )
      await act(async () => {
        editor!.update(
          () => {
            const block = $getRoot().getFirstChildOrThrow()
            if (mode !== "obsidian" && $isElementNode(block))
              block.append($createTextNode(""))
            const node = $isElementNode(block)
              ? block.getFirstDescendant()
              : null
            if ($isTextNode(node)) {
              node.setTextContent(input)
              node.selectEnd()
            }
          },
          { discrete: true }
        )
      })
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 180))
      })
      expect(searchNotes).toHaveBeenCalledWith(
        expect.objectContaining({
          query:
            mode === "lite-empty" || mode === "alias"
              ? ""
              : mode === "heading"
                ? "Note#Head"
                : "Note",
          documentKey: "current",
        })
      )
      const option = host.querySelector<HTMLButtonElement>(
        ".eme-note-menu button"
      )
      expect(option).not.toBeNull()
      expect(host.querySelector(".eme-note-menu-title")?.textContent).toBe(
        "链接到文件"
      )
      await act(async () => option!.click())
      expect(onMarkdownChange.mock.calls.at(-1)?.[0]).toContain(
        `${mode === "obsidian" ? "before " : ""}[[${target}${mode === "alias" ? "|Guide" : ""}]]`
      )
    } finally {
      await act(async () => root.unmount())
      host.remove()
      vi.unstubAllGlobals()
    }
  }
)
