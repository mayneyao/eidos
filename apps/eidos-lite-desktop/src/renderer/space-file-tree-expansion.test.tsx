// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { FileTree } from "@pierre/trees"
import { SpaceFileTree } from "./space-file-tree"
import type { SpaceTreeEntry } from "../shared/contracts"
import type { TreeExpansionActions } from "./tree-expansion-menu"
import { EIDOS_LITE_SPACE_PATH_DRAG_TYPE } from "./space-path-drag"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const folder = (path: string, children?: SpaceTreeEntry[]): SpaceTreeEntry => ({
  name: path.split("/").at(-1)!,
  relativePath: path,
  kind: "directory",
  size: 0,
  modifiedAtMs: 0,
  childrenLoaded: children !== undefined,
  children,
})

async function setup(
  entries: SpaceTreeEntry[],
  rootDirectory: string | null = null
) {
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
  const props = {
    entries,
    nameQuery: "",
    rootDirectory,
    activePath: null,
    renameRequest: null,
    onOpen: vi.fn(),
    onSelect: vi.fn(),
    onMove: vi.fn(),
    onMoveError: vi.fn(),
    onRename: vi.fn(),
    onRenameError: vi.fn(),
    onContextMenu: vi.fn(),
    onExpansionActionsChange: vi.fn(),
    onLoadDirectory: vi.fn<(_: string) => Promise<void>>().mockResolvedValue(),
  }
  const render = async () => {
    await act(async () => root.render(<SpaceFileTree {...props} />))
  }
  await render()
  const model = resets.mock.contexts[0]!
  if (!(model instanceof FileTree)) throw new Error("Missing model")
  const expanded = (path: string) => {
    const item = model.getItem(path)
    return item && "isExpanded" in item && item.isExpanded()
  }
  const actions = async (
    path: string | null = null
  ): Promise<TreeExpansionActions> => {
    if (!path) return props.onExpansionActionsChange.mock.lastCall![0]
    const element = path
      ? host
          .querySelector("[data-space-file-tree]")!
          .shadowRoot!.querySelector(`[data-item-path="${path}"]`)!
      : host.querySelector(".space-file-tree-shell")!
    await act(async () => {
      element.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          composed: true,
          cancelable: true,
        })
      )
    })
    return props.onContextMenu.mock.lastCall![4]
  }
  const expand = async (shouldExpand: boolean, all = false) => {
    const menu = await actions(all ? null : "docs/")
    await act(async () => {
      if (menu.isExpanded() !== shouldExpand) menu.toggle()
    })
  }
  const dispose = async () => {
    await act(async () => root.unmount())
    host.remove()
  }
  return { props, model, expanded, expand, actions, render, dispose, host }
}

it("accepts an external file over a real shadow-tree folder and the blank root", async () => {
  const view = await setup([folder("assets", [])])
  const onImportFiles = vi.fn().mockResolvedValue(undefined)
  try {
    await act(async () => view.render())
    await act(async () => {})
    // Use the actual custom element and its shadow rows, rather than a mock div.
    const tree = view.host.querySelector<HTMLElement>("[data-space-file-tree]")!
    const file = new File(["external"], "report.pdf")
    Object.assign(view.props, { onImportFiles })
    await view.render()
    await act(async () => {
      const folder = view.model.getItem("assets/")!
      if ("collapse" in folder) folder.collapse()
    })
    expect(view.expanded("assets/")).toBe(false)
    const row = tree.shadowRoot!.querySelector('[data-item-path="assets/"]')!
    for (const target of [row, tree]) {
      for (const type of ["dragover", "drop"]) {
        const event = new Event(type, {
          bubbles: true,
          composed: true,
          cancelable: true,
        })
        Object.defineProperty(event, "dataTransfer", {
          value: { types: ["Files"], files: [file], dropEffect: "none" },
        })
        await act(async () => target.dispatchEvent(event))
        expect(event.defaultPrevented).toBe(true)
      }
      expect(view.expanded("assets/")).toBe(true)
    }
    expect(onImportFiles.mock.calls).toEqual([
      [[file], "assets"],
      [[file], null],
    ])
  } finally {
    await view.dispose()
  }
})

