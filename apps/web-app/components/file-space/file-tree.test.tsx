import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { SpaceFileEntry } from "@eidos.space/file-space"

import { useFileSpaceSettings } from "@/apps/web-app/store/file-space-settings"

import { FileSpaceTree } from "./file-tree"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const listMock = vi.hoisted(() => vi.fn())
const createDirectoryMock = vi.hoisted(() => vi.fn())
const createTextMock = vi.hoisted(() => vi.fn())
const moveMock = vi.hoisted(() => vi.fn())
const navigateMock = vi.hoisted(() => vi.fn())
const setGlobalSearchOpenMock = vi.hoisted(() => vi.fn())
const createBaseMock = vi.hoisted(() => vi.fn())
const preloadSpaceBaseEditorMock = vi.hoisted(() => vi.fn())

vi.mock("./base/space-base-editor-loader", () => ({
  preloadSpaceBaseEditor: preloadSpaceBaseEditorMock,
}))

vi.mock("@/apps/web-app/hooks/use-space-base", () => ({
  useSpaceBase: () => ({ create: createBaseMock }),
}))

vi.mock("@/apps/web-app/hooks/use-space-files", () => ({
  useSpaceFiles: () => ({
    createDirectory: createDirectoryMock,
    createText: createTextMock,
    importFiles: vi.fn(),
    list: listMock,
    move: moveMock,
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

let currentEntriesByDirectory: Record<string, SpaceFileEntry[]>

describe("FileSpaceTree accessibility", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    useFileSpaceSettings.setState({ bySpace: {} })
    currentEntriesByDirectory = Object.fromEntries(
      Object.entries(entriesByDirectory).map(([directory, entries]) => [
        directory,
        [...entries],
      ])
    )
    listMock.mockReset()
    listMock.mockImplementation(async (directory: string) =>
      Promise.resolve(currentEntriesByDirectory[directory] ?? [])
    )
    createDirectoryMock.mockReset()
    createTextMock.mockReset()
    createBaseMock.mockReset()
    preloadSpaceBaseEditorMock.mockReset()
    preloadSpaceBaseEditorMock.mockResolvedValue(() => null)
    moveMock.mockReset()
    createTextMock.mockImplementation(async (path: string) => {
      const created = entry(path, "file")
      currentEntriesByDirectory[created.parentPath] = [
        ...(currentEntriesByDirectory[created.parentPath] ?? []),
        created,
      ]
    })
    createDirectoryMock.mockImplementation(async (path: string) => {
      const created = entry(path, "directory")
      currentEntriesByDirectory[created.parentPath] = [
        ...(currentEntriesByDirectory[created.parentPath] ?? []),
        created,
      ]
      currentEntriesByDirectory[path] = []
    })
    navigateMock.mockClear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    useFileSpaceSettings.setState({ bySpace: {} })
  })

  const getTreeItem = (path: string) => {
    const shadowRoot = container.querySelector(
      "file-tree-container"
    )?.shadowRoot
    const item =
      shadowRoot?.querySelector<HTMLElement>(
        `[role="treeitem"][data-item-path="${path}"]`
      ) ??
      shadowRoot?.querySelector<HTMLElement>(
        `[role="treeitem"][data-item-path="${path}/"]`
      )
    if (!item) throw new Error(`Missing tree item: ${path}`)
    return item
  }

  const getActiveTreeElement = () =>
    container.querySelector("file-tree-container")?.shadowRoot?.activeElement ??
    document.activeElement

  const press = async (key: string) => {
    const target = getActiveTreeElement()
    if (!(target instanceof HTMLElement)) {
      throw new Error("No focused tree item")
    }
    await act(async () => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
          composed: true,
        })
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

  it("applies the per-Space hidden file settings to directory reads", async () => {
    useFileSpaceSettings.setState({
      bySpace: {
        "test-space": {
          showHiddenFiles: true,
          showObsidianFolder: true,
          defaultBaseTemplate: "blank",
          baseAssetFolder: "space-assets",
        },
      },
    })

    await renderTree()

    expect(listMock).toHaveBeenCalledWith("", {
      includeHidden: true,
      includeObsidian: true,
    })
  })

  it("preselects the configured template when creating a Base", async () => {
    useFileSpaceSettings.setState({
      bySpace: {
        "test-space": {
          showHiddenFiles: false,
          showObsidianFolder: false,
          defaultBaseTemplate: "tasks",
          baseAssetFolder: "space-assets",
        },
      },
    })
    await renderTree()

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="New Base"]')
        ?.click()
      await Promise.resolve()
    })

    const selectedTemplate = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")
    ).find((button) => button.getAttribute("aria-pressed") === "true")
    expect(selectedTemplate?.textContent).toContain("Task tracker")

    await act(async () => {
      Array.from(document.body.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent === "Create Base")
        ?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(createBaseMock).toHaveBeenCalledWith(
      "Untitled.base",
      expect.objectContaining({
        defaultTable: expect.objectContaining({ name: "Tasks" }),
      })
    )
  })

  it("exposes the selected item and a single roving tab stop", async () => {
    await renderTree()

    const host = container.querySelector("file-tree-container")
    const shadowRoot = host?.shadowRoot
    const notes = getTreeItem("notes")
    const selected = getTreeItem("root.md")
    const visibleItems = [
      ...(shadowRoot?.querySelectorAll('[role="treeitem"]') ?? []),
    ]

    expect(host?.getAttribute("aria-label")).toBe("Files")
    expect(
      container.querySelector("[data-file-tree-workbar]")?.className
    ).toContain("eidos-shell-workbar")
    expect(notes.getAttribute("aria-level")).toBe("1")
    expect(notes.getAttribute("aria-expanded")).toBe("false")
    expect(notes.getAttribute("aria-selected")).toBe("false")
    expect(selected.getAttribute("aria-selected")).toBe("true")
    expect(selected.getAttribute("aria-expanded")).toBeNull()
    expect(
      visibleItems.filter((item) => item.getAttribute("tabindex") === "0")
    ).toEqual([getTreeItem("empty")])
  })

  it("implements tree arrow, Home, and End keyboard navigation", async () => {
    await renderTree()

    const initiallyFocused = getTreeItem("empty")
    act(() => initiallyFocused.focus())

    await press("ArrowDown")
    const notes = getTreeItem("notes")
    expect(getActiveTreeElement()).toBe(notes)

    await press("ArrowDown")
    expect(getActiveTreeElement()).toBe(getTreeItem("root.md"))

    await press("Home")
    expect(getActiveTreeElement()).toBe(initiallyFocused)

    await press("End")
    expect(getActiveTreeElement()).toBe(getTreeItem("root.md"))

    await act(async () => {
      notes.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(notes.getAttribute("aria-expanded")).toBe("true")
    expect(getActiveTreeElement()).toBe(notes)

    const firstChild = getTreeItem("notes/nested")
    expect(firstChild.getAttribute("aria-level")).toBe("2")

    await press("ArrowRight")
    expect(getActiveTreeElement()).toBe(firstChild)

    const nested = firstChild

    await press("ArrowRight")
    expect(nested.getAttribute("aria-expanded")).toBe("true")
    await press("ArrowRight")
    expect(getActiveTreeElement()).toBe(getTreeItem("notes/nested/deep.md"))

    await press("ArrowLeft")
    expect(getActiveTreeElement()).toBe(nested)

    await press("ArrowLeft")
    expect(nested.getAttribute("aria-expanded")).toBe("false")
    expect(getActiveTreeElement()).toBe(nested)

    await press("ArrowLeft")
    expect(getActiveTreeElement()).toBe(notes)

    await press("ArrowLeft")
    expect(notes.getAttribute("aria-expanded")).toBe("false")
    expect(getActiveTreeElement()).toBe(notes)
    const shadowRoot = container.querySelector(
      "file-tree-container"
    )?.shadowRoot
    expect(
      [...(shadowRoot?.querySelectorAll('[role="treeitem"]') ?? [])].filter(
        (item) => item.getAttribute("tabindex") === "0"
      )
    ).toEqual([notes])
  })

  it("keeps mouse and keyboard file activation behavior", async () => {
    await renderTree()

    const row = getTreeItem("root.md")
    await act(async () => row?.click())
    expect(navigateMock).toHaveBeenLastCalledWith("/space-file#root.md")

    const item = getTreeItem("root.md")
    act(() => item.focus())
    await press("Enter")
    expect(navigateMock).toHaveBeenCalledTimes(2)
  })

  it("preloads the Base workspace on file intent only", async () => {
    currentEntriesByDirectory[""] = [
      ...currentEntriesByDirectory[""],
      entry("tasks.base", "file"),
    ]
    await renderTree()

    await act(async () => {
      getTreeItem("root.md").dispatchEvent(
        new MouseEvent("pointerover", { bubbles: true, composed: true })
      )
      await Promise.resolve()
    })
    expect(preloadSpaceBaseEditorMock).not.toHaveBeenCalled()

    await act(async () => {
      getTreeItem("tasks.base").dispatchEvent(
        new MouseEvent("pointerover", { bubbles: true, composed: true })
      )
      await Promise.resolve()
    })
    expect(preloadSpaceBaseEditorMock).toHaveBeenCalledTimes(1)
  })

  it("preloads the Base workspace for keyboard navigation", async () => {
    currentEntriesByDirectory[""] = [
      ...currentEntriesByDirectory[""],
      entry("tasks.base", "file"),
    ]
    await renderTree()

    await act(async () => {
      getTreeItem("tasks.base").focus()
      await Promise.resolve()
    })

    expect(preloadSpaceBaseEditorMock).toHaveBeenCalledTimes(1)
    expect(navigateMock).not.toHaveBeenCalledWith("/space-file#tasks.base")
  })

  it("creates a note and hands its name to Trees inline renaming", async () => {
    await renderTree()

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="New note"]')
        ?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(createTextMock).toHaveBeenCalledWith("Untitled.md")
    expect(navigateMock).toHaveBeenLastCalledWith("/space-file#Untitled.md")
    const renameInput = container
      .querySelector("file-tree-container")
      ?.shadowRoot?.querySelector<HTMLInputElement>(
        'input[aria-label="Rename Untitled.md"]'
      )
    expect(renameInput?.value).toBe("Untitled.md")
  })

  it.each(["restoring", "discarding"] as const)(
    "blocks file mutations while versioning is %s",
    async (operation) => {
      await renderTree()

      await act(async () => {
        window.dispatchEvent(
          new CustomEvent("space-versioning:operation", {
            detail: { spaceId: "test-space", operation },
          })
        )
        await Promise.resolve()
      })

      expect(
        container.querySelector<HTMLButtonElement>(
          'button[aria-label="New note"]'
        )?.disabled
      ).toBe(true)
      expect(
        container
          .querySelector("file-tree-container")
          ?.getAttribute("aria-disabled")
      ).toBe("true")
    }
  )
})
