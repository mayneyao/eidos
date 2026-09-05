import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $getRoot,
  $isElementNode,
  $isTextNode,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
} from "lexical"
import { MarkdownEditor } from "../../editor/markdown-editor"
import {
  eidosMarkdownProfile,
  obsidianMarkdownProfile,
} from "../../profile-system/builtins"
import { defineMarkdownPlugin } from "../../plugin-system/plugin-api"

let editor: LexicalEditor
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
const layoutMethods = [
  [HTMLElement.prototype, "scrollIntoView"],
  [Range.prototype, "getClientRects"],
  [Range.prototype, "getBoundingClientRect"],
] as const
const originalLayoutMethods = layoutMethods.map(([prototype, key]) =>
  Object.getOwnPropertyDescriptor(prototype, key)
)

describe("math plugin insertion through the shared menu", () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    vi.spyOn(window, "scrollBy").mockImplementation(() => {})
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: () => {},
    })
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () => ({
        item: () => new DOMRect(0, 0, 1, 20),
        length: 0,
        [Symbol.iterator]: function* () {},
      }),
    })
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 1, 20),
    })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    layoutMethods.forEach(([prototype, key], index) => {
      const descriptor = originalLayoutMethods[index]
      if (descriptor) Object.defineProperty(prototype, key, descriptor)
      else Reflect.deleteProperty(prototype, key)
    })
  })

  it.each([eidosMarkdownProfile, obsidianMarkdownProfile])(
    "inserts inline math with $id without losing surrounding text",
    async (base) => {
      const changed = vi.fn()
      await act(async () =>
        root.render(
          <MarkdownEditor
            documentKey="math"
            markdown="Before  after"
            onMarkdownChange={changed}
            profile={{ ...base, plugins: [...base.plugins, capture] }}
          />
        )
      )
      act(() => {
        editor.update(
          () => {
            const first = $getRoot().getFirstChild()
            const text = $isElementNode(first) ? first.getFirstChild() : null
            if ($isTextNode(text)) text.select(7, 7)
          },
          { discrete: true }
        )
        editor.dispatchCommand(
          KEY_DOWN_COMMAND,
          new KeyboardEvent("keydown", { key: "/", cancelable: true })
        )
      })
      const option = container.querySelector<HTMLButtonElement>(
        '[id$="-option-eidos.math.inline"]'
      )
      expect(option).not.toBeNull()
      act(() => option!.click())
      const input = container.querySelector<HTMLInputElement>(
        ".eme-insert-composer input"
      )!
      expect(input).not.toBeNull()
      act(() => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )!.set!.call(input, "x^2")
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })
      await act(async () => {
        input.form!.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        )
        await new Promise((resolve) => setTimeout(resolve, 30))
      })
      expect(changed.mock.calls.at(-1)?.[0]).toContain("Before $x^2$")
      expect(container.querySelector(".eme-insert-menu")).toBeNull()
    }
  )

  it("inserts a block equation placeholder through the plugin", async () => {
    const changed = vi.fn()
    await act(async () =>
      root.render(
        <MarkdownEditor
          documentKey="math-block"
          markdown=""
          onMarkdownChange={changed}
          profile={{
            ...eidosMarkdownProfile,
            plugins: [...eidosMarkdownProfile.plugins, capture],
          }}
        />
      )
    )
    act(() => {
      editor.update(
        () => {
          const first = $getRoot().getFirstChild()
          if ($isElementNode(first)) first.selectStart()
        },
        { discrete: true }
      )
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: "/", cancelable: true })
      )
    })
    const option = container.querySelector<HTMLButtonElement>(
      '[id$="-option-eidos.math.block"]'
    )!
    expect(option).not.toBeNull()
    await act(async () => {
      option.click()
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    expect(changed.mock.calls.at(-1)?.[0]).toContain("$$\n\n$$")
    expect(container.querySelector(".eme-insert-menu")).toBeNull()
  })
})
