import { act, useState } from "react"
import { createRoot } from "react-dom/client"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type LexicalEditor,
} from "lexical"
import { TOGGLE_LINK_COMMAND } from "@lexical/link"
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest"
import { MarkdownEditor } from "./markdown-editor"
import { eidosPreset } from "../presets"
import { defineMarkdownPlugin } from "../plugin-system/plugin-api"
import { gfmMarkdownProfile } from "../profile-system/builtins"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: ReturnType<typeof createRoot> | undefined
let host: HTMLDivElement | undefined
const geometry = [
  [Range.prototype, "getBoundingClientRect", () => new DOMRect()],
  [Range.prototype, "getClientRects", () => [] as unknown as DOMRectList],
  [HTMLElement.prototype, "scrollIntoView", () => {}],
] as const
const originalGeometry = geometry.map(([target, property]) =>
  Object.getOwnPropertyDescriptor(target, property)
)
beforeAll(() => {
  for (const [target, property, value] of geometry)
    Object.defineProperty(target, property, { configurable: true, value })
})
afterAll(() => {
  geometry.forEach(([target, property], index) => {
    const original = originalGeometry[index]
    if (original) Object.defineProperty(target, property, original)
    else Reflect.deleteProperty(target, property)
  })
})
afterEach(async () => {
  await act(async () => root?.unmount())
  host?.remove()
  document.getSelection()?.removeAllRanges()
  vi.restoreAllMocks()
})

it("updates link validation when the base URI changes and still rejects unsafe schemes", async () => {
  let editor!: LexicalEditor
  function Capture() {
    ;[editor] = useLexicalComposerContext()
    return null
  }
  const capture = defineMarkdownPlugin({
    apiVersion: 1,
    id: "test.link-policy",
    version: "1",
    behaviors: [{ id: "test.link-policy.capture", component: Capture }],
  })
  const plugins = [...gfmMarkdownProfile.plugins, capture]
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  const render = async (baseUri?: string) =>
    act(async () =>
      root!.render(
        <MarkdownEditor
          documentKey="policy"
          markdown="Label"
          plugins={plugins}
          baseUri={baseUri}
          onMarkdownChange={() => {}}
          onError={(error) => {
            throw error
          }}
        />
      )
    )
  const toggle = async (url: string | null) => {
    let handled = false
    await act(async () =>
      editor.update(
        () => {
          const text = $getRoot().getFirstDescendant()
          if (!$isTextNode(text)) throw new Error("Expected label text")
          text.select(0, text.getTextContentSize())
          handled = editor.dispatchCommand(TOGGLE_LINK_COMMAND, url)
        },
        { discrete: true }
      )
    )
    return handled
  }
  await render()
  expect(await toggle("../note")).toBe(false)
  await render("https://example.test/docs/")
  expect(await toggle("../note")).toBe(true)
  expect(host.querySelector("a")).not.toBeNull()
  await toggle(null)
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,test",
    "file:///private/test",
  ])
    expect(await toggle(url)).toBe(false)
  await render()
  expect(await toggle("../note")).toBe(false)
  expect(host.querySelector("a")).toBeNull()
})

it.each([
  { mainState: "pristine", linked: false },
  { mainState: "focused", linked: false },
  { mainState: "dirty", linked: false },
  { mainState: "pristine", linked: true },
  { mainState: "focused", linked: true },
  { mainState: "dirty", linked: true },
])(
  "keeps sidebar input ownership with main $mainState and linked=$linked",
  async ({ mainState, linked }) => {
    const editors = new Map<string, LexicalEditor>()
    function Capture({ documentKey }: { documentKey: string }) {
      const [editor] = useLexicalComposerContext()
      editors.set(documentKey, editor)
      return null
    }
    const capture = defineMarkdownPlugin({
      apiVersion: 1,
      id: "test.dual-focus",
      version: "1",
      behaviors: [{ id: "test.dual-focus.capture", component: Capture }],
    })
    const plugins = [...eidosPreset.plugins, capture]
    function Harness() {
      const [drafts, setDrafts] = useState({
        main: `# Main\n\nMain body${linked ? "\n\n[Attachment](assets/file.txt)" : ""}`,
        side: "# Sidebar\n\nSidebar body\n\n[Side attachment](assets/side.txt)",
      })
      return (
        <>
          <input aria-label="Search" />
          {(["main", "side"] as const).map((key) => (
            <MarkdownEditor
              key={key}
              documentKey={key}
              markdown={drafts[key]}
              plugins={plugins}
              ariaLabel={key}
              onError={(error) => {
                throw error
              }}
              onMarkdownChange={(content) =>
                setDrafts((current) => ({ ...current, [key]: content }))
              }
            />
          ))}
        </>
      )
    }
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(<Harness />))
    const focus = async (key: string) => {
      const editor = editors.get(key)!
      editor.getRootElement()!.focus()
      await act(async () =>
        editor.update(() => $getRoot().getChildren()[1].selectEnd(), {
          discrete: true,
        })
      )
      expect(document.activeElement).toBe(editor.getRootElement())
      return editor
    }
    const type = async (editor: LexicalEditor, text: string) => {
      await act(async () =>
        editor.update(
          () => {
            const selection = $getSelection()
            if (!$isRangeSelection(selection))
              throw new Error("Missing real editor selection")
            selection.insertText(text)
          },
          { discrete: true }
        )
      )
    }
    if (mainState !== "pristine") {
      const main = await focus("main")
      if (mainState === "dirty") await type(main, " MAIN-DRAFT")
    }
    const side = await focus("side")
    await type(side, " ")
    expect(side.getRootElement()!.textContent).toContain("Sidebar body ")
    expect(
      side
        .getRootElement()!
        .contains(document.getSelection()?.anchorNode ?? null)
    ).toBe(true)
    expect(document.activeElement).toBe(side.getRootElement())
    await type(side, "SIDE-DRAFT")
    expect(side.getRootElement()!.textContent).toContain(
      "Sidebar body SIDE-DRAFT"
    )
    const main = await focus("main")
    await type(main, " MAIN-NEXT")
    expect(document.activeElement).toBe(main.getRootElement())
    expect(
      main
        .getRootElement()!
        .contains(document.getSelection()?.anchorNode ?? null)
    ).toBe(true)
    expect(main.getRootElement()!.textContent).not.toContain("SIDE-DRAFT")
    expect(side.getRootElement()!.textContent).not.toContain("MAIN-NEXT")
  }
)
