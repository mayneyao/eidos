import { act } from "react"
import { createRoot } from "react-dom/client"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $createParagraphNode,
  $getRoot,
  $isElementNode,
  PASTE_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  type LexicalEditor,
} from "lexical"
import { MarkdownEditor } from "../../editor/markdown-editor"
import { eidosPreset, createMarkdownPreset } from "../../presets"
import { defineMarkdownPlugin } from "../../plugin-system/plugin-api"
import {
  $createEfmInlineNode,
  $isEfmInlineNode,
} from "../../nodes/efm-semantic-node"

it("copies a saved block link through the handle menu and keeps duplicated IDs unique", async () => {
  const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {})
  const rangeRect = Object.getOwnPropertyDescriptor(
    Range.prototype,
    "getBoundingClientRect"
  )
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 10, 20)
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  let editor: LexicalEditor | undefined
  function Capture() {
    ;[editor] = useLexicalComposerContext()
    return null
  }
  const preset = createMarkdownPreset({
    id: "test.block-links",
    extends: eidosPreset,
    plugins: [
      defineMarkdownPlugin({
        apiVersion: 1,
        id: "test.capture-block-links",
        version: "1",
        behaviors: [{ id: "test.capture", component: Capture }],
      }),
    ],
  })
  const writeText = vi.fn().mockResolvedValue(undefined)
  const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard")
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const onMarkdownChange = vi.fn()
  const onError = vi.fn()
  try {
    await act(async () =>
      root.render(
        <MarkdownEditor
          documentKey="note"
          documentPath="Notes/note.md"
          preset={preset}
          markdown="A paragraph"
          onMarkdownChange={onMarkdownChange}
          onError={onError}
        />
      )
    )
    await act(async () =>
      editor!.update(
        () => {
          const first = $getRoot().getFirstChild()
          if ($isElementNode(first)) first.selectEnd()
        },
        { discrete: true }
      )
    )
    await act(async () =>
      host.querySelector<HTMLButtonElement>(".eme-block-drag-handle")!.click()
    )
    const copy = host.querySelector<HTMLButtonElement>(
      ".eme-block-actions button"
    )
    expect(copy?.textContent).toBe("Copy block link")
    writeText.mockRejectedValueOnce(new Error("Clipboard denied"))
    const changesBeforeCopy = onMarkdownChange.mock.calls.length
    await act(async () => copy!.click())
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Clipboard denied" })
    )
    expect(onMarkdownChange).toHaveBeenCalledTimes(changesBeforeCopy)
    editor!
      .getEditorState()
      .read(() => expect($getRoot().getTextContent()).toBe("A paragraph"))
    writeText.mockClear()
    await act(async () => copy!.click())
    expect(writeText).toHaveBeenCalledOnce()
    const link = writeText.mock.calls[0][0] as string
    const id = link.match(/#\^([^\]]+)/u)![1]
    expect(link).toBe(`[[/Notes/note.md#^${id}]]`)
    expect(onMarkdownChange.mock.calls.at(-1)?.[0]).toBe(`A paragraph ^${id}`)
    await act(async () => {
      editor!.dispatchCommand(UNDO_COMMAND, undefined)
    })
    editor!
      .getEditorState()
      .read(() => expect($getRoot().getTextContent()).toBe("A paragraph"))
    await act(async () => {
      editor!.dispatchCommand(REDO_COMMAND, undefined)
    })
    editor!
      .getEditorState()
      .read(() =>
        expect($getRoot().getTextContent()).toBe(`A paragraph ^${id}`)
      )
    await act(async () =>
      editor!.update(
        () => {
          const paragraph = $createParagraphNode()
          $getRoot().append(paragraph)
          paragraph.selectEnd()
        },
        { discrete: true }
      )
    )
    const paste = new Event("paste", { cancelable: true }) as ClipboardEvent
    Object.defineProperty(paste, "clipboardData", {
      value: {
        files: [],
        getData: (type: string) => (type === "text/plain" ? link : ""),
      },
    })
    await act(async () => {
      editor!.dispatchCommand(PASTE_COMMAND, paste)
    })
    expect(paste.defaultPrevented).toBe(true)
    editor!.getEditorState().read(() => {
      const paragraph = $getRoot().getLastChildOrThrow()
      if (!$isElementNode(paragraph))
        throw new Error("Missing pasted paragraph")
      const reference = paragraph.getFirstChildOrThrow()
      expect($isEfmInlineNode(reference)).toBe(true)
      if ($isEfmInlineNode(reference))
        expect(reference.getData()).toMatchObject({
          kind: "obsidian-link",
          path: "/Notes/note.md",
          blockId: id,
          source: link,
        })
    })
    await act(async () =>
      editor!.update(
        () => {
          const first = $getRoot().getFirstChildOrThrow()
          if ($isElementNode(first))
            first.append(
              $createEfmInlineNode({
                kind: "obsidian-block-id",
                identifier: id,
                source: `^${id}`,
              })
            )
        },
        { discrete: true }
      )
    )
    editor!.getEditorState().read(() => {
      const first = $getRoot().getFirstChildOrThrow()
      if (!$isElementNode(first)) throw new Error("Missing paragraph")
      const ids = first
        .getChildren()
        .filter($isEfmInlineNode)
        .map((node) => node.getData().identifier)
      expect(ids[0]).toBe(id)
      expect(new Set(ids).size).toBe(2)
    })
  } finally {
    await act(async () => root.unmount())
    host.remove()
    if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard)
    else Reflect.deleteProperty(navigator, "clipboard")
    if (rangeRect)
      Object.defineProperty(Range.prototype, "getBoundingClientRect", rangeRect)
    else Reflect.deleteProperty(Range.prototype, "getBoundingClientRect")
    scrollBy.mockRestore()
  }
})
