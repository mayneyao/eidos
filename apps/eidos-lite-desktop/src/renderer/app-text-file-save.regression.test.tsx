// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type {
  EidosLiteApi,
  SpaceSnapshot,
  SpaceTreeEntry,
  TextFilePreviewResult,
} from "../shared/contracts"
import type { EidosFileSnapshot } from "@eidos.space/eidos-file"
import { DEFAULT_RENDERER_PREFERENCES } from "./app-appearance"
import {
  navigateCurrentWindow,
  navigationHash,
  readNavigationHistory,
} from "./navigation-history"
import { textDraftLifecycle } from "./text-draft-lifecycle"
import { SPARK_ACTIVATION_REQUIRED } from "../shared/spark"
import { loadRecentFiles, storeRecentFiles } from "./recent-files"
import type { EidosLiteShortcutCommand } from "../shared/keyboard-shortcuts"
import {
  EIDOS_LITE_SPACE_ID_DRAG_TYPE,
  spacePathDragData,
  spacePathDragPaths,
} from "./space-path-drag"

// Keep the real TerminalPanel drop handler while replacing its display/PTY UI.
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    options = {}
    loadAddon() {}
    open() {}
    attachCustomKeyEventHandler() {}
    onData() {
      return { dispose() {} }
    }
    onResize() {
      return { dispose() {} }
    }
    focus() {}
    dispose() {}
  },
}))
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}))
vi.mock("@xterm/addon-web-links", () => ({ WebLinksAddon: class {} }))

const surface = vi.hoisted(() =>
  vi.fn<
    (props: {
      content: string
      documentKey: string
      onChange(content: string): void
    }) => void
  >()
)
vi.mock("./markdown-editor-surface", () => ({
  prepareMarkdownEditorSurface: vi.fn(async () => undefined),
  MarkdownEditorSurface: (props: Parameters<typeof surface>[0]) => {
    surface(props)
    return <div data-test-markdown={props.documentKey}>{props.content}</div>
  },
}))
const treeSurface = vi.hoisted(() =>
  vi.fn<
    (props: {
      entries: SpaceTreeEntry[]
      onMove(paths: string[], directory: string | null): Promise<void>
      onOpen(entry: SpaceTreeEntry): void
    }) => void
  >()
)
vi.mock("./space-file-tree", () => ({
  SpaceFileTree: ({
    onContextMenu,
    nameQuery,
    visible,
    entries,
    onMove,
    onOpen,
  }: {
    onContextMenu(entry: SpaceTreeEntry, x: number, y: number): void
    nameQuery?: string
    visible?: boolean
    entries: SpaceTreeEntry[]
    onMove(paths: string[], directory: string | null): Promise<void>
    onOpen(entry: SpaceTreeEntry): void
  }) => {
    treeSurface({ entries, onMove, onOpen })
    return (
      <button
        data-test-folder-menu
        data-test-name-query={nameQuery}
        data-test-tree-visible={visible}
        onClick={() =>
          onContextMenu(
            {
              kind: "directory",
              name: "business",
              relativePath: "business",
              size: 0,
              modifiedAtMs: 0,
            },
            20,
            30
          )
        }
      >
        Folder menu
      </button>
    )
  },
}))
const workbenchSurface = vi.hoisted(() =>
  vi.fn<
    (props: {
      metadataDirectory?: string
      relativePath: string
      snapshot: EidosFileSnapshot
    }) => void
  >()
)
vi.mock("./eidos-file-workbench", () => ({
  EidosFileWorkbench: (props: Parameters<typeof workbenchSurface>[0]) => {
    workbenchSurface(props)
    return (
      <div
        data-test-metadata-scope={props.metadataDirectory}
        data-test-file-path={props.relativePath}
      >
        Managed files
      </div>
    )
  },
}))

import { App } from "./app"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const oldPath = "old.md"
const newPath = "newtitle.md"
const initial: Extract<TextFilePreviewResult, { type: "text" }> = {
  type: "text",
  relativePath: oldPath,
  content: "# Old",
  encoding: "utf-8",
  bom: false,
  revision: "one",
  size: 5,
  modifiedAtMs: 1,
  truncated: false,
  browserPreview: { kind: "markdown" },
}
const staleSpace: SpaceSnapshot = {
  id: "s",
  name: "my-eidos-space",
  displayPath: "/Space",
  entries: [
    {
      name: oldPath,
      relativePath: oldPath,
      kind: "file",
      size: 5,
      modifiedAtMs: 1,
    },
    {
      name: "other.md",
      relativePath: "other.md",
      kind: "file",
      size: 7,
      modifiedAtMs: 1,
    },
  ],
  eidosFileCount: 0,
  invalidatedSessionIds: [],
  operation: { phase: "ready", recoverable: false },
  graft: {
    available: true,
    backend: "sdk",
    expectedVersion: "0.3.32",
    initialized: false,
  },
}
let root: ReturnType<typeof createRoot> | undefined
let host: HTMLDivElement

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.history.replaceState(
    null,
    "",
    navigationHash("s", { type: "file", path: oldPath, openWith: "wysiwyg" })
  )
  surface.mockClear()
  treeSurface.mockClear()
  workbenchSurface.mockClear()
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }))
  )
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  host.remove()
  textDraftLifecycle.release()
  window.localStorage.clear()
  window.sessionStorage.clear()
  vi.unstubAllGlobals()
})

it("retains the startup shell until the initial Space tree is available", async () => {
  window.history.replaceState(null, "", "#/opening")
  const shell = document.createElement("section")
  shell.id = "lite-startup"
  document.body.append(shell)
  let finish!: (space: SpaceSnapshot) => void
  installHost({
    getSpace: () =>
      new Promise<SpaceSnapshot>((resolve) => {
        finish = resolve
      }),
  })
  try {
    await act(async () => root!.render(<App />))
    expect(document.getElementById("lite-startup")).toBe(shell)
    expect(host.textContent).toBe("")
    await act(async () => finish(staleSpace))
    await vi.waitFor(() =>
      expect(host.querySelector("[data-test-folder-menu]")).not.toBeNull()
    )
    await vi.waitFor(() =>
      expect(document.getElementById("lite-startup")).toBeNull()
    )
  } finally {
    shell.remove()
  }
})

it("shows recovery instead of the selector when initial restoration fails", async () => {
  window.history.replaceState(null, "", "#/opening")
  installHost({
    getSpace: async () => {
      throw new Error("Space disk unavailable")
    },
  })
  await act(async () => root!.render(<App />))
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Space disk unavailable"
  )
  expect(host.textContent).toContain("Could not open your Space")
  expect(host.textContent).toContain("Choose another Space")
})

