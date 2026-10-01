// @vitest-environment jsdom
import { act, useState } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { SpaceFileTree } from "./space-file-tree"
import type { SpaceTreeEntry } from "../shared/contracts"
import { FileTree } from "@pierre/trees"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it.each(["single", "collapse-during-load"])(
  "preserves folder intent across hydration with descending sort: %s",
  async (interaction) => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)
    const resets = vi.spyOn(FileTree.prototype, "resetPaths")
    let finish!: () => void
    const load = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const initial: SpaceTreeEntry[] = [
      {
        name: "docs",
        relativePath: "docs",
        kind: "directory",
        size: 0,
        modifiedAtMs: 1,
        childrenLoaded: false,
      },
      {
        name: "zzz",
        relativePath: "zzz",
        kind: "directory",
        size: 0,
        modifiedAtMs: 9,
        childrenLoaded: false,
      },
    ]
    function Harness() {
      const [entries, setEntries] = useState(initial)
      const [, select] = useState<SpaceTreeEntry | null>(null)
      return (
        <SpaceFileTree
          sort={{ by: "modified", direction: "descending" }}
          entries={entries}
          activePath={null}
          renameRequest={null}
          onSelect={select}
          onOpen={vi.fn()}
          onMove={vi.fn()}
          onMoveError={vi.fn()}
          onRename={vi.fn()}
          onRenameError={vi.fn()}
          onContextMenu={vi.fn()}
          onLoadDirectory={async () => {
            await load()
            setEntries([
              {
                ...initial[0]!,
                childrenLoaded: true,
                children: [
                  {
                    name: "note.md",
                    relativePath: "docs/note.md",
                    kind: "file",
                    size: 1,
                    modifiedAtMs: 1,
                  },
                ],
              },
              ...initial.slice(1),
            ])
          }}
        />
      )
    }
    try {
      await act(async () => root.render(<Harness />))
      const model = resets.mock.contexts[0]!
      if (!(model instanceof FileTree)) throw new Error("Missing tree model")
      const expanded = () => {
        const item = model.getItem("docs/")
        return item && "isExpanded" in item && item.isExpanded()
      }
      const tree = host.querySelector("[data-space-file-tree]")!.shadowRoot!
      const folder = () =>
        tree.querySelector<HTMLButtonElement>('[data-item-path="docs/"]')!
      const click = async (detail: number) =>
        act(async () => {
          folder().dispatchEvent(
            new MouseEvent("click", { bubbles: true, composed: true, detail })
          )
        })
      await click(1)
      expect(load).toHaveBeenCalledTimes(1)
      expect(expanded()).toBe(true)
      if (interaction === "collapse-during-load") await click(1)
      await act(async () => finish())
      if (interaction === "collapse-during-load") {
        expect(expanded()).toBe(false)
        return
      }
      expect(expanded()).toBe(true)
      expect(
        tree.querySelector('[data-item-path="docs/note.md"]')
      ).not.toBeNull()
      await click(1)
      expect(expanded()).toBe(false)
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  }
)
