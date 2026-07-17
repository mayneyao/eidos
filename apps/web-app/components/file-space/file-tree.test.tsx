import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { SpaceFileEntry } from "@eidos.space/file-space"

vi.hoisted(() => {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size
      },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  })
})

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
const extensionEditorMocks = vi.hoisted(() => ({
  byPath: {} as Record<
    string,
    Array<{
      packageId: string
      contentDigest: string
      permissionHash: string
      id: string
      displayName: string
      extensionDisplayName: string
      selector: Array<{ filenamePattern: string }>
      priority: "default" | "option"
      editable: boolean
    }>
  >,
  load: vi.fn(),
  reportError: undefined as
    | ((filePath: string, error: unknown) => void)
    | undefined,
}))
const extensionCommandMocks = vi.hoisted(() => ({
  commands: [] as Array<{
    packageId: string
    contentDigest: string
    permissionHash: string
    id: string
    title: string
    extensionDisplayName: string
    menus: Record<
      string,
      Array<{ command: string; when?: string; group?: string }>
    >
  }>,
  execute: vi.fn(),
}))

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

vi.mock("@/apps/web-app/hooks/use-file-extension-editors", () => ({
  useFileExtensionEditors: (
    _spaceId: string,
    options?: { onLoadError?: (filePath: string, error: unknown) => void }
  ) => {
    extensionEditorMocks.reportError = options?.onLoadError
    return {
      editorsFor: (path: string) => extensionEditorMocks.byPath[path] ?? [],
      load: extensionEditorMocks.load,
      clear: vi.fn(),
    }
  },
}))