it("uses one batch move request and refuses a late pre-move snapshot", async () => {
  window.history.replaceState(null, "", navigationHash("s", null))
  let changed!: (snapshot: SpaceSnapshot) => void
  const moved = {
    ...staleSpace,
    sequence: 3,
    entries: staleSpace.entries.map((entry) => ({
      ...entry,
      relativePath: `archive/${entry.relativePath}`,
    })),
  }
  let currentEntries = staleSpace.entries
  const movePaths = vi.fn(async () => {
    currentEntries = moved.entries
    return {
      snapshot: moved,
      moves: staleSpace.entries.map((entry) => ({
        source: entry.relativePath,
        relativePath: `archive/${entry.relativePath}`,
      })),
      invalidatedSessionIds: [],
      unattemptedPaths: [],
    }
  })
  installHost({
    getSpace: async () => ({ ...staleSpace, sequence: 1 }),
    movePaths,
    filterSpaceFiles: async () => currentEntries,
    onSpaceChanged: (listener: typeof changed) => {
      changed = listener
      return () => {}
    },
  })
  await act(async () => root!.render(<App />))
  await vi.waitFor(() => expect(treeSurface).toHaveBeenCalled())
  await act(async () =>
    treeSurface.mock.lastCall![0].onMove([oldPath, "other.md"], "archive")
  )
  expect(movePaths).toHaveBeenCalledExactlyOnceWith(
    [oldPath, "other.md"],
    "archive",
    undefined
  )
  expect(treeSurface.mock.lastCall![0].entries).toEqual(moved.entries)
  await act(async () => changed({ ...staleSpace, sequence: 2 }))
  expect(treeSurface.mock.lastCall![0].entries).toEqual(moved.entries)
})

function installHost(overrides: Record<string, unknown>) {
  const methods: Record<string, unknown> = {
    getPreferences: async () => DEFAULT_RENDERER_PREFERENCES,
    getAppInfo: async () => ({
      platform: "darwin",
      version: "0.22.1",
      services: { name: "staging" },
    }),
    setNavigationCapabilities: vi.fn(async () => undefined),
    setFormatterContext: vi.fn(async () => undefined),
    setPluginShortcuts: vi.fn(async () => []),
    getSpace: async () => staleSpace,
    filterSpaceFiles: vi.fn<EidosLiteApi["filterSpaceFiles"]>(
      async () => staleSpace.entries
    ),
    listPlugins: async () => ({ plugins: [], space: { id: "s" } }),
    listRecentSpaces: async () => [],
    listPublicationBindings: async () => [],
    getAccountStatus: async () => ({ signedIn: false }),
    getUpdateStatus: async () => ({ state: "idle" }),
    getSyncQueueStatus: async () => null,
    setSyncDraftState: vi.fn(),
    getSyncMergeStatus: async () => ({ ok: true, value: { state: "none" } }),
    takeLaunchEidosFile: async () => null,
    getPluginInstallIntent: async () => null,
    selectFileProperties: async () => {},
    openPluginEditor: async () => ({ instance: null }),
    ...overrides,
  }
  window.eidosLite = new Proxy(methods, {
    get(target, name: string) {
      if (name in target) return target[name]
      if (name.startsWith("on")) return () => () => {}
      throw new Error(`Unexpected host call: ${name}`)
    },
  }) as unknown as EidosLiteApi
}

function fileTitleDrag(target: Element, data = new Map<string, string>()) {
  const dataTransfer = {
    effectAllowed: "none",
    get types() {
      return [...data.keys()]
    },
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
  } as unknown as DataTransfer
  const event = new Event("dragstart", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer })
  target.dispatchEvent(event)
  return { event, dataTransfer }
}

it.each([
  ".hidden 中文's note.md",
  "data.eidos",
  '中文 "movie\'s" clip.mov',
  "plain.txt",
])(
  "drags only the active %s title into Terminal with Explorer collapsed",
  async (path) => {
    const spaceId = "space-标题"
    const entry: SpaceTreeEntry = {
      name: path,
      relativePath: path,
      kind: path.endsWith(".eidos") ? "eidos" : "file",
      size: 5,
      modifiedAtMs: 1,
    }
    const snapshot = {
      path,
      metadata: { fileId: "title-drag", title: "Title", revision: 1 },
      tables: [
        {
          table: { id: "t", name: "t", settings: {} },
          fields: [],
          views: [],
          rowCount: 0,
        },
      ],
    } as unknown as EidosFileSnapshot
    const writeTerminalPath = vi.fn(async () => undefined)
    const writeTerminal = vi.fn()
    installHost({
      getPreferences: async () => ({
        ...DEFAULT_RENDERER_PREFERENCES,
        builtInPlugins: { terminal: true },
      }),
      getSpace: async () => ({ ...staleSpace, id: spaceId, entries: [entry] }),
      previewTextFile: async () =>
        path.endsWith(".mov")
          ? {
              type: "media",
              relativePath: path,
              mediaKind: "video",
              mimeType: "video/quicktime",
              previewUrl: "eidos-test://movie.mov",
              size: 5,
              modifiedAtMs: 1,
            }
          : { ...initial, relativePath: path },
      openEidosFile: async () => ({
        sessionId: "title-drag",
        relativePath: path,
        readOnly: false,
        snapshot,
      }),
      callRuntime: async () => snapshot,
      startTerminal: async () => ({ id: "terminal-title-drag", shell: "zsh" }),
      closeTerminal: async () => undefined,
      writeTerminalPath,
      writeTerminal,
    })
    window.localStorage.setItem("eidos-lite:space-sidebar-collapsed", "true")
    window.history.replaceState(null, "", navigationHash(spaceId, path))
    await act(async () => root!.render(<App />))
    await vi.waitFor(() =>
      expect(
        host.querySelector<HTMLButtonElement>(".file-titlebar-document")
          ?.draggable
      ).toBe(true)
    )
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Toggle terminal"]'
        )!
        .click()
    )
    await vi.waitFor(() =>
      expect(host.querySelector(".terminal-panel-status")?.textContent).toBe(
        "zsh"
      )
    )
    const title = host.querySelector<HTMLButtonElement>(
      ".file-titlebar-document"
    )!
    const { event, dataTransfer } = fileTitleDrag(title)
    expect(event.defaultPrevented).toBe(false)
    expect(dataTransfer.effectAllowed).toBe("copyMove")
    expect(spacePathDragData(dataTransfer)).toBe(path)
    expect(spacePathDragPaths(dataTransfer)).toEqual([path])
    expect(dataTransfer.getData(EIDOS_LITE_SPACE_ID_DRAG_TYPE)).toBe(spaceId)
    expect(dataTransfer.types).toHaveLength(3)
    const drop = new Event("drop", { bubbles: true, cancelable: true })
    Object.defineProperty(drop, "dataTransfer", { value: dataTransfer })
    host.querySelector(".terminal-viewport")!.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(true)
    expect(writeTerminalPath).toHaveBeenCalledExactlyOnceWith(
      "terminal-title-drag",
      path
    )
    expect(writeTerminal).not.toHaveBeenCalled()
    await act(async () => {
      title.dispatchEvent(new Event("dragend", { bubbles: true }))
      title.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
    })
    expect(
      host.querySelector(".workbench")?.getAttribute("data-sidebar-collapsed")
    ).toBe("true")
    if (path.endsWith(".mov")) {
      expect(
        title.querySelector(".media-file-metadata")?.textContent
      ).toContain("Video")
      expect(host.querySelector("video")?.controls).toBe(true)
    }
  }
)

