// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { FileTree } from "@pierre/trees"
import { SpaceFileTree } from "./space-file-tree"
import type { SpaceTreeEntry } from "../shared/contracts"
import type { TreeExpansionActions } from "./tree-expansion-menu"

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