it("preserves selection, focus, scroll and folder expansion while a bulk move reconciles external changes and partial failure", async () => {
  const file = (name: string): SpaceTreeEntry => ({
    name,
    relativePath: `docs/${name}`,
    kind: "file",
    size: 1,
    modifiedAtMs: 0,
  })
  const a = file("a.txt")
  const b = file("b.txt")
  const tree = await setup([
    folder("docs", [folder("docs/nested", []), a, b]),
    folder("other", []),
    ...Array.from({ length: 80 }, (_, index) => folder(`extra-${index}`, [])),
  ])
  let reject!: (error: Error) => void
  tree.props.onMove.mockImplementation(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail
      })
  )
  try {
    const scroll = tree.host
      .querySelector("[data-space-file-tree]")!
      .shadowRoot!.querySelector<HTMLElement>(
        "[data-file-tree-virtualized-scroll]"
      )!
    await act(async () => {
      tree.model.getItem("docs/a.txt")!.select()
      tree.model.getItem("docs/b.txt")!.select()
      tree.model.getItem("docs/b.txt")!.focus()
    })
    const element = tree.host.querySelector("[data-space-file-tree]")!
    const transfer = {
      types: [EIDOS_LITE_SPACE_PATH_DRAG_TYPE],
      setData: vi.fn(),
    }
    const dispatch = async (type: string, target: Element) => {
      const event = new Event(type, {
        bubbles: true,
        composed: true,
        cancelable: true,
      })
      Object.defineProperty(event, "dataTransfer", { value: transfer })
      await act(async () => {
        target.dispatchEvent(event)
      })
    }
    await dispatch(
      "dragstart",
      element.shadowRoot!.querySelector('[data-item-path="docs/b.txt"]')!
    )
    await dispatch("drop", element)
    scroll.scrollTop = 60
    const focused = tree.model.getFocusedPath()
    tree.props.entries = [
      folder("docs", [folder("docs/nested", []), a, b, file("external.txt")]),
      ...tree.props.entries.slice(1),
    ]
    await tree.render()
    expect(tree.model.getItem("docs/a.txt")).toBeNull()
    expect(tree.model.getItem("docs/b.txt")).toBeNull()
    expect([...tree.model.getSelectedPaths()].sort()).toEqual([
      "a.txt",
      "b.txt",
    ])
    expect(tree.model.getFocusedPath()).toBe(focused)
    expect(tree.expanded("docs/")).toBe(true)
    expect(scroll.scrollTop).toBe(60)
    tree.props.entries = [
      { ...a, relativePath: "a.txt" },
      folder("docs", [folder("docs/nested", []), b, file("external.txt")]),
      ...tree.props.entries.slice(1),
    ]
    await tree.render()
    await act(async () => reject(new Error("Second item failed")))
    expect(tree.model.getItem("docs/a.txt")).toBeNull()
    expect(tree.model.getItem("a.txt")).not.toBeNull()
    expect(tree.model.getItem("docs/b.txt")).not.toBeNull()
    expect(tree.model.getItem("b.txt")).toBeNull()
    expect(tree.model.getSelectedPaths()).toContain("docs/b.txt")
    expect(tree.expanded("docs/")).toBe(true)
    expect(scroll.scrollTop).toBe(60)
  } finally {
    await tree.dispose()
  }
})

it("temporarily expands matches and restores browsing expansion, selection and scroll after clearing a name filter", async () => {
  const item: SpaceTreeEntry = {
    name: "match.md",
    relativePath: "docs/nested/match.md",
    kind: "file",
    size: 0,
    modifiedAtMs: 0,
  }
  const tree = await setup([
    folder("docs", [folder("docs/nested", [item])]),
    folder("other", []),
    ...Array.from({ length: 80 }, (_, index) => folder(`extra-${index}`, [])),
  ])
  try {
    const scroll = tree.host
      .querySelector("[data-space-file-tree]")!
      .shadowRoot!.querySelector<HTMLElement>(
        "[data-file-tree-virtualized-scroll]"
      )!
    await act(async () => {
      const docs = tree.model.getItem("docs/")!
      if ("collapse" in docs) docs.collapse()
      tree.model.getItem("other/")!.select()
    })
    scroll.scrollTop = 40
    tree.props.nameQuery = "match"
    await tree.render()
    expect(tree.expanded("docs/")).toBe(true)
    expect(tree.expanded("docs/nested/")).toBe(true)
    expect(tree.model.getItem("other/")).toBeNull()
    scroll.scrollTop = 0
    await act(async () => tree.model.getItem("docs/nested/match.md")!.select())
    tree.props.nameQuery = "missing"
    await tree.render()
    expect(tree.host.textContent).toContain("No matching files")
    tree.props.nameQuery = ""
    await tree.render()
    expect(tree.expanded("docs/")).toBe(false)
    expect(tree.expanded("other/")).toBe(true)
    expect(tree.model.getSelectedPaths()).toEqual(["other/"])
    await vi.waitFor(() => expect(scroll.scrollTop).toBe(40))
    expect(tree.props.onOpen).not.toHaveBeenCalled()
  } finally {
    await tree.dispose()
  }
})

it("recursively expands selected folders and collapses the whole tree without opening a file", async () => {
  const tree = await setup([
    folder("docs", [folder("docs/nested", [])]),
    folder("other", []),
  ])
  try {
    await act(async () => {
      for (const path of ["docs/nested/", "docs/", "other/"]) {
        const item = tree.model.getItem(path)!
        if ("collapse" in item) item.collapse()
      }
      tree.model.getItem("docs/")!.select()
    })
    await tree.expand(true)
    expect(tree.expanded("docs/")).toBe(true)
    expect(tree.expanded("docs/nested/")).toBe(true)
    expect(tree.expanded("other/")).toBe(false)
    await tree.expand(true, true)
    expect(tree.expanded("other/")).toBe(true)
    await tree.expand(false)
    expect(tree.expanded("docs/nested/")).toBe(false)
    expect(tree.expanded("other/")).toBe(true)
    const allToggle = await tree.actions()
    expect(allToggle.isExpanded()).toBe(false)
    await act(async () => allToggle.toggle())
    expect(tree.expanded("docs/nested/")).toBe(true)
    expect(allToggle.isExpanded()).toBe(true)
    await tree.expand(false, true)
    expect(tree.expanded("other/")).toBe(false)
    expect(tree.props.onOpen).not.toHaveBeenCalled()
  } finally {
    await tree.dispose()
  }
})

