import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { SpaceFileEntry } from "@eidos.space/file-space"

import { FileSpaceTree } from "./file-tree"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const listMock = vi.hoisted(() => vi.fn())
const navigateMock = vi.hoisted(() => vi.fn())
const setGlobalSearchOpenMock = vi.hoisted(() => vi.fn())

vi.mock("@/apps/web-app/hooks/use-space-files", () => ({
  useSpaceFiles: () => ({
    createDirectory: vi.fn(),
    createText: vi.fn(),
    importFiles: vi.fn(),
    list: listMock,
    move: vi.fn(),
    remove: vi.fn(),
    reveal: vi.fn(),
  }),
  useSpaceFileChanges: () => undefined,
}))

vi.mock("@/apps/web-app/hooks/use-router-adapter", () => ({
  useRouterAdapter: () => ({
    location: {
      pathname: "/space-file",
      search: "",
      hash: "#root.md",
    },
    navigate: navigateMock,
  }),
}))

vi.mock("@/apps/web-app/store/tabs", () => ({
  useTabStore: {
    getState: () => ({
      tabs: [],
      closeTab: vi.fn(),
      updateTab: vi.fn(),
    }),
  },
}))

vi.mock("@/apps/web-app/store/runtime-store", () => ({
  useAppRuntimeStore: (
    selector: (state: { setGlobalSearchOpen: () => void }) => unknown
  ) => selector({ setGlobalSearchOpen: setGlobalSearchOpenMock }),
}))

vi.mock("@/components/ui/native-context-menu", () => ({
  NativeContextMenu: ({ children }: { children: React.ReactNode }) => children,
  NativeContextMenuContent: () => null,
  NativeContextMenuItem: () => null,
  NativeContextMenuSeparator: () => null,
  NativeContextMenuTrigger: ({ children }: { children: React.ReactNode }) =>
    children,
}))

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => children,
  DropdownMenuContent: () => null,
  DropdownMenuItem: () => null,
  DropdownMenuSeparator: () => null,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) =>
    children,
}))

vi.mock("./file-navigation", () => ({
  flushCurrentSpaceFile: vi.fn(async () => true),
  navigateAfterFlushingSpaceFile: vi.fn(
    async ({
      destination,
      navigate,
    }: {
      destination: string
      navigate: (url: string) => void
    }) => {
      navigate(destination)
      return true
    }
  ),
}))

vi.mock("./pending-writes", () => ({
  flushPendingFileWrites: vi.fn(async () => true),
}))

function entry(path: string, kind: SpaceFileEntry["kind"]): SpaceFileEntry {
  const parts = path.split("/")
  const name = parts.pop() ?? path
  return {
    name,
    path,
    parentPath: parts.join("/"),
    kind,
    size: 0,
    mtimeMs: 0,
  }
}

const entriesByDirectory: Record<string, SpaceFileEntry[]> = {
  "": [
    entry("notes", "directory"),
    entry("root.md", "file"),
    entry("empty", "directory"),
  ],
  notes: [
    entry("notes/a.md", "file"),
    entry("notes/nested", "directory"),
    entry("notes/c.md", "file"),
  ],
  "notes/nested": [entry("notes/nested/deep.md", "file")],
  empty: [],
}

describe("FileSpaceTree accessibility", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    listMock.mockReset()
    listMock.mockImplementation(async (directory: string) =>
      Promise.resolve(entriesByDirectory[directory] ?? [])
    )
    navigateMock.mockClear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const getTreeItem = (path: string) => {
    const row = container.querySelector<HTMLElement>(`[title="${path}"]`)
    const item = row?.closest<HTMLElement>('[role="treeitem"]')
    if (!item) throw new Error(`Missing tree item: ${path}`)
    return item
  }

  const press = async (key: string) => {
    const target = document.activeElement
    if (!(target instanceof HTMLElement)) {
      throw new Error("No focused tree item")
    }
    await act(async () => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
      )
      await Promise.resolve()
    })
  }

  const renderTree = async () => {
    await act(async () => {
      root.render(<FileSpaceTree spaceId="test-space" />)
      await Promise.resolve()
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  it("exposes the selected item and a single roving tab stop", async () => {
    await renderTree()

    const tree = container.querySelector('[role="tree"]')
    const notes = getTreeItem("notes")
    const selected = getTreeItem("root.md")
    const visibleItems = [...container.querySelectorAll('[role="treeitem"]')]

    expect(tree?.getAttribute("aria-label")).toBe("Files")
    expect(notes.getAttribute("aria-level")).toBe("1")
    expect(notes.getAttribute("aria-expanded")).toBe("false")
    expect(notes.getAttribute("aria-selected")).toBe("false")
    expect(selected.getAttribute("aria-selected")).toBe("true")
    expect(selected.getAttribute("aria-expanded")).toBeNull()
    expect(
      visibleItems.filter((item) => item.getAttribute("tabindex") === "0")
    ).toEqual([selected])
  })

  it("implements tree arrow, Home, and End keyboard navigation", async () => {
    await renderTree()

    const selected = getTreeItem("root.md")
    act(() => selected.focus())

    await press("ArrowDown")
    expect(document.activeElement).toBe(getTreeItem("empty"))

    await press("ArrowUp")
    expect(document.activeElement).toBe(selected)

    await press("Home")
    const notes = getTreeItem("notes")
    expect(document.activeElement).toBe(notes)

    await press("End")
    expect(document.activeElement).toBe(getTreeItem("empty"))

    await press("Home")
    await press("ArrowRight")
    expect(notes.getAttribute("aria-expanded")).toBe("true")
    expect(document.activeElement).toBe(notes)

    const firstChild = getTreeItem("notes/a.md")
    expect(firstChild.getAttribute("aria-level")).toBe("2")
    expect(firstChild.parentElement?.getAttribute("role")).toBe("group")

    await press("ArrowRight")
    expect(document.activeElement).toBe(firstChild)

    await press("ArrowDown")
    const nested = getTreeItem("notes/nested")
    expect(document.activeElement).toBe(nested)

    await press("ArrowRight")
    expect(nested.getAttribute("aria-expanded")).toBe("true")
    await press("ArrowRight")
    expect(document.activeElement).toBe(getTreeItem("notes/nested/deep.md"))

    await press("ArrowLeft")
    expect(document.activeElement).toBe(nested)

    await press("ArrowLeft")
    expect(nested.getAttribute("aria-expanded")).toBe("false")
    expect(document.activeElement).toBe(nested)

    await press("ArrowLeft")
    expect(document.activeElement).toBe(notes)

    await press("ArrowLeft")
    expect(notes.getAttribute("aria-expanded")).toBe("false")
    expect(document.activeElement).toBe(notes)
    expect(
      [...container.querySelectorAll('[role="treeitem"]')].filter(
        (item) => item.getAttribute("tabindex") === "0"
      )
    ).toEqual([notes])
  })

  it("keeps mouse and keyboard file activation behavior", async () => {
    await renderTree()

    const row = container.querySelector<HTMLElement>('[title="root.md"]')
    await act(async () => row?.click())
    expect(navigateMock).toHaveBeenLastCalledWith("/space-file#root.md")

    const item = getTreeItem("root.md")
    act(() => item.focus())
    await press("Enter")
    expect(navigateMock).toHaveBeenCalledTimes(2)
  })
})
