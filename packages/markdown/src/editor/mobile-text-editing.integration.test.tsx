import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  DELETE_CHARACTER_COMMAND,
  type LexicalEditor,
} from "lexical"
import { MarkdownEditor } from "./markdown-editor"
import { eidosMarkdownPlugins } from "../plugin-system/builtins"
import { defineMarkdownPlugin } from "../plugin-system/plugin-api"

let editor: LexicalEditor
function CaptureEditor() {
  ;[editor] = useLexicalComposerContext()
  return null
}
const capture = defineMarkdownPlugin({
  apiVersion: 1,
  id: "test.text-selection",
  version: "1.0.0",
  behaviors: [{ id: "test.text-selection.capture", component: CaptureEditor }],
})
let host: HTMLDivElement
let root: Root
const open = vi.fn()
const change = vi.fn()
const error = vi.fn()
const originalRangeRect = Object.getOwnPropertyDescriptor(
  Range.prototype,
  "getBoundingClientRect"
)

function pointer(target: Element, type: string, x = 0) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: 200,
    button: 0,
  })
  Object.defineProperties(event, {
    pointerType: { value: "touch" },
    pointerId: { value: 1 },
  })
  target.dispatchEvent(event)
}
async function render(markdown: string, readOnly = false) {
  await act(async () =>
    root.render(
      <MarkdownEditor
        documentKey="touch"
        markdown={markdown}
        toolbarMode="mobile"
        plugins={[...eidosMarkdownPlugins, capture]}
        onMarkdownChange={change}
        onOpenExternalUrl={open}
        onError={error}
        readOnly={readOnly}
      />
    )
  )
}
beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  open.mockClear()
  change.mockClear()
  error.mockClear()
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => new DOMRect(0, 0, 1, 20),
  })
  vi.spyOn(window, "scrollBy").mockImplementation(() => {})
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  document.getSelection()?.removeAllRanges()
  vi.restoreAllMocks()
  if (originalRangeRect)
    Object.defineProperty(
      Range.prototype,
      "getBoundingClientRect",
      originalRangeRect
    )
  else Reflect.deleteProperty(Range.prototype, "getBoundingClientRect")
})

it("deletes a selected URL character and updates its destination", async () => {
  await render("https://example.com/page")
  await act(async () => {
    editor.update(
      () => {
        const text = $getRoot().getFirstDescendant()!
        if (!$isTextNode(text)) throw new Error("Expected editable URL text")
        text.select(text.getTextContentSize() - 1, text.getTextContentSize())
        editor.dispatchCommand(DELETE_CHARACTER_COMMAND, true)
      },
      { discrete: true }
    )
  })
  expect(change).toHaveBeenLastCalledWith("https://example.com/pag")
  const link = host.querySelector<HTMLAnchorElement>("a")!
  expect(link.closest('[contenteditable="false"]')).toBeNull()
  expect(link.getAttribute("href")).toBe("https://example.com/pag")
  await act(async () => link.click())
  expect(open).toHaveBeenLastCalledWith("https://example.com/pag")
  expect(error).not.toHaveBeenCalled()
})

it("replaces only selected URL text", async () => {
  await render("https://example.com/page")
  await act(async () =>
    editor.update(
      () => {
        const text = $getRoot().getFirstDescendant()
        if (!$isTextNode(text)) throw new Error("Expected editable URL text")
        text.select(8, 15)
        const selection = $getSelection()
        if ($isRangeSelection(selection)) selection.insertText("eidos")
      },
      { discrete: true }
    )
  )
  expect(change).toHaveBeenLastCalledWith("https://eidos.com/page")
})

it.each(["hold", "move", "cancel", "selection"])(
  "keeps %s available without navigating",
  async (gesture) => {
    await render("https://example.com/page")
    const link = host.querySelector<HTMLAnchorElement>("a")!
    let now = 1000
    vi.spyOn(Date, "now").mockImplementation(() => now)
    await act(async () => {
      pointer(link, "pointerdown")
      if (gesture === "hold") now += 600
      if (gesture === "move") pointer(link, "pointermove", 50)
      if (gesture === "cancel") pointer(link, "pointercancel")
      if (gesture === "selection") {
        const text = link.querySelector("span")!.firstChild!
        const range = document.createRange()
        range.setStart(text, 8)
        range.setEnd(text, 15)
        document.getSelection()!.addRange(range)
      }
      pointer(link, "pointerup")
      link.click()
    })
    expect(open).not.toHaveBeenCalled()
    expect(change).not.toHaveBeenCalled()
  }
)

it("opens a short tap without consuming pointer selection events", async () => {
  await render("https://example.com/page")
  const link = host.querySelector<HTMLAnchorElement>("a")!
  await act(async () => {
    pointer(link, "pointerdown")
    pointer(link, "pointerup")
    link.click()
  })
  expect(open).toHaveBeenLastCalledWith("https://example.com/page")
})

it.each([
  "> [!note] Tail\n> Content",
  "```js\nconsole.log(1)\n```",
  "| A | B |\n| - | - |\n| one | two |",
])(
  "inserts an editable paragraph in bottom padding after %s",
  async (markdown) => {
    await render(markdown)
    const content = host.querySelector<HTMLElement>(".eme-content-editable")!
    await act(async () => {
      pointer(content, "pointerdown")
      pointer(content, "pointerup")
    })
    await act(async () =>
      editor.update(
        () => {
          const selection = $getSelection()
          if ($isRangeSelection(selection))
            selection.insertText("New paragraph")
        },
        { discrete: true }
      )
    )
    expect(change.mock.lastCall?.[0]).toContain("New paragraph")
    expect(content.lastElementChild?.tagName).toBe("P")
    const count = content.children.length
    await act(async () => {
      pointer(content, "pointerdown")
      pointer(content, "pointerup")
      pointer(content, "pointerdown")
      pointer(content, "pointerup")
    })
    expect(content.children.length).toBe(count + 1)
    expect(error).not.toHaveBeenCalled()
  }
)

it.each(["hold", "move", "cancel", "read-only"])(
  "does not insert a paragraph for a %s tail gesture",
  async (gesture) => {
    await render("> [!note] Tail\n> Content", gesture === "read-only")
    const content = host.querySelector<HTMLElement>(".eme-content-editable")!
    const count = content.children.length
    let now = 1000
    vi.spyOn(Date, "now").mockImplementation(() => now)
    await act(async () => {
      pointer(content, "pointerdown")
      if (gesture === "hold") now += 600
      if (gesture === "cancel") pointer(content, "pointercancel")
      pointer(content, "pointerup", gesture === "move" ? 50 : 0)
    })
    expect(content.children.length).toBe(count)
    expect(change).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  }
)