it("expands newly hydrated descendants and cancels recursive expansion on collapse", async () => {
  const tree = await setup([folder("docs")])
  const finishes: Array<() => void> = []
  tree.props.onLoadDirectory.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finishes.push(resolve)
      })
  )
  try {
    await tree.expand(true, true)
    expect(tree.props.onLoadDirectory).toHaveBeenCalledWith("docs")
    tree.props.entries = [folder("docs", [folder("docs/nested")])]
    await tree.render()
    expect(tree.expanded("docs/nested/")).toBe(true)
    expect(tree.props.onLoadDirectory).toHaveBeenCalledWith("docs/nested")
    await tree.expand(false, true)
    tree.props.entries = [
      folder("docs", [folder("docs/nested", [folder("docs/nested/deep", [])])]),
    ]
    await act(async () => {
      for (const finish of finishes) finish()
    })
    await tree.render()
    expect(tree.expanded("docs/")).toBe(false)
    expect(tree.expanded("docs/nested/")).toBe(false)
  } finally {
    await tree.dispose()
  }
})

it("keeps Space actions independent of the current selection and handles multiple folders", async () => {
  const tree = await setup([folder("docs", []), folder("other", [])])
  try {
    await act(async () => {
      tree.model.getItem("docs/")!.select()
      tree.model.getItem("other/")!.select()
    })
    await tree.expand(false)
    expect(tree.expanded("docs/")).toBe(false)
    expect(tree.expanded("other/")).toBe(false)
    await tree.expand(true)
    expect(tree.expanded("docs/")).toBe(true)
    expect(tree.expanded("other/")).toBe(true)
    expect(tree.props.onContextMenu.mock.lastCall![3]).toHaveLength(2)
    expect(tree.props.onContextMenu.mock.lastCall![4].scope).toBe("folder")
    const menu = await tree.actions()
    expect(menu.scope).toBe("all")
  } finally {
    await tree.dispose()
  }
})

it("bounds concurrent recursive loads and leaves failed folders available for retry", async () => {
  const tree = await setup(
    Array.from({ length: 7 }, (_, index) =>
      folder(index === 0 ? "docs" : `folder-${index}`)
    )
  )
  const pending: Array<{ resolve(): void; reject(error: Error): void }> = []
  tree.props.onLoadDirectory.mockImplementation(
    () =>
      new Promise<void>((resolve, reject) => pending.push({ resolve, reject }))
  )
  try {
    await tree.expand(true, true)
    expect(tree.props.onLoadDirectory).toHaveBeenCalledTimes(4)
    await act(async () => pending[0]!.reject(new Error("Unreadable folder")))
    expect(tree.props.onLoadDirectory).toHaveBeenCalledTimes(5)
    expect(tree.expanded("docs/")).toBe(false)
    expect(tree.host.textContent).toContain("Could not load docs")
    await tree.expand(false, true)
    tree.props.entries = tree.props.entries.map((entry) =>
      folder(entry.relativePath, [])
    )
    await tree.render()
    await act(async () => {
      for (const load of pending) load.resolve()
    })
    expect(tree.expanded("docs/")).toBe(false)
    expect(tree.props.onLoadDirectory).toHaveBeenCalledTimes(5)
  } finally {
    await tree.dispose()
  }
})

it("targets the displayed root and offers no expansion actions on files or empty areas", async () => {
  const tree = await setup(
    [
      folder("project/docs", [folder("project/docs/nested", [])]),
      {
        name: "note.md",
        relativePath: "project/note.md",
        kind: "file",
        size: 0,
        modifiedAtMs: 0,
      },
    ],
    "project"
  )
  try {
    const menu = await tree.actions("docs/")
    expect(menu.scope).toBe("folder")
    expect(menu.isExpanded()).toBe(false)
    await act(async () => menu.toggle())
    expect(menu.isExpanded()).toBe(true)
    await act(async () => menu.toggle())
    expect(tree.expanded("docs/")).toBe(false)
    const fileMenu = await tree.actions("note.md")
    expect(fileMenu).toBeUndefined()
    const spaceActions = await tree.actions()
    await act(async () => spaceActions.toggle())
    expect(tree.expanded("docs/nested/")).toBe(true)
    expect(tree.props.onOpen).not.toHaveBeenCalled()
    tree.props.onContextMenu.mockClear()
    const backgroundEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    })
    await act(async () => {
      tree.host
        .querySelector(".space-file-tree-shell")!
        .dispatchEvent(backgroundEvent)
    })
    expect(backgroundEvent.defaultPrevented).toBe(false)
    expect(tree.props.onContextMenu).not.toHaveBeenCalled()
  } finally {
    await tree.dispose()
  }
})
