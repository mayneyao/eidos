import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import type { GraftSpaceStatus, SpaceSnapshot } from "../../shared/contracts"
import { flattenSpaceTree } from "./space-paths"
import { SpaceSession } from "./space-session"

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

describe("SpaceSession Graft-backed snapshots", () => {
  it("returns the authoritative checkpoint status when a watcher invalidates the cache during tree refresh", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-authoritative-checkpoint-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-authoritative-checkpoint-state-")
    )
    let delayFirstIgnoreInspection = true
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: () => "0.3.0",
      close: async () => undefined,
      inspectSpace: async () => ({
        available: true,
        backend: "sdk",
        version: "0.3.0",
        expectedVersion: "0.3.0",
        initialized: true,
        clean: true,
      }),
      inspectIgnores: async (_root: string, relativePaths: string[]) => {
        if (delayFirstIgnoreInspection) {
          delayFirstIgnoreInspection = false
          await fs.writeFile(path.join(root, "watcher-change.txt"), "changed")
          await new Promise((resolve) => setTimeout(resolve, 250))
        }
        return relativePaths.map((relativePath) => ({
          path: relativePath,
          isIgnored: false,
          isTracked: true,
          isDirectory: false,
          hasTrackedDescendants: false,
        }))
      },
    } as unknown as GraftClient
    let session: SpaceSession | null = null

    try {
      await fs.mkdir(path.join(root, ".graft"))
      await fs.writeFile(path.join(root, "notes.txt"), "visible")
      session = await SpaceSession.create(root, userData, { graft })

      const snapshot = await session.enableVersioning()

      expect(snapshot.graft).toMatchObject({
        initialized: true,
        clean: true,
      })
      expect(snapshot.graft.checking).not.toBe(true)
    } finally {
      await session?.close().catch(() => undefined)
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(userData, { recursive: true, force: true }),
      ])
    }
  })

  it("does not let watcher ignore filtering cancel an authoritative status read", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-authoritative-status-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-authoritative-status-state-")
    )
    const cleanStatus: GraftSpaceStatus = {
      available: true,
      backend: "sdk",
      version: "0.3.0",
      expectedVersion: "0.3.0",
      initialized: true,
      clean: true,
    }
    let statusCalls = 0
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: () => "0.3.0",
      close: async () => undefined,
      inspectSpace: (_root: string, options: { signal?: AbortSignal } = {}) => {
        statusCalls += 1
        if (statusCalls === 1) return Promise.resolve(cleanStatus)
        return new Promise<GraftSpaceStatus>((resolve) => {
          const timer = setTimeout(() => resolve(cleanStatus), 350)
          options.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer)
              resolve({ ...cleanStatus, clean: undefined, error: "cancelled" })
            },
            { once: true }
          )
        })
      },
      inspectIgnores: async (_root: string, relativePaths: string[]) =>
        relativePaths.map((relativePath) => ({
          path: relativePath,
          isIgnored: false,
          isTracked: false,
          isDirectory: false,
          hasTrackedDescendants: false,
        })),
    } as unknown as GraftClient
    let session: SpaceSession | null = null

    try {
      await fs.mkdir(path.join(root, ".graft"))
      session = await SpaceSession.create(root, userData, { graft })
      await fs.writeFile(path.join(root, "watcher-change.txt"), "changed")

      const snapshot = await session.enableVersioning()

      expect(snapshot.graft).toMatchObject({ clean: true })
      expect(snapshot.graft.error).toBeUndefined()
    } finally {
      await session?.close().catch(() => undefined)
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(userData, { recursive: true, force: true }),
      ])
    }
  })

  it("refreshes authoritative version status after an external file write", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-external-version-refresh-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-external-version-refresh-state-")
    )
    const client = new GraftClient({
      sdkTransport: new GraftInProcessTransport(),
    })
    const notesPath = path.join(root, "notes.md")
    let session: SpaceSession | null = null

    try {
      await fs.writeFile(notesPath, "base\n")
      await client.open(root)
      await client.initialize(root)
      await client.stageAll(root)
      await client.commit(root, "Base Space")
      session = await SpaceSession.create(root, userData, { graft: client })
      await expect(session.refresh()).resolves.toMatchObject({
        graft: { clean: true },
      })

      let sawChecking = false
      let unsubscribe: () => void = () => undefined
      const settled = new Promise<SpaceSnapshot>((resolve, reject) => {
        const timer = setTimeout(() => {
          unsubscribe()
          reject(new Error("External change status did not settle"))
        }, 2_000)
        unsubscribe = session!.onChanged((snapshot) => {
          if (snapshot.graft.checking) sawChecking = true
          if (sawChecking && snapshot.graft.clean === false) {
            clearTimeout(timer)
            unsubscribe()
            resolve(snapshot)
          }
        })
      })

      await fs.writeFile(notesPath, "changed by another editor\n")

      await expect(settled).resolves.toMatchObject({
        graft: { initialized: true, clean: false, changedPaths: 1 },
      })
    } finally {
      await session?.close().catch(() => undefined)
      if (!session) await client.close().catch(() => undefined)
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(userData, { recursive: true, force: true }),
      ])
    }
  }, 15_000)

  it("reschedules external status after an open History read preempts it", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-history-status-preemption-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-history-status-preemption-state-")
    )
    const cleanStatus: GraftSpaceStatus = {
      available: true,
      backend: "sdk",
      version: "0.3.0",
      expectedVersion: "0.3.0",
      initialized: true,
      clean: true,
      currentHead: "a".repeat(64),
      changedPaths: 0,
    }
    const dirtyStatus: GraftSpaceStatus = {
      ...cleanStatus,
      clean: false,
      changedPaths: 1,
    }
    let statusCalls = 0
    let historyCalls = 0
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: () => "0.3.0",
      close: async () => undefined,
      inspectSpace: (_root: string, options: { signal?: AbortSignal } = {}) => {
        statusCalls += 1
        if (statusCalls === 1) return Promise.resolve(cleanStatus)
        return new Promise<GraftSpaceStatus>((resolve, reject) => {
          const timer = setTimeout(() => resolve(dirtyStatus), 50)
          options.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer)
              reject(new DOMException("Cancelled", "AbortError"))
            },
            { once: true }
          )
        })
      },
      history: async () => {
        historyCalls += 1
        return {
          currentHead: cleanStatus.currentHead,
          currentBranch: "main",
          commits: [],
          hasMore: false,
          nextCursor: null,
        }
      },
      stageAll: async () => undefined,
      commit: async () => ({ id: "b".repeat(64) }),
      inspectIgnores: async (_root: string, relativePaths: string[]) =>
        relativePaths.map((relativePath) => ({
          path: relativePath,
          isIgnored: false,
          isTracked: true,
          isDirectory: false,
          hasTrackedDescendants: false,
        })),
    } as unknown as GraftClient
    const notesPath = path.join(root, "notes.md")
    let session: SpaceSession | null = null

    try {
      await fs.mkdir(path.join(root, ".graft"))
      await fs.writeFile(notesPath, "base\n")
      session = await SpaceSession.create(root, userData, { graft })
      await expect(session.refresh()).resolves.toMatchObject({
        graft: { clean: true },
      })

      let historyReadStarted = false
      let unsubscribe: () => void = () => undefined
      const settled = new Promise<SpaceSnapshot>((resolve, reject) => {
        const timer = setTimeout(() => {
          unsubscribe()
          reject(new Error("Preempted external status did not resume"))
        }, 1_000)
        unsubscribe = session!.onChanged((snapshot) => {
          if (snapshot.graft.checking && !historyReadStarted) {
            historyReadStarted = true
            void session!.getVersionHistory().catch(() => undefined)
          }
          if (historyReadStarted && snapshot.graft.clean === false) {
            clearTimeout(timer)
            unsubscribe()
            resolve(snapshot)
          }
        })
      })

      await fs.writeFile(notesPath, "changed by another editor\n")

      await expect(settled).resolves.toMatchObject({
        graft: { clean: false, changedPaths: 1 },
      })
      expect(historyCalls).toBe(1)
      expect(statusCalls).toBeGreaterThanOrEqual(2)
    } finally {
      await session?.close().catch(() => undefined)
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(userData, { recursive: true, force: true }),
      ])
    }
  }, 15_000)

  it("prunes ignored untracked trees while keeping tracked descendants visible", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-space-ignore-session-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-space-ignore-state-")
    )
    const graft = new GraftClient({
      sdkTransport: new GraftInProcessTransport(),
    })
    let session: SpaceSession | null = null

    try {
      await fs.mkdir(path.join(root, "generated"))
      await fs.writeFile(path.join(root, "generated", "tracked.txt"), "kept\n")
      await graft.open(root)
      await graft.initialize(root)
      await graft.stageAll(root)
      await graft.commit(root, "Track generated output")

      await fs.mkdir(path.join(root, "node_modules", "package"), {
        recursive: true,
      })
      await fs.writeFile(
        path.join(root, "node_modules", "package", "index.js"),
        "ignored\n"
      )
      await fs.writeFile(
        path.join(root, ".gitignore"),
        "node_modules/\ngenerated/\n"
      )
      await graft.stageAll(root)
      await graft.commit(root, "Add ignore rules")

      session = await SpaceSession.create(root, userData, { graft })
      const initial = await session.snapshot()
      expect(
        flattenSpaceTree(initial.entries).map((entry) => entry.relativePath)
      ).toEqual(["generated", ".gitignore"])
      const snapshot = await session.loadDirectory("generated")
      const visible = flattenSpaceTree(snapshot.entries).map(
        (entry) => entry.relativePath
      )

      expect(visible).toContain("generated")
      expect(visible).toContain("generated/tracked.txt")
      expect(visible).not.toContain("node_modules")
      expect(
        visible.some((relativePath) => relativePath.startsWith("node_modules/"))
      ).toBe(false)

      const preflight = await session.syncPreflight()
      expect(preflight.excluded).toContainEqual({
        relativePath: "node_modules",
        reason: "graft-ignore",
      })
      expect(preflight.fileCount).toBe(2)

      const sourcePath = path.join(userData, "local-change.txt")
      await fs.writeFile(sourcePath, "changed\n")
      const statusUpdated = new Promise<SpaceSnapshot>((resolve) => {
        const unsubscribe = session!.onChanged((nextSnapshot) => {
          if (nextSnapshot.graft.clean === false) {
            unsubscribe()
            resolve(nextSnapshot)
          }
        })
      })
      const changed = await session.importFiles([sourcePath], null)
      expect(changed.snapshot.graft.checking).toBe(true)
      expect((await statusUpdated).graft.clean).toBe(false)
    } finally {
      await session?.close().catch(() => undefined)
      if (!session) await graft.close().catch(() => undefined)
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(userData, { recursive: true, force: true }),
      ])
    }
  }, 30_000)

  it("returns the initial file tree before a cold Graft status scan finishes", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-space-cold-status-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-space-cold-status-state-")
    )
    const status = deferred<GraftSpaceStatus>()
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: () => "0.3.0",
      open: async () => undefined,
      close: async () => undefined,
      inspectSpace: () => status.promise,
    } as unknown as GraftClient
    let session: SpaceSession | null = null

    try {
      await fs.writeFile(path.join(root, "notes.txt"), "visible")
      await fs.mkdir(path.join(root, "large"))
      await Promise.all(
        Array.from({ length: 2_000 }, (_, index) =>
          fs.writeFile(path.join(root, "large", `item-${index}.txt`), "x")
        )
      )
      session = await SpaceSession.create(root, userData, { graft })
      let finishUpdate: (snapshot: SpaceSnapshot) => void = () => undefined
      const updated = new Promise<SpaceSnapshot>((resolve) => {
        finishUpdate = resolve
      })
      session.onChanged((snapshot) => {
        if (!snapshot.graft.checking) finishUpdate(snapshot)
      })

      const startedAt = performance.now()
      const initial = await session.snapshot()
      expect(performance.now() - startedAt).toBeLessThan(500)
      expect(initial.entries.map((entry) => entry.relativePath)).toEqual([
        "large",
        "notes.txt",
      ])
      expect(initial.entries[0]).toMatchObject({
        children: [],
        childrenLoaded: false,
      })
      expect(initial.graft).toMatchObject({
        initialized: false,
        checking: true,
      })

      status.resolve({
        available: true,
        backend: "sdk",
        version: "0.3.0",
        expectedVersion: "0.3.0",
        initialized: false,
      })
      const final = await updated
      expect(final.graft.initialized).toBe(false)
      expect(final.graft.checking).not.toBe(true)

      const loaded = await session.loadDirectory("large")
      expect(loaded.entries[0]?.children).toHaveLength(2_000)
      expect(loaded.entries[0]?.childrenLoaded).toBe(true)
      const refreshed = await session.refresh()
      expect(refreshed.entries[0]?.children).toHaveLength(2_000)
      expect(refreshed.entries[0]?.childrenLoaded).toBe(true)
    } finally {
      await session?.close().catch(() => undefined)
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(userData, { recursive: true, force: true }),
      ])
    }
  })

  it("keeps lazy filesystem browsing available when background Graft status fails", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-space-status-error-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-space-status-error-state-")
    )
    const status = deferred<GraftSpaceStatus>()
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: () => "0.3.0",
      open: async () => undefined,
      close: async () => undefined,
      inspectSpace: () => status.promise,
      inspectIgnores: async (_root: string, relativePaths: string[]) =>
        relativePaths.map((relativePath) => ({
          path: relativePath,
          isIgnored: false,
          isTracked: false,
          isDirectory: false,
          hasTrackedDescendants: false,
        })),
    } as unknown as GraftClient
    let session: SpaceSession | null = null

    try {
      await fs.mkdir(path.join(root, ".graft"))
      await fs.mkdir(path.join(root, "project"))
      await fs.writeFile(path.join(root, "project", "notes.txt"), "visible")
      session = await SpaceSession.create(root, userData, { graft })
      const failedStatus = new Promise<SpaceSnapshot>((resolve) => {
        const unsubscribe = session!.onChanged((snapshot) => {
          if (snapshot.graft.error) {
            unsubscribe()
            resolve(snapshot)
          }
        })
      })

      const initial = await session.snapshot()
      expect(initial.graft.checking).toBe(true)
      status.resolve({
        available: true,
        backend: "sdk",
        version: "0.3.0",
        expectedVersion: "0.3.0",
        initialized: true,
        error: "Tracked path is now a directory",
      })
      await expect(failedStatus).resolves.toMatchObject({
        graft: { error: "Tracked path is now a directory" },
      })

      const loaded = await session.loadDirectory("project")
      expect(
        flattenSpaceTree(loaded.entries).map((entry) => entry.relativePath)
      ).toContain("project/notes.txt")
    } finally {
      await session?.close().catch(() => undefined)
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(userData, { recursive: true, force: true }),
      ])
    }
  })

  it("cancels an in-flight background status before closing the Space", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-space-status-close-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-space-status-close-state-")
    )
    let statusStarted: () => void = () => undefined
    const started = new Promise<void>((resolve) => {
      statusStarted = resolve
    })
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: () => "0.3.0",
      close: vi.fn(async () => undefined),
      inspectSpace: (_root: string, options: { signal?: AbortSignal }) => {
        statusStarted()
        return new Promise<GraftSpaceStatus>((_resolve, reject) => {
          options.signal?.addEventListener(
            "abort",
            () => {
              const error = new Error("Cancelled background status")
              error.name = "AbortError"
              reject(error)
            },
            { once: true }
          )
        })
      },
    } as unknown as GraftClient
    let session: SpaceSession | null = null

    try {
      await fs.writeFile(path.join(root, "notes.txt"), "visible")
      session = await SpaceSession.create(root, userData, { graft })
      await session.snapshot()
      await started

      await expect(session.close()).resolves.toBeUndefined()
      expect(graft.close).toHaveBeenCalledOnce()
      session = null
    } finally {
      await session?.close().catch(() => undefined)
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(userData, { recursive: true, force: true }),
      ])
    }
  })

  it("does not expose a partially initialized repository before the first checkpoint finishes", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-space-partial-versioning-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-space-partial-versioning-state-")
    )
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: () => "0.3.0",
      open: async () => undefined,
      close: async () => undefined,
      inspectSpace: async () => ({
        available: true,
        backend: "sdk",
        version: "0.3.0",
        expectedVersion: "0.3.0",
        initialized: true,
        clean: false,
      }),
    } as unknown as GraftClient
    let session: SpaceSession | null = null

    try {
      session = await SpaceSession.create(root, userData, { graft })
      const snapshot = await session.snapshot()

      expect(snapshot.graft).toMatchObject({
        initialized: false,
      })
    } finally {
      await session?.close().catch(() => undefined)
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(userData, { recursive: true, force: true }),
      ])
    }
  })
})
