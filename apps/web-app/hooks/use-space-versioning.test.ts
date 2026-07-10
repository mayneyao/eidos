// @vitest-environment jsdom

import { act, createElement, Fragment } from "react"
import { createRoot, type Root } from "react-dom/client"

import { registerPendingWriteFlusher } from "@/apps/web-app/components/file-space/pending-writes"

import {
  normalizeSpaceVersionDiff,
  normalizeSpaceVersionHistory,
  normalizeSpaceVersionStatus,
  useSpaceVersioning,
} from "./use-space-versioning"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

describe("file Space versioning normalization", () => {
  it("normalizes the Desktop status contract", () => {
    const status = normalizeSpaceVersionStatus({
      enabled: true,
      currentHead: "abcdef123456",
      currentBranch: "main",
      paths: [
        {
          path: "notes/today.md",
          state: "modified",
          kind: "text_file",
        },
        {
          path: "assets/cover.png",
          state: "untracked",
          kind: "binary_file",
        },
      ],
    })

    expect(status.enabled).toBe(true)
    expect(status.clean).toBe(false)
    expect(status.branch).toBe("main")
    expect(status.head?.id).toBe("abcdef123456")
    expect(status.changes).toEqual([
      { path: "notes/today.md", status: "modified" },
      { path: "assets/cover.png", status: "untracked" },
    ])
  })

  it("normalizes Graft history commits and millisecond timestamps", () => {
    const history = normalizeSpaceVersionHistory({
      commits: [
        {
          id: "commit-2",
          message: "Update today",
          timestampMs: 1_720_000_000_000,
          parents: ["commit-1"],
          changes: [
            {
              path: "notes/today.md",
              change: "modified",
              kind: "text_file",
            },
          ],
        },
      ],
      nextCursor: "commit-2",
    })

    expect(history.nextCursor).toBe("commit-2")
    expect(history.hasMore).toBe(true)
    expect(history.commits[0]).toMatchObject({
      id: "commit-2",
      message: "Update today",
      timestamp: 1_720_000_000_000,
      parents: ["commit-1"],
      changedPaths: [{ path: "notes/today.md", status: "modified" }],
    })
  })

  it("preserves only the path metadata returned by the Desktop diff contract", () => {
    const diff = normalizeSpaceVersionDiff({
      currentHead: "commit-2",
      currentBranch: "main",
      from: "commit-1",
      to: "commit-2",
      paths: [
        {
          path: "assets/cover.png",
          change: "modified",
          kind: "binary_file",
        },
      ],
    })

    expect(diff).toEqual({
      currentHead: "commit-2",
      currentBranch: "main",
      from: "commit-1",
      to: "commit-2",
      paths: [
        {
          path: "assets/cover.png",
          change: "modified",
          kind: "binary_file",
          storage: "unknown",
        },
      ],
    })
  })
})

type HookResult = ReturnType<typeof useSpaceVersioning>

const hookResults = new Map<string, HookResult>()

function VersioningProbe({
  name,
  loadHistory,
}: {
  name: string
  loadHistory: boolean
}) {
  hookResults.set(
    name,
    useSpaceVersioning("space-a", { loadHistory, historyLimit: 2 })
  )
  return null
}

function versionStatus() {
  return {
    enabled: true,
    currentHead: "commit-3",
    currentBranch: "main",
    paths: [],
  }
}

function commit(id: string, parent: string | null = null) {
  return {
    id,
    message: `Version ${id}`,
    timestampMs: 1_720_000_000_000,
    parents: parent ? [parent] : [],
    changes: [],
  }
}

interface RawHistoryPage {
  commits: ReturnType<typeof commit>[]
  nextCursor: string | null
  hasMore: boolean
}

function createBridge() {
  return {
    getStatus: vi.fn(async (_spaceId: string) => versionStatus()),
    enable: vi.fn(async (_spaceId: string) => versionStatus()),
    commit: vi.fn(async (_spaceId: string, _options: { message: string }) => ({
      commit: commit("commit-4", "commit-3"),
    })),
    getHistory: vi.fn(
      async (
        _spaceId: string,
        _options?: { limit?: number; cursor?: string }
      ): Promise<RawHistoryPage> => ({
        commits: [commit("commit-3")],
        nextCursor: null,
        hasMore: false,
      })
    ),
    getCommit: vi.fn(async (_spaceId: string, commitId: string) =>
      commit(commitId)
    ),
    getDiff: vi.fn(
      async (
        _spaceId: string,
        _request: { from: string; to?: string; path?: string }
      ) => ({
        currentHead: "commit-3",
        currentBranch: "main",
        from: "commit-2",
        to: "commit-3",
        paths: [],
      })
    ),
  }
}

function installBridge(bridge: ReturnType<typeof createBridge>) {
  Object.defineProperty(window, "eidos", {
    configurable: true,
    value: { spaceVersioning: bridge },
  })
}