it("preserves title hover/Alt, context menu, click and keyboard Reveal after a drag", async () => {
  installHost({
    previewTextFile: async () => initial,
    pluginEditors: async () => [],
  })
  window.localStorage.setItem("eidos-lite:space-sidebar-collapsed", "true")
  await act(async () => root!.render(<App />))
  await vi.waitFor(() =>
    expect(host.querySelector(".file-titlebar-document")).not.toBeNull()
  )
  const title = host.querySelector<HTMLButtonElement>(
    ".file-titlebar-document"
  )!
  await act(async () => surface.mock.lastCall![0].onChange("# Edited"))
  expect(host.querySelector(".file-titlebar-dirty")).not.toBeNull()
  await act(async () => {
    title.dispatchEvent(
      new MouseEvent("mouseover", { bubbles: true, altKey: true })
    )
  })
  expect(title.querySelector(".file-titlebar-path")?.textContent).toBe(oldPath)
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt" }))
  )
  expect(title.querySelector(".file-titlebar-path")).toBeNull()
  await act(async () => {
    title.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Alt", altKey: true, bubbles: true })
    )
    title.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }))
  })
  expect(title.querySelector(".file-titlebar-path")).toBeNull()
  const context = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: 10,
    clientY: 20,
  })
  await act(async () => title.dispatchEvent(context))
  expect(context.defaultPrevented).toBe(true)
  expect(host.querySelector(".space-context-menu")).not.toBeNull()
  expect(
    host.querySelector(".workbench")?.getAttribute("data-sidebar-collapsed")
  ).toBe("true")
  fileTitleDrag(title)
  // Native keyboard activation has detail 0 and remains available after drag.
  await act(async () => title.click())
  expect(
    host.querySelector(".workbench")?.getAttribute("data-sidebar-collapsed")
  ).toBe("false")
  expect(host.querySelector(".file-titlebar-dirty")).not.toBeNull()
  expect(surface.mock.lastCall![0].content).toBe("# Edited")
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[data-sidebar-toggle="close"]')!
      .click()
  )
  fileTitleDrag(title)
  await act(async () => {
    title.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    title.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }))
  })
  expect(
    host.querySelector(".workbench")?.getAttribute("data-sidebar-collapsed")
  ).toBe("false")
})

it("uses the newly ready document, never the Explorer context selection or pending title", async () => {
  let complete!: (preview: TextFilePreviewResult) => void
  installHost({
    previewTextFile: (path: string) =>
      path === oldPath
        ? Promise.resolve(initial)
        : new Promise<TextFilePreviewResult>((resolve) => {
            complete = resolve
          }),
  })
  await act(async () => root!.render(<App />))
  await vi.waitFor(() =>
    expect(host.querySelector(".file-titlebar-document")).not.toBeNull()
  )
  await act(async () =>
    host.querySelector<HTMLButtonElement>("[data-test-folder-menu]")!.click()
  )
  expect(
    spacePathDragPaths(
      fileTitleDrag(host.querySelector(".file-titlebar-document")!).dataTransfer
    )
  ).toEqual([oldPath])
  const previousTitle = host.querySelector(".file-titlebar-document")!
  await act(async () => navigateCurrentWindow("other.md"))
  await vi.waitFor(() => expect(complete).toBeTypeOf("function"))
  expect(host.querySelector(".file-titlebar-document")).toBeNull()
  expect(host.querySelector(".file-titlebar")?.textContent).toContain(
    "other.md"
  )
  expect(spacePathDragPaths(fileTitleDrag(previousTitle).dataTransfer)).toEqual(
    []
  )
  await act(async () =>
    complete({ ...initial, relativePath: "other.md", content: "# Other" })
  )
  const title = host.querySelector(".file-titlebar-document")!
  expect(spacePathDragPaths(fileTitleDrag(title).dataTransfer)).toEqual([
    "other.md",
  ])
  await act(async () => navigateCurrentWindow(oldPath))
  await vi.waitFor(() =>
    expect(
      host.querySelector(".file-titlebar-document")?.textContent
    ).toContain("old.md")
  )
  expect(
    spacePathDragPaths(
      fileTitleDrag(host.querySelector(".file-titlebar-document")!).dataTransfer
    )
  ).toEqual([oldPath])
  const previousCompletion = complete
  await act(async () => navigateCurrentWindow("other.md"))
  await vi.waitFor(() => expect(complete).not.toBe(previousCompletion))
  await act(async () => navigateCurrentWindow(oldPath))
  expect(host.querySelector(".file-titlebar-document")).toBeNull()
  await act(async () =>
    complete({ ...initial, relativePath: "other.md", content: "# Other" })
  )
  await vi.waitFor(() =>
    expect(
      host.querySelector(".file-titlebar-document")?.textContent
    ).toContain("old.md")
  )
  expect(
    spacePathDragPaths(
      fileTitleDrag(host.querySelector(".file-titlebar-document")!).dataTransfer
    )
  ).toEqual([oldPath])
})

it("cancels a title drag when the current Space snapshot no longer has its file or blocks interaction", async () => {
  let changed!: (space: SpaceSnapshot) => void
  installHost({
    previewTextFile: async () => initial,
    onSpaceChanged: (listener: typeof changed) => {
      changed = listener
      return () => {}
    },
  })
  await act(async () => root!.render(<App />))
  await vi.waitFor(() =>
    expect(
      host.querySelector<HTMLButtonElement>(".file-titlebar-document")
        ?.draggable
    ).toBe(true)
  )
  for (const snapshot of [
    { ...staleSpace, entries: [] },
    {
      ...staleSpace,
      operation: { phase: "materializing", recoverable: false },
    },
  ] satisfies SpaceSnapshot[]) {
    await act(async () => changed(snapshot))
    const title = host.querySelector<HTMLButtonElement>(
      ".file-titlebar-document"
    )!
    expect(title.draggable).toBe(false)
    const { event, dataTransfer } = fileTitleDrag(title)
    expect(event.defaultPrevented).toBe(true)
    expect(spacePathDragPaths(dataTransfer)).toEqual([])
  }
})

it("keeps Space and plugin-list titles free of file drag payloads", async () => {
  installHost({
    previewTextFile: async () => initial,
    getPluginInstallTasks: async () => ({}),
    getPluginPackagePreviews: async () => [],
    pluginMarketplace: async () => ({
      plugins: [],
      cached: true,
      fetchedAt: "2026-11-16T05:00:00.000Z",
    }),
  })
  await act(async () => root!.render(<App />))
  await vi.waitFor(() =>
    expect(host.querySelector(".file-titlebar-document")).not.toBeNull()
  )
  for (const location of [null, { type: "plugins" as const }]) {
    await act(async () => navigateCurrentWindow(location))
    expect(host.querySelector(".file-titlebar-document")).toBeNull()
    expect(host.querySelector('.file-titlebar [draggable="true"]')).toBeNull()
    expect(
      spacePathDragPaths(
        fileTitleDrag(host.querySelector(".file-titlebar strong")!).dataTransfer
      )
    ).toEqual([])
  }
})

