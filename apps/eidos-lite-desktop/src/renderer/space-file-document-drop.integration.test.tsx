// @vitest-environment jsdom
import { act, useState } from "react"
import { createRoot } from "react-dom/client"
import { SpaceFileTree } from "./space-file-tree"
import {
  MarkdownEditorSurface,
  prepareMarkdownEditorSurface,
} from "./markdown-editor-surface"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

it.each(["file", "image", "directory"])(
  "drops a real Explorer %s payload into Side without replacing Main's old selection",
  async (kind) => {
    const observer = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", observer)
    vi.stubGlobal("IntersectionObserver", observer)
    Range.prototype.getBoundingClientRect = () => new DOMRect()
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList
    const name = kind === "image" ? "中文 [图] (#%).png" : "report.pdf"
    const path = `assets/${name}`
    const file = {
      name,
      relativePath: path,
      kind: "file" as const,
      modifiedAtMs: 1,
      size: 1,
    }
    Object.assign(window, {
      eidosLite: {
        getSpace: vi.fn(async () => ({ id: "test-space" })),
        searchSpacePaths: vi.fn(async () => [file]),
        searchMarkdownNotes: vi.fn(async () => []),
        resolveMarkdownImage: vi.fn(async () => null),
      },
    })
    await prepareMarkdownEditorSurface("wysiwyg")
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const move = vi.fn()
    function App() {
      const [main, setMain] = useState("Main old selection")
      const [side, setSide] = useState("Side alpha omega")
      return (
        <>
          <SpaceFileTree
            spaceId="test-space"
            entries={[
              {
                name: "assets",
                relativePath: "assets",
                kind: "directory",
                childrenLoaded: true,
                children: [file],
                modifiedAtMs: 1,
                size: 0,
              },
            ]}
            activePath={null}
            renameRequest={null}
            onOpen={() => {}}
            onSelect={() => {}}
            onLoadDirectory={async () => {}}
            onMove={move}
            onMoveError={() => {}}
            onRename={async () => {}}
            onRenameError={() => {}}
            onContextMenu={() => {}}
          />
          <section id="main">
            <MarkdownEditorSurface
              documentKey="main.md"
              relativePath="main.md"
              content={main}
              editingMode="wysiwyg"
              theme="light"
              onChange={setMain}
            />
            <output>{main}</output>
          </section>
          <section id="side">
            <MarkdownEditorSurface
              documentKey="side.md"
              relativePath="side.md"
              content={side}
              editingMode="wysiwyg"
              theme="light"
              onChange={setSide}
            />
            <output>{side}</output>
          </section>
        </>
      )
    }
    const original = Object.getOwnPropertyDescriptor(
      document,
      "caretPositionFromPoint"
    )
    try {
      await act(async () => root.render(<App />))
      const main = host.querySelector("#main [data-lexical-text]")!.firstChild!
      const side = host.querySelector("#side [data-lexical-text]")!.firstChild!
      await act(async () =>
        document
          .getSelection()!
          .setBaseAndExtent(main, 0, main, main.textContent!.length)
      )
      Object.defineProperty(document, "caretPositionFromPoint", {
        configurable: true,
        value: () => ({ offsetNode: side, offset: 5 }),
      })
      const data = new Map<string, string>()
      const transfer = {
        get types() {
          return [...data.keys()]
        },
        setData: (type: string, value: string) => data.set(type, value),
        getData: (type: string) => data.get(type) ?? "",
        setDragImage: () => {},
        effectAllowed: "none",
        dropEffect: "none",
      }
      const row = host
        .querySelector("[data-space-file-tree]")!
        .shadowRoot!.querySelector(
          `[data-item-path="${kind === "directory" ? "assets/" : path}"]`
        )!
      const drag = (target: Element, type: string) => {
        const event = new MouseEvent(type, {
          bubbles: true,
          composed: true,
          cancelable: true,
          clientX: 50,
          clientY: 50,
        })
        Object.defineProperty(event, "dataTransfer", { value: transfer })
        target.dispatchEvent(event)
        return event
      }
      await act(async () => {
        drag(row, "dragstart")
      })
      expect(data.get("application/x-eidos-lite-space-path")).toBe(
        kind === "directory" ? "assets" : path
      )
      const editor = host.querySelector("#side [contenteditable=true]")!
      await act(async () => {
        expect(drag(editor, "dragover").defaultPrevented).toBe(true)
        drag(editor, "drop")
        await new Promise((resolve) => setTimeout(resolve, 10))
      })
      expect(host.querySelector("#main output")!.textContent).toBe(
        "Main old selection"
      )
      const saved = host.querySelector("#side output")!.textContent!
      if (kind === "directory") expect(saved).toBe("Side alpha omega")
      else {
        expect(saved).toContain("Side ")
        expect(saved).toContain("alpha omega")
        expect(saved).toContain(
          `/${path.split("/").map(encodeURIComponent).join("/")}`
        )
        expect(
          host.querySelectorAll("#side [data-efm-image-block]")
        ).toHaveLength(kind === "image" ? 1 : 0)
      }
      expect(move).not.toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      host.remove()
      document.getSelection()?.removeAllRanges()
      if (original)
        Object.defineProperty(document, "caretPositionFromPoint", original)
      else Reflect.deleteProperty(document, "caretPositionFromPoint")
      vi.unstubAllGlobals()
    }
  }
)