vi.mock("@/apps/web-app/hooks/use-file-extension-commands", () => ({
  useFileExtensionCommands: () => ({
    commands: extensionCommandMocks.commands,
    execute: extensionCommandMocks.execute,
    refresh: vi.fn(),
  }),
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
    localStorage.clear()
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserverStub {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
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
    extensionEditorMocks.byPath = {}
    extensionEditorMocks.reportError = undefined
    extensionEditorMocks.load.mockReset()
    extensionEditorMocks.load.mockImplementation(
      async (path: string) => extensionEditorMocks.byPath[path] ?? []
    )
    extensionCommandMocks.commands = []
    extensionCommandMocks.execute.mockReset().mockResolvedValue({
      success: true,
    })
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
    vi.unstubAllGlobals()
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

  it("shows extension source in the Files tree without destructive actions", async () => {
    currentEntriesByDirectory[""] = [
      ...currentEntriesByDirectory[""],
      entry(".eidos", "directory"),
    ]
    currentEntriesByDirectory[".eidos"] = [
      entry(".eidos/extensions", "directory"),
    ]
    currentEntriesByDirectory[".eidos/extensions"] = [
      entry(".eidos/extensions/local.hello-tools", "directory"),
    ]
    currentEntriesByDirectory[".eidos/extensions/local.hello-tools"] = [
      entry(".eidos/extensions/local.hello-tools/src", "directory"),
      entry(".eidos/extensions/local.hello-tools/extension.json", "file"),
    ]
    currentEntriesByDirectory[".eidos/extensions/local.hello-tools/src"] = [
      entry(".eidos/extensions/local.hello-tools/src/extension.ts", "file"),
    ]
    await renderTree()

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(getTreeItem(".eidos").getAttribute("aria-expanded")).toBe("true")
    expect(getTreeItem(".eidos/extensions").getAttribute("aria-expanded")).toBe(
      "true"
    )

    for (const directory of [
      ".eidos/extensions/local.hello-tools",
      ".eidos/extensions/local.hello-tools/src",
    ]) {
      await act(async () => {
        getTreeItem(directory).click()
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    }

    const sourcePath = ".eidos/extensions/local.hello-tools/src/extension.ts"
    await act(async () => getTreeItem(sourcePath).click())
    expect(navigateMock).toHaveBeenLastCalledWith(
      "/space-file#.eidos%2Fextensions%2Flocal.hello-tools%2Fsrc%2Fextension.ts"
    )
    expect(extensionEditorMocks.load).not.toHaveBeenCalledWith(sourcePath)

    await act(async () => {
      getTreeItem(sourcePath).dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: 120,
          clientY: 80,
        })
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const menu = document.body.querySelector<HTMLElement>(
      '[aria-label="Actions for extension.ts"]'
    )
    expect(menu?.textContent).toContain("Show in file manager")
    expect(menu?.textContent).not.toContain("Rename")
    expect(menu?.textContent).not.toContain("Delete")
    expect(menu?.textContent).not.toContain("Open with")
  })

  it("shows managed Agent sessions without editable file actions", async () => {
    currentEntriesByDirectory[""] = [
      ...currentEntriesByDirectory[""],
      entry(".eidos", "directory"),
    ]
    currentEntriesByDirectory[".eidos"] = [entry(".eidos/agent", "directory")]
    currentEntriesByDirectory[".eidos/agent"] = [
      entry(".eidos/agent/sessions", "directory"),
    ]
    currentEntriesByDirectory[".eidos/agent/sessions"] = [
      entry(".eidos/agent/sessions/conversation-1", "directory"),
    ]
    currentEntriesByDirectory[".eidos/agent/sessions/conversation-1"] = [
      entry(".eidos/agent/sessions/conversation-1/meta.json", "file"),
      entry(".eidos/agent/sessions/conversation-1/events.jsonl", "file"),
    ]
    await renderTree()

    for (const directory of [
      ".eidos",
      ".eidos/agent",
      ".eidos/agent/sessions",
      ".eidos/agent/sessions/conversation-1",
    ]) {
      await act(async () => {
        getTreeItem(directory).click()
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    }

    const metaPath = ".eidos/agent/sessions/conversation-1/meta.json"
    await act(async () => getTreeItem(metaPath).click())
    expect(navigateMock).toHaveBeenLastCalledWith(
      "/space-file#.eidos%2Fagent%2Fsessions%2Fconversation-1%2Fmeta.json"
    )
    expect(extensionEditorMocks.load).not.toHaveBeenCalledWith(metaPath)

    await act(async () => {
      getTreeItem(metaPath).dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: 120,
          clientY: 80,
        })
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const menu = document.body.querySelector<HTMLElement>(
      '[aria-label="Actions for meta.json"]'
    )
    expect(menu?.textContent).toContain("Show in file manager")
    expect(menu?.textContent).not.toContain("Rename")
    expect(menu?.textContent).not.toContain("Delete")
    expect(menu?.textContent).not.toContain("Open with")
  })

  it("uses a matching default extension editor for normal file activation", async () => {
    extensionEditorMocks.byPath["root.md"] = [
      {
        packageId: "example.task-board",
        contentDigest: `sha256:${"1".repeat(64)}`,
        permissionHash: `sha256:${"2".repeat(64)}`,
        id: "example.task-board.editor",
        displayName: "Task Board",
        extensionDisplayName: "Markdown Task Board",
        selector: [{ filenamePattern: "**/*.md" }],
        priority: "default",
        editable: true,
      },
    ]
    await renderTree()

    await act(async () => {
      getTreeItem("root.md").click()
      await Promise.resolve()
    })

    expect(navigateMock).toHaveBeenLastCalledWith(
      "/space-file?editor=example.task-board.editor#root.md"
    )
  })

  it("offers optional extension editors through the file context menu", async () => {
    extensionEditorMocks.byPath["root.md"] = [
      {
        packageId: "example.task-board",
        contentDigest: `sha256:${"1".repeat(64)}`,
        permissionHash: `sha256:${"2".repeat(64)}`,
        id: "example.task-board.editor",
        displayName: "Task Board",
        extensionDisplayName: "Markdown Task Board",
        selector: [{ filenamePattern: "**/*.md" }],
        priority: "option",
        editable: true,
      },
    ]
    await renderTree()

    await act(async () => {
      getTreeItem("root.md").dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: 120,
          clientY: 80,
        })
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const menu = document.body.querySelector<HTMLElement>(
      '[aria-label="Actions for root.md"]'
    )
    expect(menu?.textContent).toContain("Open with Eidos")
    const extensionButton = Array.from(
      menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []
    ).find((button) => button.textContent?.includes("Open with Task Board"))

    await act(async () => {
      extensionButton?.click()
      await Promise.resolve()
    })

    expect(navigateMock).toHaveBeenLastCalledWith(
      "/space-file?editor=example.task-board.editor#root.md"
    )
  })

  it("disables extension editors during destructive versioning", async () => {
    extensionEditorMocks.byPath["root.md"] = [
      {
        packageId: "example.task-board",
        contentDigest: `sha256:${"1".repeat(64)}`,
        permissionHash: `sha256:${"2".repeat(64)}`,
        id: "example.task-board.editor",
        displayName: "Task Board",
        extensionDisplayName: "Markdown Task Board",
        selector: [{ filenamePattern: "**/*.md" }],
        priority: "option",
        editable: true,
      },
    ]
    await renderTree()

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("space-versioning:operation", {
          detail: { spaceId: "test-space", operation: "restoring" },
        })
      )
      getTreeItem("root.md").dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: 120,
          clientY: 80,
        })
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const menu = document.body.querySelector<HTMLElement>(
      '[aria-label="Actions for root.md"]'
    )
    const openWithButtons = Array.from(
      menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []
    ).filter((button) => button.textContent?.includes("Open with"))
    expect(openWithButtons).toHaveLength(2)
    expect(openWithButtons.every((button) => button.disabled)).toBe(true)
  })

  it("explains when extension editor discovery falls back to Eidos", async () => {
    await renderTree()

    act(() => {
      extensionEditorMocks.reportError?.(
        "root.md",
        new Error("Extension service unavailable")
      )
    })

    expect(container.textContent).toContain(
      "Couldn’t load extension editors for “root.md”. Eidos can still open the file with its built-in viewer."
    )
  })

  it("runs declared extension commands from the file context menu", async () => {
    const command = {
      packageId: "local.hello-tools",
      contentDigest: `sha256:${"1".repeat(64)}`,
      permissionHash: `sha256:${"2".repeat(64)}`,
      id: "local.hello-tools.hello",
      title: "Hello from Hello Tools",
      extensionDisplayName: "Hello Tools",
      menus: {
        "files/context": [
          {
            command: "local.hello-tools.hello",
            when: "resourceIsDirectory == false",
            group: "extensions",
          },
        ],
      },
    }
    extensionCommandMocks.commands = [command]
    await renderTree()

    await act(async () => {
      getTreeItem("root.md").dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: 120,
          clientY: 80,
        })
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const menu = document.body.querySelector<HTMLElement>(
      '[aria-label="Actions for root.md"]'
    )
    const commandButton = Array.from(
      menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []
    ).find((button) => button.textContent?.includes(command.title))

    await act(async () => {
      commandButton?.click()
      await Promise.resolve()
    })

    expect(extensionCommandMocks.execute).toHaveBeenCalledWith(
      command,
      "root.md"
    )
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