async function flushEffects() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("useSpaceVersioning history coordination", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    hookResults.clear()
    container = document.createElement("div")
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    Reflect.deleteProperty(window, "eidos")
  })

  it("synchronizes status and loaded history across hook instances", async () => {
    const bridge = createBridge()
    installBridge(bridge)

    await act(async () => {
      root.render(
        createElement(
          Fragment,
          null,
          createElement(VersioningProbe, {
            key: "source",
            name: "source",
            loadHistory: false,
          }),
          createElement(VersioningProbe, {
            key: "history",
            name: "history",
            loadHistory: true,
          })
        )
      )
      await flushEffects()
    })

    bridge.getStatus.mockClear()
    bridge.getHistory.mockClear()
    await act(async () => {
      await hookResults.get("source")?.enable()
      await flushEffects()
    })
    expect(bridge.getStatus).toHaveBeenCalledTimes(2)
    expect(bridge.getHistory).toHaveBeenCalledTimes(1)

    bridge.getStatus.mockClear()
    bridge.getHistory.mockClear()
    await act(async () => {
      await hookResults.get("source")?.commit("Save the Space")
      await flushEffects()
    })
    expect(bridge.getStatus).toHaveBeenCalledTimes(2)
    expect(bridge.getHistory).toHaveBeenCalledTimes(1)
  })

  it("flushes current Space writes before creating a version", async () => {
    const bridge = createBridge()
    installBridge(bridge)
    const flush = vi.fn(async () => true)
    const unregister = registerPendingWriteFlusher("version-test", flush, {
      spaceId: "space-a",
      filePath: "notes/today.md",
    })

    await act(async () => {
      root.render(
        createElement(VersioningProbe, {
          name: "source",
          loadHistory: false,
        })
      )
      await flushEffects()
    })

    bridge.commit.mockClear()
    await act(async () => {
      await hookResults.get("source")?.commit("Save pending edits")
      await flushEffects()
    })

    expect(flush).toHaveBeenCalledOnce()
    expect(bridge.commit).toHaveBeenCalledOnce()
    expect(flush.mock.invocationCallOrder[0]).toBeLessThan(
      bridge.commit.mock.invocationCallOrder[0]
    )
    unregister()
  })

  it("does not create a version when a pending write fails", async () => {
    const bridge = createBridge()
    installBridge(bridge)
    const unregister = registerPendingWriteFlusher(
      "failed-version-test",
      async () => false,
      { spaceId: "space-a", filePath: "notes/today.md" }
    )

    await act(async () => {
      root.render(
        createElement(VersioningProbe, {
          name: "source",
          loadHistory: false,
        })
      )
      await flushEffects()
    })

    bridge.commit.mockClear()
    await expect(
      act(async () => {
        await hookResults.get("source")?.commit("Do not lose edits")
      })
    ).rejects.toThrow("could not save all pending file changes")
    expect(bridge.commit).not.toHaveBeenCalled()
    unregister()
  })

  it("loads cursor pages, deduplicates boundary commits, and resets on refresh", async () => {
    const bridge = createBridge()
    let firstPage: RawHistoryPage = {
      commits: [commit("commit-3", "commit-2"), commit("commit-2")],
      nextCursor: "cursor-1",
      hasMore: true,
    }
    bridge.getHistory.mockImplementation(async (_spaceId, options) => {
      if (options?.cursor === "cursor-1") {
        return {
          commits: [commit("commit-2"), commit("commit-1")],
          nextCursor: "cursor-1",
          hasMore: true,
        }
      }
      return firstPage
    })
    installBridge(bridge)

    await act(async () => {
      root.render(
        createElement(VersioningProbe, {
          name: "history",
          loadHistory: true,
        })
      )
      await flushEffects()
    })
    expect(hookResults.get("history")?.historyHasMore).toBe(true)
    expect(hookResults.get("history")?.historyNextCursor).toBe("cursor-1")

    await act(async () => {
      await hookResults.get("history")?.loadMoreHistory()
    })
    expect(hookResults.get("history")?.history.map(({ id }) => id)).toEqual([
      "commit-3",
      "commit-2",
      "commit-1",
    ])
    expect(hookResults.get("history")?.historyHasMore).toBe(false)
    expect(hookResults.get("history")?.historyLoadingMore).toBe(false)

    firstPage = {
      commits: [commit("commit-4", "commit-3")],
      nextCursor: null,
      hasMore: false,
    }
    await act(async () => {
      await hookResults.get("history")?.refreshHistory()
    })
    expect(hookResults.get("history")?.history.map(({ id }) => id)).toEqual([
      "commit-4",
    ])
    expect(bridge.getHistory).toHaveBeenLastCalledWith("space-a", { limit: 2 })
  })

  it("ignores a stale load-more page after history is refreshed", async () => {
    const bridge = createBridge()
    let firstPage: RawHistoryPage = {
      commits: [commit("commit-3")],
      nextCursor: "cursor-1",
      hasMore: true,
    }
    let resolveOlderPage: ((value: RawHistoryPage) => void) | undefined
    bridge.getHistory.mockImplementation((_spaceId, options) => {
      if (options?.cursor === "cursor-1") {
        return new Promise((resolve) => {
          resolveOlderPage = resolve
        })
      }
      return Promise.resolve(firstPage)
    })
    installBridge(bridge)

    await act(async () => {
      root.render(
        createElement(VersioningProbe, {
          name: "history",
          loadHistory: true,
        })
      )
      await flushEffects()
    })

    let olderPagePromise: Promise<unknown> | undefined
    await act(async () => {
      olderPagePromise = hookResults.get("history")?.loadMoreHistory()
      await Promise.resolve()
    })

    firstPage = {
      commits: [commit("commit-4")],
      nextCursor: null,
      hasMore: false,
    }
    await act(async () => {
      await hookResults.get("history")?.refreshHistory()
    })
    await act(async () => {
      resolveOlderPage?.({
        commits: [commit("commit-2")],
        nextCursor: null,
        hasMore: false,
      })
      await olderPagePromise
    })

    expect(hookResults.get("history")?.history.map(({ id }) => id)).toEqual([
      "commit-4",
    ])
    expect(hookResults.get("history")?.historyLoadingMore).toBe(false)
  })
})
