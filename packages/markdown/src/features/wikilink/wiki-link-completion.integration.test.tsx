import { act } from "react"
import { createRoot } from "react-dom/client"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $getRoot,
  $createTextNode,
  $createParagraphNode,
  $isElementNode,
  $isTextNode,
  type LexicalEditor,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
} from "lexical"
import {
  createMarkdownPreset,
  obsidianPreset,
  eidosPreset,
  minimalPreset,
} from "../../presets"
import { wikilinkPlugin } from "./plugin"
import { MarkdownEditor } from "../../editor/markdown-editor"
import { defineMarkdownPlugin } from "../../plugin-system/plugin-api"

it.each([
  "obsidian",
  "lite-empty",
  "heading",
  "alias",
  "image",
  "image-link",
  "image-unsafe",
  "image-disabled",
  "readable",
  "literal-percent",
  "long-namesakes",
  "encoded-legacy",
])("%s searches notes and replaces only the inline query", async (mode) => {
  const input =
    mode === "obsidian"
      ? "before [[Note"
      : mode === "heading"
        ? "[[Note#Head"
        : "[["
  const target =
    mode === "heading"
      ? "Folder/Note.md#Heading"
      : mode === "encoded-legacy"
        ? "Folder/literal%2520.md"
        : "Folder/Note.md"
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
    extends:
      mode === "obsidian"
        ? obsidianPreset
        : mode === "image-disabled"
          ? minimalPreset
          : eidosPreset,
    plugins: mode === "obsidian" ? [capture] : [wikilinkPlugin, capture],
  })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const searchNotes = vi.fn().mockResolvedValue([
    {
      title: "Note",
      path: target,
      ...(["readable", "literal-percent", "long-namesakes"].includes(mode)
        ? {
            displayPath:
              mode === "literal-percent"
                ? "字面 %20 %25 %E4%B8%AD/Note.md"
                : mode === "long-namesakes"
                  ? `${"共同目录/".repeat(12)}甲目录/图片/Note.md`
                  : "中文 目录/Note.md",
          }
        : {}),
      ...(mode.startsWith("image")
        ? {
            imageUrl:
              mode === "image-unsafe"
                ? "javascript:alert(1)"
                : "/Folder/Note.png",
          }
        : {}),
      ...(mode === "alias" ? { displayText: "Guide" } : {}),
    },
    ...(mode === "long-namesakes"
      ? [
          {
            title: "Note",
            path: "other/Note.md",
            displayPath: `${"共同目录/".repeat(12)}乙目录/图片/Note.md`,
          },
        ]
      : []),
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
          const node = $isElementNode(block) ? block.getFirstDescendant() : null
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
          mode === "obsidian" ? "Note" : mode === "heading" ? "Note#Head" : "",
        documentKey: "current",
      })
    )
    const option = host.querySelector<HTMLButtonElement>(
      ".eme-note-menu button"
    )
    expect(option).not.toBeNull()
    expect(host.querySelectorAll(".eme-note-menu button")).toHaveLength(
      mode === "long-namesakes" ||
        (mode.startsWith("image") &&
          mode !== "image-unsafe" &&
          mode !== "image-disabled")
        ? 2
        : 1
    )
    expect(host.querySelector(".eme-note-menu-title")?.textContent).toBe(
      "链接到文件"
    )
    const displayPath =
      searchNotes.mock.results[0] &&
      (await searchNotes.mock.results[0].value)[0].displayPath
    expect(option!.title).toBe(displayPath ?? target)
    expect(option!.getAttribute("aria-label")).toContain(displayPath ?? target)
    expect(option!.querySelector("small")?.textContent).toBe(
      mode === "long-namesakes"
        ? "…/甲目录/图片/Note.md"
        : (displayPath ?? target)
    )
    if (mode === "long-namesakes")
      expect(
        host.querySelectorAll(".eme-note-menu small")[1]?.textContent
      ).toBe("…/乙目录/图片/Note.md")
    await act(async () => option!.click())
    if (mode === "image") {
      // Reopen the query and select the explicit image action with the keyboard.
      await act(async () => {
        editor!.update(
          () => {
            $getRoot()
              .clear()
              .append(
                $createParagraphNode().append($createTextNode("before [["))
              )
            $getRoot().getFirstDescendant()!.selectEnd()
          },
          { discrete: true }
        )
      })
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 180))
      })
      expect(host.querySelectorAll(".eme-note-menu button")).toHaveLength(2)
      await act(async () => {
        editor!.dispatchCommand(
          KEY_ARROW_DOWN_COMMAND,
          new KeyboardEvent("keydown", { key: "ArrowDown" })
        )
      })
      await act(async () => {
        editor!.dispatchCommand(
          KEY_ENTER_COMMAND,
          new KeyboardEvent("keydown", { key: "Enter" })
        )
      })
      expect(onMarkdownChange.mock.lastCall?.[0]).toContain(
        "![Note](</Folder/Note.png>)"
      )
      expect(onMarkdownChange.mock.lastCall?.[0]).toContain("before")
      expect(host.querySelector("[data-efm-image-block]")).not.toBeNull()
      return
    }
    expect(onMarkdownChange.mock.calls.at(-1)?.[0]).toContain(
      `${mode === "obsidian" ? "before " : ""}[[${target}${mode === "alias" ? "|Guide" : ""}]]`
    )
  } finally {
    await act(async () => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  }
})
