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

it("retains collapsed folders and the open document when a type filter hides its file", async () => {
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
  const onOpen = vi.fn()
  const file = (name: string, relativePath = name): SpaceTreeEntry => ({
    name,
    relativePath,
    kind: "file",
    size: 0,
    modifiedAtMs: 0,
  })
  const props = {
    entries: [
      file("note.md"),
      {
        ...file("docs"),
        kind: "directory" as const,
        childrenLoaded: true,
        children: [file("photo.png", "docs/photo.png")],
      },
      {
        ...file("notes"),
        kind: "directory" as const,
        childrenLoaded: true,
        children: [file("nested.md", "notes/nested.md")],
      },
    ],
    activePath: "note.md",
    renameRequest: null,
    onOpen,
    onSelect: vi.fn(),
    onMove: vi.fn(),
    onMoveError: vi.fn(),
    onRename: vi.fn(),
    onRenameError: vi.fn(),
    onContextMenu: vi.fn(),
    onLoadDirectory: vi.fn(),
  }
  try {
    await act(async () => root.render(<SpaceFileTree {...props} />))
    const model = resets.mock.contexts[0]!
    if (!(model instanceof FileTree)) throw new Error("Missing tree model")
    const folder = model.getItem("docs/")!
    if (!("collapse" in folder)) throw new Error("Missing folder")
    await act(async () => folder.collapse())
    expect(model.getItem("note.md")!.isSelected()).toBe(true)
    await act(async () =>
      root.render(<SpaceFileTree {...props} fileFilter={[".png"]} />)
    )
    expect(model.getItem("note.md")).toBeNull()
    expect(model.getItem("notes/")).toBeNull()
    expect(model.getItem("docs/photo.png")).not.toBeNull()
    const retained = model.getItem("docs/")!
    expect("isExpanded" in retained && retained.isExpanded()).toBe(false)
    await act(async () =>
      root.render(<SpaceFileTree {...props} fileFilter={[]} />)
    )
    expect(model.getItem("note.md")!.isSelected()).toBe(true)
    const restored = model.getItem("notes/")!
    expect("isExpanded" in restored && restored.isExpanded()).toBe(true)
    expect(onOpen).not.toHaveBeenCalled()
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})

it("rehydrates an expanded directory when a refresh invalidates its children", async () => {
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
  const loaded: SpaceTreeEntry[] = [
    {
      name: "docs",
      relativePath: "docs",
      kind: "directory",
      size: 0,
      modifiedAtMs: 1,
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
  ]
  const load = vi.fn(async () => {})
  let invalidate!: () => void
  function Harness() {
    const [entries, setEntries] = useState(loaded)
    invalidate = () =>
      setEntries([
        { ...loaded[0]!, childrenLoaded: false, children: undefined },
      ])
    return (
      <SpaceFileTree
        entries={entries}
        activePath={null}
        renameRequest={null}
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        onMove={vi.fn()}
        onMoveError={vi.fn()}
        onRename={vi.fn()}
        onRenameError={vi.fn()}
        onContextMenu={vi.fn()}
        onLoadDirectory={async () => {
          await load()
          setEntries(loaded)
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
    expect(expanded()).toBe(true)
    await act(async () => invalidate())
    expect(load).toHaveBeenCalledTimes(1)
    expect(expanded()).toBe(true)
    expect(
      host
        .querySelector("[data-space-file-tree]")!
        .shadowRoot!.querySelector('[data-item-path="docs/note.md"]')
    ).not.toBeNull()
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
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
