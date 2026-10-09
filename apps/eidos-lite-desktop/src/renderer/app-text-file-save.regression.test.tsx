// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type {
  EidosLiteApi,
  SpaceSnapshot,
  TextFilePreviewResult,
} from "../shared/contracts"
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
vi.mock("./space-file-tree", () => ({ SpaceFileTree: () => null }))

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
    expectedVersion: "0.3.30",
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