it.each([
  {
    name: "calendar period",
    query: {
      filter: {
        op: "and",
        args: [
          { op: "calendar-period", fieldId: "when", unit: "day", offset: 0 },
        ],
      },
    },
    supported: true,
  },
  {
    name: "calendar window",
    query: {
      filter: {
        op: "calendar-window",
        fieldId: "when",
        direction: "next",
        unit: "day",
        count: 2,
      },
    },
    supported: true,
  },
  {
    name: "unknown future query",
    query: { filter: { op: "future-date-query", fieldId: "when", version: 3 } },
    supported: false,
  },
])(
  "keeps consumer-projected snapshots when reopening a cached $name file",
  async ({ query, supported }) => {
    const entry: SpaceTreeEntry = {
      kind: "eidos",
      name: "dates.eidos",
      relativePath: "dates.eidos",
      size: 1000,
      modifiedAtMs: 1,
    }
    const document = JSON.stringify(query)
    const negotiated = {
      path: entry.relativePath,
      metadata: { fileId: "dates", title: "Dates", revision: 13 },
      queryCapabilities: {
        calendarQueryVersion: 2,
        calendarWindowVersion: 1,
        calendarPeriodTimeZoneData: ["2026f"],
      },
      tables: [
        {
          table: { id: "dates", name: "Dates", settings: {} },
          fields: [],
          views: [
            {
              id: "grid",
              name: "Grid",
              type: "grid",
              query: document,
              queryStatus: supported ? "supported" : "unsupported",
              filter: null,
              sorts: [],
            },
          ],
          rowCount: 5,
        },
      ],
    } as unknown as EidosFileSnapshot
    const opening = structuredClone(negotiated)
    delete opening.queryCapabilities!.calendarWindowVersion
    opening.tables[0]!.views[0]!.queryStatus = "unsupported"
    const open = vi.fn(async () => ({
      sessionId: "dates",
      relativePath: entry.relativePath,
      readOnly: false,
      snapshot: structuredClone(opening),
    }))
    const callRuntime = vi.fn(async (_session, method, _args, consumer) => {
      expect(method).toBe("getSnapshot")
      expect(consumer).toEqual({
        calendarQueryVersion: 2,
        calendarWindowVersion: 1,
      })
      return structuredClone(negotiated)
    })
    installHost({
      getSpace: async () => ({
        ...staleSpace,
        entries: [...staleSpace.entries, entry],
        eidosFileCount: 1,
      }),
      openEidosFile: open,
      callRuntime,
      previewTextFile: async () => initial,
      inspectEidosFileIssue: async () => null,
    })
    window.history.replaceState(
      null,
      "",
      navigationHash("s", entry.relativePath)
    )
    await act(async () => root!.render(<App />))
    const latest = () => workbenchSurface.mock.lastCall![0].snapshot
    const expectedStatus = supported ? "supported" : "unsupported"
    await vi.waitFor(() =>
      expect(latest().tables[0]!.views[0]!.queryStatus).toBe(expectedStatus)
    )
    expect(callRuntime).toHaveBeenCalledOnce()
    await act(async () => treeSurface.mock.lastCall![0].onOpen(entry))
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(2))
    await vi.waitFor(() =>
      expect(latest().queryCapabilities?.calendarWindowVersion).toBe(1)
    )
    expect(latest().tables[0]!.views[0]!.queryStatus).toBe(expectedStatus)
    expect(latest().tables[0]!.views[0]!.query).toBe(document)
    await act(async () =>
      treeSurface.mock.lastCall![0].onOpen(staleSpace.entries[0]!)
    )
    await vi.waitFor(() =>
      expect(host.querySelector("[data-test-markdown]")).not.toBeNull()
    )
    await act(async () => treeSurface.mock.lastCall![0].onOpen(entry))
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(3))
    await vi.waitFor(() =>
      expect(latest().queryCapabilities?.calendarWindowVersion).toBe(1)
    )
    expect(latest().tables[0]!.views[0]!.queryStatus).toBe(expectedStatus)
    expect(latest().tables[0]!.views[0]!.query).toBe(document)
    expect(callRuntime).toHaveBeenCalledTimes(3)
    await act(async () => navigateCurrentWindow(oldPath))
    await vi.waitFor(() =>
      expect(host.querySelector("[data-test-markdown]")).not.toBeNull()
    )
    await act(async () => navigateCurrentWindow(entry.relativePath))
    await vi.waitFor(() =>
      expect(
        host.querySelector('[data-test-file-path="dates.eidos"]')
      ).not.toBeNull()
    )
    expect(latest().queryCapabilities?.calendarWindowVersion).toBe(1)
    expect(latest().tables[0]!.views[0]!.queryStatus).toBe(expectedStatus)
    expect(latest().tables[0]!.views[0]!.query).toBe(document)
    expect(open).toHaveBeenCalledTimes(3)
    expect(callRuntime).toHaveBeenCalledTimes(3)
  }
)

it("retains the main plugin iframe for route-free navigation and reopens explicit routes or different pages", async () => {
  const pageKey = "test.agent/chat"
  window.history.replaceState(
    null,
    "",
    navigationHash("s", { type: "plugin-page", key: pageKey })
  )
  let nextTicket = 0
  const openPage = vi.fn(async (key: string) => ({
    instance: {
      ticket: "page-" + ++nextTicket,
      url: "eidos-plugin://chat/index.html",
      editor: { key, label: "Conversation", pluginName: "Agent" },
    },
  }))
  const close = vi.fn(async () => {})
  installHost({
    previewTextFile: async () => initial,
    openPluginPage: openPage,
    closePluginEditor: close,
    pluginRequest: async (
      _ticket: string,
      request: { id: string; params: { viewId: string; route?: string } }
    ) => ({
      response: {
        protocol: "eidos-plugin",
        apiVersion: 1,
        id: request.id,
        result: null,
      },
      navigation: {
        key: "test.agent/" + request.params.viewId,
        route: request.params.route ?? "",
        ...(request.params.route === undefined ? { reuse: true } : {}),
      },
    }),
  })
  await act(async () => root!.render(<App />))
  await vi.waitFor(() =>
    expect(host.querySelector(".plugin-page iframe")).not.toBeNull()
  )
  const first = host.querySelector<HTMLIFrameElement>(".plugin-page iframe")!
  const navigate = async (viewId: string, route?: string) => {
    const frame = host.querySelector<HTMLIFrameElement>(".plugin-page iframe")!
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          source: frame.contentWindow,
          data: {
            protocol: "eidos-plugin",
            apiVersion: 1,
            id: crypto.randomUUID(),
            method: "ui.navigate",
            params: { viewId, ...(route === undefined ? {} : { route }) },
          },
        })
      )
    })
  }
  await navigate("chat")
  await navigate("chat")
  expect(host.querySelector(".plugin-page iframe")).toBe(first)
  expect(openPage).toHaveBeenCalledTimes(1)
  expect(close).not.toHaveBeenCalled()

  await navigate("chat", "")
  await vi.waitFor(() => expect(openPage).toHaveBeenCalledTimes(2))
  const explicitEmpty = host.querySelector(".plugin-page iframe")
  expect(explicitEmpty).not.toBe(first)
  expect(close).toHaveBeenCalled()

  await navigate("chat", "session-2")
  await vi.waitFor(() => expect(openPage).toHaveBeenCalledTimes(3))
  const explicitSession = host.querySelector(".plugin-page iframe")
  expect(explicitSession).not.toBe(explicitEmpty)

  await navigate("other")
  await vi.waitFor(() => expect(openPage).toHaveBeenCalledTimes(4))
  expect(openPage).toHaveBeenLastCalledWith("test.agent/other")
  expect(host.querySelector(".plugin-page iframe")).not.toBe(explicitSession)
})

