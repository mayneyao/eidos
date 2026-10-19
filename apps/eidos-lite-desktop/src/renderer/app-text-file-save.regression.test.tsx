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

it.each(["root", "folder", "restore"])(
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
      if (mode === "root") {
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
          "Manage files",
          "New File",
          "New folder",
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
    ).toBe(mode === "root" ? "" : "business")
    expect(open).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledWith(mode === "root" ? null : "business")
    expect(plugins).not.toHaveBeenCalled()
    expect(host.textContent).not.toContain("Could not open")
    const breadcrumb = host.querySelector<HTMLElement>(
      'nav[aria-label="File management folder"]'
    )!
    expect(breadcrumb).not.toBeNull()
    expect(breadcrumb.closest(".file-titlebar")).not.toBeNull()
    expect(
      breadcrumb.querySelector('[aria-current="location"]')?.textContent
    ).toBe(mode === "root" ? staleSpace.name : "business")
    await act(async () =>
      breadcrumb.querySelector<HTMLButtonElement>("button")!.click()
    )
    expect(
      host
        .querySelector("[data-test-metadata-scope]")!
        .getAttribute("data-test-metadata-scope")
    ).toBe("")
    expect(open).toHaveBeenCalledOnce()
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
