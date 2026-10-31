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
vi.mock("./space-file-tree", () => ({
  SpaceFileTree: ({
    onContextMenu,
  }: {
    onContextMenu(entry: SpaceTreeEntry, x: number, y: number): void
  }) => (
    <button
      data-test-folder-menu
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
  ),
}))
vi.mock("./eidos-file-workbench", () => ({
  EidosFileWorkbench: ({
    metadataDirectory,
  }: {
    metadataDirectory?: string
  }) => <div data-test-metadata-scope={metadataDirectory}>Managed files</div>,
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
    listPlugins: async () => ({ plugins: [], space: { id: "s" } }),
    listRecentSpaces: async () => [],
    listPublicationBindings: async () => [],
    getAccountStatus: async () => ({ signedIn: false }),
    getUpdateStatus: async () => ({ state: "idle" }),
    getSyncQueueStatus: async () => null,
    getSyncMergeStatus: async () => ({ ok: true, value: { state: "none" } }),
    takeLaunchEidosFile: async () => null,
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
    installHost({
      openFileMetadata: open,
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
          "New File",
          "New folder",
          "Show this folder",
          "Manage files",
          "Rename",
          "Reveal in Finder",
          "Copy Relative Path",
          "Copy Path",
          "Move to Trash",
        ])
        expect(
          host.querySelectorAll('.space-context-menu > [role="separator"]')
        ).toHaveLength(3)
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