it("preserves date/plugin switching while tree filtering and modal search own separate queries", async () => {
  let selected: string | null = null
  const shortcuts = new Set<(command: EidosLiteShortcutCommand) => void>()
  const folder: SpaceTreeEntry = {
    name: "business",
    relativePath: "business",
    kind: "directory",
    size: 0,
    modifiedAtMs: 1,
    childrenLoaded: true,
    children: [],
  }
  const space = { ...staleSpace, entries: [...staleSpace.entries, folder] }
  const paths = vi.fn(async () => [{ ...folder, score: 1 }])
  const preview = vi.fn(async () => initial)
  const showModal = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    "showModal"
  )
  const closeDialog = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    "close"
  )
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = false
      },
    },
  })
  const listFiles = vi.fn(async () => ({
    entries: [],
    earlierCount: 0,
    total: 0,
    hasMore: false,
  }))
  const chooseExplorer = vi.fn(async (key: string | null) => {
    selected = key
  })
  const openExplorer = vi.fn(async () => ({
    instance: null,
    warning: "Preview unavailable",
  }))
  installHost({
    getSpace: async () => space,
    previewTextFile: preview,
    reportFileOpened: async () => undefined,
    listExplorerFiles: listFiles,
    filterSpaceFiles: async () => space.entries,
    searchSpacePaths: paths,
    onWorkspaceShortcutCommand: (
      listener: (command: EidosLiteShortcutCommand) => void
    ) => {
      shortcuts.add(listener)
      return () => shortcuts.delete(listener)
    },
    listPlugins: async () => ({
      plugins: [
        {
          enabled: true,
          hash: "tags-v1",
          manifest: {
            apiVersion: 1,
            id: "demo.tags",
            name: "Tags Explorer",
            version: "0.1.0",
            views: [
              { id: "tags", title: "Tags", kind: "page", entry: "./main.ts" },
            ],
            placements: [{ location: "sidebar/explorer", view: "tags" }],
          },
        },
      ],
      space: { explorer: selected },
    }),
    setPluginExplorer: chooseExplorer,
    openPluginExplorer: openExplorer,
  })
  try {
    await act(async () => root!.render(<App />))
    await vi.waitFor(() =>
      expect(host.querySelector('[aria-label="Tags"]')).not.toBeNull()
    )
    const click = async (label: string) => {
      const button = host.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`
      )
      expect(button).not.toBeNull()
      await act(async () => button!.click())
    }
    await click("Recent files")
    await vi.waitFor(() => expect(listFiles).toHaveBeenCalledTimes(1))
    expect(
      host
        .querySelector('[data-layout="modified"]')
        ?.getAttribute("aria-pressed")
    ).toBe("true")
    await click("Tags")
    await vi.waitFor(() =>
      expect(openExplorer).toHaveBeenCalledWith("demo.tags/tags", {
        activePath: oldPath,
        rootDirectory: null,
        sort: { by: "name", direction: "ascending" },
      })
    )
    expect(chooseExplorer).toHaveBeenCalledWith("demo.tags/tags")
    expect(host.textContent).toContain(
      "Plugin explorer unavailable. Showing built-in explorer."
    )
    await click("Folders")
    await vi.waitFor(() =>
      expect(chooseExplorer).toHaveBeenLastCalledWith(null)
    )
    await click("Filter tree by name")
    const filter = host.querySelector<HTMLInputElement>(
      'input[aria-label="Filter tree by name"]'
    )!
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(filter, "old")
      filter.dispatchEvent(new Event("input", { bubbles: true }))
    })
    expect(host.querySelector('[data-test-name-query="old"]')).not.toBeNull()
    expect(host.querySelector('[data-test-tree-visible="true"]')).not.toBeNull()
    expect(
      host.querySelector('[data-layout="tree"]')?.getAttribute("aria-pressed")
    ).toBe("true")
    expect(listFiles).toHaveBeenCalledTimes(1)
    const editor = host.querySelector("[data-test-markdown]")
    const reads = preview.mock.calls.length
    const invoke = async (command: EidosLiteShortcutCommand) => {
      await act(async () => {
        for (const listener of [...shortcuts]) listener(command)
      })
    }
    await invoke("search-space-text")
    const dialog = host.querySelector("dialog")!
    expect(
      dialog.querySelector('[aria-label="Search saved text"]')
    ).not.toBeNull()
    await invoke("quick-open")
    expect(host.querySelector("dialog")).toBe(dialog)
    expect(
      dialog.querySelector('[aria-label="Search files by name"]')
    ).not.toBeNull()
    await invoke("search-space-text")
    expect(
      dialog.querySelector('[aria-label="Search saved text"]')
    ).not.toBeNull()
    await act(async () =>
      dialog
        .querySelector<HTMLButtonElement>('[aria-label="Close search"]')!
        .click()
    )
    expect(filter.value).toBe("old")
    expect(host.querySelector("[data-test-markdown]")).toBe(editor)
    expect(preview).toHaveBeenCalledTimes(reads)
    await click("Recent files")
    expect(
      host.querySelector('input[aria-label="Filter tree by name"]')
    ).toBeNull()
    expect(host.querySelector('[data-test-name-query=""]')).not.toBeNull()
    expect(listFiles).toHaveBeenCalledTimes(1)
    await click("Tags")
    await invoke("quick-open")
    const input = host.querySelector<HTMLInputElement>("dialog input")!
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(input, "business")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await vi.waitFor(() =>
      expect(paths).toHaveBeenCalledWith("business", 50, true)
    )
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    )
    expect(host.querySelector("dialog")).toBeNull()
    expect(
      host.querySelector('[data-layout="tree"]')?.getAttribute("aria-pressed")
    ).toBe("true")
    expect(chooseExplorer).toHaveBeenLastCalledWith(null)
    expect(
      host.querySelector('[aria-label="Folder path"]')?.textContent
    ).toContain("business")
    expect(preview).toHaveBeenCalledTimes(reads)
  } finally {
    await act(async () => root!.unmount())
    root = undefined
    if (showModal)
      Object.defineProperty(HTMLDialogElement.prototype, "showModal", showModal)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal")
    if (closeDialog)
      Object.defineProperty(HTMLDialogElement.prototype, "close", closeDialog)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, "close")
  }
})

it("keeps typing during an automatic local apply and delayed preview refresh with its old revision", async () => {
  let changed!: (snapshot: SpaceSnapshot) => void
  let finishPreview!: (preview: TextFilePreviewResult) => void
  const preview = vi
    .fn()
    .mockResolvedValueOnce(initial)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishPreview = resolve
        })
    )
  const save = vi.fn()
  const reportDrafts = vi.fn()
  installHost({
    previewTextFile: preview,
    saveTextFile: save,
    setSyncDraftState: reportDrafts,
    onSpaceChanged: (listener: typeof changed) => {
      changed = listener
      return () => {}
    },
  })
  await act(async () => root!.render(<App />))
  await vi.waitFor(() =>
    expect(surface.mock.lastCall?.[0].content).toBe(initial.content)
  )
  await act(async () =>
    changed({
      ...staleSpace,
      operation: { phase: "materializing", recoverable: true },
    })
  )
  await act(async () =>
    surface.mock.lastCall![0].onChange("# Typed while applying")
  )
  await act(async () =>
    changed({ ...staleSpace, materializedPaths: [oldPath] })
  )
  await vi.waitFor(() => expect(preview).toHaveBeenCalledTimes(2))
  await act(async () =>
    surface.mock.lastCall![0].onChange(
      "# Typed while applying\nAnd during refresh"
    )
  )
  await act(async () =>
    finishPreview({ ...initial, content: "# Remote", revision: "remote-two" })
  )
  expect(surface.mock.lastCall?.[0].content).toBe(
    "# Typed while applying\nAnd during refresh"
  )
  expect(host.textContent).toContain("Changed on disk")
  expect(textDraftLifecycle.getDraft(oldPath)).toEqual({
    content: "# Typed while applying\nAnd during refresh",
    revision: "one",
  })
  expect(reportDrafts).toHaveBeenLastCalledWith("s", true)
  await act(async () =>
    host
      .querySelector("[data-text-file-editor]")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true })
      )
  )
  expect(save).not.toHaveBeenCalled()
  textDraftLifecycle.update(oldPath, null)
})

it("rebases a clean editor after automatic receive so its next save uses the new disk revision", async () => {
  let changed!: (snapshot: SpaceSnapshot) => void
  const remote = { ...initial, content: "# Remote", revision: "remote-two" }
  const preview = vi
    .fn()
    .mockResolvedValueOnce(initial)
    .mockResolvedValueOnce(remote)
  const save = vi.fn(async () => ({
    status: "saved",
    file: { ...remote, content: "# Remote edited", revision: "three" },
  }))
  installHost({
    previewTextFile: preview,
    saveTextFile: save,
    onSpaceChanged: (listener: typeof changed) => {
      changed = listener
      return () => {}
    },
  })
  await act(async () => root!.render(<App />))
  await vi.waitFor(() =>
    expect(surface.mock.lastCall?.[0].content).toBe(initial.content)
  )
  await act(async () =>
    changed({ ...staleSpace, materializedPaths: [oldPath] })
  )
  await vi.waitFor(() =>
    expect(surface.mock.lastCall?.[0].content).toBe("# Remote")
  )
  await act(async () => surface.mock.lastCall![0].onChange("# Remote edited"))
  await act(async () =>
    host
      .querySelector("[data-text-file-editor]")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true })
      )
  )
  expect(save).toHaveBeenCalledWith({
    relativePath: oldPath,
    content: "# Remote edited",
    expectedRevision: "remote-two",
  })
  expect(host.textContent).not.toContain("Changed on disk")
})

it("discards a delayed automatic preview after the user navigates to another file", async () => {
  let changed!: (snapshot: SpaceSnapshot) => void
  let finish!: (preview: TextFilePreviewResult) => void
  const other = {
    ...initial,
    relativePath: "other.md",
    content: "# Other",
    revision: "other",
  }
  const preview = vi
    .fn()
    .mockResolvedValueOnce(initial)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    .mockResolvedValueOnce(other)
  installHost({
    previewTextFile: preview,
    onSpaceChanged: (listener: typeof changed) => {
      changed = listener
      return () => {}
    },
  })
  await act(async () => root!.render(<App />))
  await vi.waitFor(() =>
    expect(surface.mock.lastCall?.[0].content).toBe(initial.content)
  )
  await act(async () =>
    changed({ ...staleSpace, materializedPaths: [oldPath] })
  )
  await vi.waitFor(() => expect(preview).toHaveBeenCalledTimes(2))
  await act(async () => navigateCurrentWindow("other.md"))
  await vi.waitFor(() =>
    expect(surface.mock.lastCall?.[0].content).toBe("# Other")
  )
  await act(async () =>
    finish({ ...initial, content: "# Remote", revision: "remote-two" })
  )
  expect(surface.mock.lastCall?.[0].content).toBe("# Other")
})

it("keeps a recoverable text draft when an automatic receive deletes its file", async () => {
  let changed!: (snapshot: SpaceSnapshot) => void
  const preview = vi
    .fn()
    .mockResolvedValueOnce(initial)
    .mockRejectedValueOnce(new Error("File no longer exists"))
  installHost({
    previewTextFile: preview,
    onSpaceChanged: (listener: typeof changed) => {
      changed = listener
      return () => {}
    },
  })
  await act(async () => root!.render(<App />))
  await vi.waitFor(() =>
    expect(surface.mock.lastCall?.[0].content).toBe(initial.content)
  )
  await act(async () =>
    changed({
      ...staleSpace,
      operation: { phase: "materializing", recoverable: true },
    })
  )
  await act(async () => surface.mock.lastCall![0].onChange("# Keep my draft"))
  await act(async () =>
    changed({
      ...staleSpace,
      entries: staleSpace.entries.filter(
        (entry) => entry.relativePath !== oldPath
      ),
      materializedPaths: [oldPath],
    })
  )
  await vi.waitFor(() => expect(preview).toHaveBeenCalledTimes(2))
  expect(textDraftLifecycle.getDraft(oldPath)).toEqual({
    content: "# Keep my draft",
    revision: "one",
  })
  expect(surface.mock.lastCall?.[0].content).toBe("# Keep my draft")
  textDraftLifecycle.update(oldPath, null)
})

it.each(["toolbar", "recent"])(
  "shows Spark activation guidance instead of missing-file recovery when catalog creation is denied from %s",
  async (mode) => {
    const openSettingsDestination = vi.fn(async () => {})
    const inspect = vi.fn(async () => {
      throw new Error("Should not inspect a catalog that has not been created")
    })
    installHost({
      openFileMetadata: async () => {
        throw new Error(
          `Error invoking remote method: ${SPARK_ACTIVATION_REQUIRED}`
        )
      },
      inspectEidosFileIssue: inspect,
      openSettingsDestination,
    })
    if (mode === "recent") {
      storeRecentFiles(window.localStorage, "s", [
        { relativePath: ".eidos/files.eidos", name: "Files", kind: "eidos" },
      ])
    }
    window.history.replaceState(null, "", navigationHash("s", null))
    await act(async () => root!.render(<App />))
    const selector =
      mode === "recent"
        ? '[data-recent-file-path=".eidos/files.eidos"]'
        : '[aria-label="Manage files"]'
    await vi.waitFor(() => expect(host.querySelector(selector)).not.toBeNull())
    await act(async () =>
      host.querySelector<HTMLButtonElement>(selector)!.click()
    )
    await vi.waitFor(() =>
      expect(host.textContent).toContain(SPARK_ACTIVATION_REQUIRED)
    )
    expect(inspect).not.toHaveBeenCalled()
    expect(host.textContent).not.toContain("Eidos File is missing")
    if (mode === "recent") {
      expect(loadRecentFiles(window.localStorage, "s")).toEqual([
        { relativePath: ".eidos/files.eidos", name: "Files", kind: "eidos" },
      ])
    }
    const activate = Array.from(
      host.querySelectorAll<HTMLButtonElement>("button")
    ).find(
      (button) => button.textContent === "Activate Spark in Account & Services"
    )!
    expect(activate).toBeDefined()
    await act(async () => activate.click())
    expect(openSettingsDestination).toHaveBeenCalledWith("account-sync")
  }
)

it.each(["root", "folder", "restore", "recent"])(
  "opens Space metadata through the built-in editor from %s",
  async (mode) => {
    const snapshot = {
      path: ".eidos/files.eidos",
      metadata: {
        fileId: "catalog",
        title: "Files",
        revision: 0,
        defaultTableId: "files",
      },
      tables: [
        {
          table: {
            id: "files",
            name: "files",
            settings: { vtabModule: "fs_meta" },
          },
          fields: [],
          views: [],
          rowCount: 0,
        },
      ],
    } as unknown as EidosFileSnapshot
    const open = vi.fn(async () => ({
      sessionId: "catalog",
      relativePath: ".eidos/files.eidos",
      readOnly: false,
      snapshot,
    }))
    const plugins = vi.fn(async () => {
      throw new Error("The .eidos implementation directory is protected")
    })
    const callRuntime = vi.fn(async () => snapshot)
    installHost({
      openFileMetadata: open,
      callRuntime,
      openPluginEditor: plugins,
      inspectEidosFileIssue: async () => null,
    })
    if (mode === "recent") {
      storeRecentFiles(window.localStorage, "s", [
        { relativePath: ".eidos/files.eidos", name: "Files", kind: "eidos" },
      ])
    }
    window.history.replaceState(
      null,
      "",
      navigationHash(
        "s",
        mode === "restore"
          ? {
              type: "record",
              path: ".eidos/files.eidos",
              tableId: "files",
              rowId: null,
              directory: "business",
            }
          : null
      )
    )
    await act(async () => root!.render(<App />))
    if (mode !== "restore") {
      await vi.waitFor(() =>
        expect(host.querySelector('[aria-label="Manage files"]')).not.toBeNull()
      )
      if (mode === "recent") {
        await vi.waitFor(() =>
          expect(
            host.querySelector('[data-recent-file-path=".eidos/files.eidos"]')
          ).not.toBeNull()
        )
        await act(async () =>
          host
            .querySelector<HTMLButtonElement>(
              '[data-recent-file-path=".eidos/files.eidos"]'
            )!
            .click()
        )
      } else if (mode === "root") {
        await act(async () =>
          host
            .querySelector<HTMLButtonElement>('[aria-label="Manage files"]')!
            .click()
        )
      } else {
        await act(async () =>
          host
            .querySelector<HTMLButtonElement>("[data-test-folder-menu]")!
            .click()
        )
        const item = Array.from(
          host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
        ).find((button) => button.textContent?.includes("Manage files"))!
        expect(
          Array.from(host.querySelectorAll('[role="menuitem"]'), (button) =>
            button.textContent?.trim()
          )
        ).toEqual([
          "Show this folder",
          "New File",
          "New folder",
          "Cut⌘X",
          "Copy⌘C",
          "Paste⌘V",
          "Rename",
          "Reveal in Finder",
          "Copy Relative Path",
          "Copy Path",
          "Manage files",
          "Move to Trash",
        ])
        expect(
          host.querySelectorAll('.space-context-menu > [role="separator"]')
        ).toHaveLength(4)
        await act(async () => item.click())
      }
    }
    await vi.waitFor(() =>
      expect(host.querySelector("[data-test-metadata-scope]")).not.toBeNull()
    )
    expect(
      host
        .querySelector("[data-test-metadata-scope]")!
        .getAttribute("data-test-metadata-scope")
    ).toBe(mode === "root" || mode === "recent" ? "" : "business")
    expect(open).toHaveBeenCalledOnce()
    expect(callRuntime).toHaveBeenCalledWith("catalog", "getSnapshot", [], {
      calendarQueryVersion: 2,
      calendarWindowVersion: 1,
    })
    expect(open).toHaveBeenCalledWith(
      mode === "root" || mode === "recent" ? null : "business"
    )
    expect(plugins).not.toHaveBeenCalled()
    expect(host.textContent).not.toContain("Could not open")
    const breadcrumb = host.querySelector<HTMLElement>(
      'nav[aria-label="File management folder"]'
    )!
    expect(breadcrumb).not.toBeNull()
    expect(breadcrumb.closest(".file-titlebar")).not.toBeNull()
    expect(
      breadcrumb.querySelector('[aria-current="location"]')?.textContent
    ).toBe(mode === "root" || mode === "recent" ? staleSpace.name : "business")
    if (mode === "root" || mode === "folder") {
      await act(async () => navigateCurrentWindow(null))
      await vi.waitFor(() =>
        expect(
          host.querySelector('[data-recent-file-path=".eidos/files.eidos"]')
        ).not.toBeNull()
      )
      await act(async () =>
        host
          .querySelector<HTMLButtonElement>(
            '[data-recent-file-path=".eidos/files.eidos"]'
          )!
          .click()
      )
      await vi.waitFor(() =>
        expect(
          host
            .querySelector("[data-test-metadata-scope]")
            ?.getAttribute("data-test-metadata-scope")
        ).toBe("")
      )
      expect(open).toHaveBeenCalledOnce()
      expect(plugins).not.toHaveBeenCalled()
      expect(readNavigationHistory("s").location).toEqual({
        type: "record",
        path: ".eidos/files.eidos",
        tableId: "files",
        rowId: null,
      })
    }
    expect(loadRecentFiles(window.localStorage, "s")).toEqual([
      { relativePath: ".eidos/files.eidos", name: "Files", kind: "eidos" },
    ])
    expect(host.textContent).not.toContain("no longer available")
    await act(async () =>
      host
        .querySelector('nav[aria-label="File management folder"]')!
        .querySelector<HTMLButtonElement>("button")!
        .click()
    )
    expect(
      host
        .querySelector("[data-test-metadata-scope]")!
        .getAttribute("data-test-metadata-scope")
    ).toBe("")
    expect(open).toHaveBeenCalledOnce()
  }
)

it.each(["missing.md", ".eidos/settings.eidos"])(
  "keeps the missing recent-file behavior for %s",
  async (relativePath) => {
    const openFileMetadata = vi.fn()
    const openEidosFile = vi.fn()
    const previewTextFile = vi.fn()
    const openPluginEditor = vi.fn()
    const loadSpaceDirectory = vi.fn()
    installHost({
      openFileMetadata,
      openEidosFile,
      previewTextFile,
      openPluginEditor,
      loadSpaceDirectory,
    })
    const remaining = {
      relativePath: oldPath,
      name: oldPath,
      kind: "file" as const,
    }
    storeRecentFiles(window.localStorage, "s", [
      {
        relativePath,
        name: relativePath.split("/").at(-1)!,
        kind: relativePath.endsWith(".eidos") ? "eidos" : "file",
      },
      remaining,
    ])
    window.history.replaceState(null, "", navigationHash("s", null))
    await act(async () => root!.render(<App />))
    const selector = `[data-recent-file-path="${relativePath}"]`
    await vi.waitFor(() => expect(host.querySelector(selector)).not.toBeNull())
    await act(async () =>
      host.querySelector<HTMLButtonElement>(selector)!.click()
    )
    await vi.waitFor(() =>
      expect(host.textContent).toContain(
        "is no longer available in this Space."
      )
    )
    expect(loadRecentFiles(window.localStorage, "s")).toEqual([remaining])
    expect(host.querySelector("[data-test-metadata-scope]")).toBeNull()
    expect(openFileMetadata).not.toHaveBeenCalled()
    expect(openEidosFile).not.toHaveBeenCalled()
    expect(previewTextFile).not.toHaveBeenCalled()
    expect(openPluginEditor).not.toHaveBeenCalled()
    expect(loadSpaceDirectory).not.toHaveBeenCalled()
  }
)

it("follows the saved hook rename without reopening against a stale file list", async () => {
  let complete!: (result: unknown) => void
  const preview = vi.fn(async () => initial)
  const save = vi.fn(
    () =>
      new Promise((resolve) => {
        complete = resolve
      })
  )
  installHost({ previewTextFile: preview, saveTextFile: save })
  await act(async () => root!.render(<App />))
  await vi.waitFor(() =>
    expect(surface.mock.lastCall?.[0].content).toBe("# Old")
  )
  const identity = surface.mock.lastCall![0].documentKey
  const before = readNavigationHistory("s")
  await act(async () => surface.mock.lastCall![0].onChange("# newtitle"))
  const titleSave = host.querySelector<HTMLButtonElement>(
    '.file-titlebar [aria-label="Save old.md (Cmd+S)"]'
  )!
  expect(titleSave).not.toBeNull()
  expect(
    titleSave.closest(".text-file-save-slot")?.previousElementSibling?.className
  ).toBe("file-titlebar-document")
  expect(host.querySelector(".text-file-editor footer")).toBeNull()
  expect(
    host.querySelector("[data-text-file-editor] .text-file-title-save")
  ).toBeNull()
  await act(async () => {
    host
      .querySelector("[data-text-file-editor]")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true })
      )
  })
  expect(save).toHaveBeenCalledOnce()
  await act(async () =>
    surface.mock.lastCall![0].onChange("# newtitle\nStill typing")
  )
  await act(async () =>
    complete({
      status: "saved",
      file: {
        ...initial,
        relativePath: newPath,
        content: "# newtitle",
        revision: "two",
      },
    })
  )
  expect(host.textContent).not.toContain("no longer available")
  expect(
    host
      .querySelector("[data-text-file-editor]")
      ?.getAttribute("data-text-file-editor")
  ).toBe(newPath)
  expect(surface.mock.lastCall![0].documentKey).toBe(identity)
  expect(surface.mock.lastCall![0].content).toBe("# newtitle\nStill typing")
  expect(
    host.querySelector('.file-titlebar [data-save-path="newtitle.md"]')
  ).not.toBeNull()
  expect(
    host
      .querySelector('[data-text-file-preview-state="text"]')
      ?.getAttribute("data-text-file-editor")
  ).toBe(newPath)
  expect(preview).toHaveBeenCalledTimes(1)
  expect(readNavigationHistory("s")).toEqual({
    ...before,
    location: { type: "file", path: newPath, openWith: "wysiwyg" },
  })
  await act(async () => {
    host
      .querySelector("[data-text-file-editor]")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true })
      )
  })
  expect(save).toHaveBeenLastCalledWith({
    relativePath: newPath,
    content: "# newtitle\nStill typing",
    expectedRevision: "two",
  })
  await act(async () =>
    complete({
      status: "saved",
      file: {
        ...initial,
        relativePath: newPath,
        content: "# newtitle\nStill typing",
        revision: "three",
      },
    })
  )
  expect(host.textContent).not.toContain("no longer available")
  expect(preview).toHaveBeenCalledTimes(1)
})

it("keeps a newer navigation when an earlier save finishes with a hook rename", async () => {
  let complete!: (result: unknown) => void
  const other = {
    ...initial,
    relativePath: "other.md",
    content: "# Other",
    revision: "other",
  }
  const preview = vi.fn(async (path: string) =>
    path === "other.md" ? other : initial
  )
  const save = vi.fn(
    () =>
      new Promise((resolve) => {
        complete = resolve
      })
  )
  installHost({ previewTextFile: preview, saveTextFile: save })
  await act(async () => root!.render(<App />))
  await vi.waitFor(() =>
    expect(surface.mock.lastCall?.[0].content).toBe("# Old")
  )
  await act(async () => surface.mock.lastCall![0].onChange("# newtitle"))
  await act(async () => {
    host
      .querySelector("[data-text-file-editor]")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true })
      )
  })
  await act(async () => navigateCurrentWindow("other.md"))
  await vi.waitFor(() =>
    expect(surface.mock.lastCall?.[0].content).toBe("# Other")
  )
  const navigation = readNavigationHistory("s")
  await act(async () =>
    complete({
      status: "saved",
      file: {
        ...initial,
        relativePath: newPath,
        content: "# newtitle",
        revision: "two",
      },
    })
  )
  expect(readNavigationHistory("s")).toEqual(navigation)
  expect(
    host
      .querySelector("[data-text-file-editor]")
      ?.getAttribute("data-text-file-editor")
  ).toBe("other.md")
  expect(surface.mock.lastCall![0].content).toBe("# Other")
  expect(preview).toHaveBeenCalledTimes(2)
  expect(host.textContent).not.toContain("no longer available")
})
