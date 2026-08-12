import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { createEidosFileUuid } from "@eidos.space/eidos-file"
import { createEidosFile } from "@eidos.space/eidos-file/node-sqlite"

import { GraftClient } from "../graft/graft-client"
import { EIDOS_LITE_PERFORMANCE_BUDGET_MS } from "../../shared/performance-contract"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import type {
  GraftSpaceStatus,
  SpaceSnapshot,
  SpaceVersionDiff,
} from "../../shared/contracts"
import { canonicalizeSpaceRoot, flattenSpaceTree } from "./space-paths"
import { SpaceSession } from "./space-session"
import { SpaceSyncStateStore } from "./sync-state"

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

describe("SpaceSession Graft-backed snapshots", () => {
  it("normalizes business row values through stable Eidos Field identities", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-field-diff-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-field-diff-state-")
    )
    const filePath = path.join(root, "space.eidos")
    const database = new DatabaseSync(filePath)
    database.exec(`
      CREATE TABLE eidos__tables(id TEXT PRIMARY KEY, physical_name TEXT NOT NULL);
      CREATE TABLE eidos__fields(
        id TEXT PRIMARY KEY,
        table_id TEXT NOT NULL,
        physical_name TEXT,
        position INTEGER NOT NULL
      );
      INSERT INTO eidos__tables VALUES ('table-ux', 'ux');
      INSERT INTO eidos__fields VALUES ('field-id', 'table-ux', '_id', -3);
      INSERT INTO eidos__fields VALUES ('field-screenshot', 'table-ux', '截图', 5);
      INSERT INTO eidos__fields VALUES ('field-done', 'table-ux', 'done', 6);
    `)
    database.close()
    await fs.mkdir(path.join(root, ".graft"))

    const diffWithTable = (
      table: SpaceVersionDiff["files"][number]["tables"][number]
    ): SpaceVersionDiff => ({
      currentHead: "a".repeat(64),
      currentBranch: "main",
      from: "index",
      to: null,
      paths: [{ path: "space.eidos", change: "modified" }],
      files: [
        {
          path: "space.eidos",
          change: "modified",
          rowDiffAvailable: true,
          limitations: [],
          tables: [table],
        },
      ],
    })
    const sqlitePathDiff = vi.fn(
      async (
        _root: string,
        _relativePath: string,
        options: { table?: string }
      ) =>
        options.table === "eidos__fields"
          ? diffWithTable({
              name: "eidos__fields",
              columns: ["id", "table_id", "physical_name", "position"],
              primaryKeyColumns: ["id"],
              changes: [
                {
                  op: "delete",
                  key: { id: "field-status" },
                  values: ["field-status", "table-ux", "状态", 4],
                },
                {
                  op: "insert",
                  key: { id: "field-done" },
                  values: ["field-done", "table-ux", "done", 6],
                },
              ],
            })
          : diffWithTable({
              name: "ux",
              columns: ["_id", "截图", "done"],
              primaryKeyColumns: ["_id"],
              changes: [
                {
                  op: "update",
                  key: { _id: "row-1" },
                  oldValues: ["row-1", "待处理", "[]"],
                  values: ["row-1", "[]", 1],
                },
              ],
            })
    )
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: () => "0.3.8",
      close: async () => undefined,
      sqlitePathDiff,
    } as unknown as GraftClient
    let session: SpaceSession | null = null

    try {
      session = await SpaceSession.create(root, userData, { graft })
      const result = await session.getVersionPathDiff(
        "space.eidos",
        null,
        null,
        "ux"
      )
      const table = result.files[0]!.tables[0]!

      expect(table.columns).toEqual(["_id", "状态", "截图", "done"])
      expect(table.changes[0]).toMatchObject({
        oldValues: ["row-1", "待处理", "[]", undefined],
        values: ["row-1", undefined, "[]", 1],
      })
      expect(sqlitePathDiff).toHaveBeenCalledTimes(2)
    } finally {
      await session?.close().catch(() => undefined)
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(userData, { recursive: true, force: true }),
      ])
    }
  })

  it("expands a folder discard to changed files and rejects a stale view", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-discard-folder-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-discard-folder-state-")
    )
    const expectedHead = "c".repeat(64)
    let discarded = false
    const restorePaths = vi.fn(async () => {
      discarded = true
    })
    const recordPathMove = vi.fn(async () => undefined)
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: () => "0.3.8",
      close: async () => undefined,
      inspectSpace: async () => ({
        available: true,
        backend: "sdk",
        version: "0.3.8",
        expectedVersion: "0.3.8",
        initialized: true,
        clean: discarded,
        changedPaths: discarded ? 0 : 4,
        currentHead: expectedHead,
        changeToken: discarded ? "clean-token" : "dirty-token",
      }),
      status: vi.fn(async () => ({
        dirty: !discarded,
        currentHead: expectedHead,
        currentBranch: "main",
        paths: discarded
          ? []
          : [
              "docs/added.txt",
              "docs/edited.txt",
              "docs/new.txt",
              "outside.txt",
            ],
        changes: discarded
          ? []
          : [
              { path: "docs/added.txt", change: "untracked" },
              { path: "docs/edited.txt", change: "modified" },
              {
                path: "docs/new.txt",
                previousPath: "docs/old.txt",
                change: "renamed",
              },
              { path: "outside.txt", change: "modified" },
            ],
        changedPaths: discarded ? 0 : 4,
        changeToken: discarded ? "clean-token" : "dirty-token",
      })),
      inspectIgnores: async (_root: string, relativePaths: string[]) =>
        relativePaths.map((relativePath) => ({
          path: relativePath,
          isIgnored: false,
          isTracked: true,
          isDirectory: relativePath === "docs",
          hasTrackedDescendants: relativePath === "docs",
        })),
      operationMaterializesWorktree: vi.fn(async () => true),
      restorePaths,
      recordPathMove,
    } as unknown as GraftClient
    let session: SpaceSession | null = null

    try {
      await fs.mkdir(path.join(root, ".graft"))
      await fs.mkdir(path.join(root, "docs"))
      await fs.writeFile(path.join(root, "docs", "added.txt"), "new\n")
      session = await SpaceSession.create(root, userData, { graft })

      await expect(
        session.discardWorkingChanges({
          target: { kind: "folder", path: "docs" },
          expectedHead,
          expectedChangeToken: "stale-token",
        })
      ).rejects.toThrow(/changed before discard started/i)
      expect(restorePaths).not.toHaveBeenCalled()
      expect(session.gate.current().phase).toBe("ready")

      await expect(
        session.discardWorkingChanges({
          target: { kind: "folder", path: "docs" },
          expectedHead,
          expectedChangeToken: "dirty-token",
        })
      ).resolves.toMatchObject({
        paths: [
          "docs/added.txt",
          "docs/edited.txt",
          "docs/new.txt",
          "docs/old.txt",
        ],
        snapshot: { graft: { clean: true } },
      })
      expect(restorePaths).toHaveBeenCalledWith(
        await fs.realpath(root),
        expectedHead,
        expectedHead,
        ["docs/edited.txt", "docs/new.txt", "docs/old.txt"],
        { requireClean: false }
      )
      expect(recordPathMove).toHaveBeenCalledWith(
        await fs.realpath(root),
        "docs/new.txt",
        "docs/old.txt"
      )
      await expect(
        fs.stat(path.join(root, "docs", "added.txt"))
      ).rejects.toMatchObject({ code: "ENOENT" })
    } finally {
      await session?.close().catch(() => undefined)
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(userData, { recursive: true, force: true }),
      ])
    }
  })

  it("plans checkpoint restore from commit metadata without loading row diffs", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-restore-plan-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-restore-plan-state-")
    )
    const commitId = "a".repeat(64)
    const expectedHead = "c".repeat(64)
    const materializationPathsBetweenRevisions = vi.fn(async () => [
      "data.eidos",
      "removed.txt",
    ])
    const compareRevisions = vi.fn(async () => {
      throw new Error("Restore must not load row diffs")
    })
    const restorePaths = vi.fn(async () => undefined)
    const stageAll = vi.fn(async () => undefined)
    const commit = vi.fn(async () => ({ id: "d".repeat(64) }))
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: () => "0.3.8",
      close: async () => undefined,
      inspectSpace: async () => ({
        available: true,
        backend: "sdk",
        version: "0.3.8",
        expectedVersion: "0.3.8",
        initialized: true,
        clean: true,
        currentHead: expectedHead,
      }),
      status: vi.fn(async () => ({
        initialized: true,
        dirty: false,
        currentHead: expectedHead,
        paths: [],
        changes: [],
      })),
      materializationPathsBetweenRevisions,
      compareRevisions,
      operationMaterializesWorktree: vi.fn(async () => true),
      restorePaths,
      stageAll,
      commit,
    } as unknown as GraftClient
    let session: SpaceSession | null = null

    try {
      await fs.mkdir(path.join(root, ".graft"))
      session = await SpaceSession.create(root, userData, { graft })

      await expect(
        session.restoreCheckpoint(commitId, expectedHead)
      ).resolves.toMatchObject({ graft: { initialized: true, clean: true } })
      expect(materializationPathsBetweenRevisions).toHaveBeenCalledWith(
        await fs.realpath(root),
        commitId,
        expectedHead
      )
      expect(compareRevisions).not.toHaveBeenCalled()
      expect(restorePaths).toHaveBeenCalledWith(
        await fs.realpath(root),
        commitId,
        expectedHead,
        ["data.eidos", "removed.txt"]
      )
      expect(stageAll).toHaveBeenCalledOnce()
      expect(commit).toHaveBeenCalledOnce()
    } finally {
      await session?.close().catch(() => undefined)
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(userData, { recursive: true, force: true }),
      ])
    }
  })

  it("keeps a local rename responsive while Graft records the move identity", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-record-path-move-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-record-path-move-state-")
    )
    const recordStarted = deferred<void>()
    const finishRecord = deferred<void>()
    const recordPathMove = vi.fn(async () => {
      recordStarted.resolve()
      await finishRecord.promise
    })
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: () => "0.3.8",
      close: async () => undefined,
      inspectSpace: async () => ({
        available: true,
        backend: "sdk",
        version: "0.3.8",
        expectedVersion: "0.3.8",
        initialized: true,
        clean: false,
      }),
      inspectIgnores: async (_root: string, relativePaths: string[]) =>
        relativePaths.map((relativePath) => ({
          path: relativePath,
          isIgnored: false,
          isTracked: true,
          isDirectory: false,
          hasTrackedDescendants: false,
        })),
      recordPathMove,
    } as unknown as GraftClient
    let session: SpaceSession | null = null

    try {
      await fs.mkdir(path.join(root, ".graft"))
      await fs.writeFile(path.join(root, "old.txt"), "local content")
      session = await SpaceSession.create(root, userData, { graft })

      const renamed = await session.renamePath("old.txt", "new.txt")
      expect(renamed.relativePath).toBe("new.txt")
      await expect(
        fs.readFile(path.join(root, "new.txt"), "utf8")
      ).resolves.toBe("local content")
      await recordStarted.promise
      const canonicalRoot = await fs.realpath(root)
      expect(recordPathMove).toHaveBeenCalledWith(
        canonicalRoot,
        "old.txt",
        "new.txt",
        expect.objectContaining({ signal: expect.anything() })
      )
    } finally {
      finishRecord.resolve()
      await session?.close().catch(() => undefined)
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(userData, { recursive: true, force: true }),
      ])
    }
  })

  it("exposes the cached cloud boundary only for a trusted connected Space", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-sync-history-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-sync-history-state-")
    )
    const remoteOrigin = "https://sync-staging.eidos.space"
    const remoteUrl = `${remoteOrigin}/u-alice/project`
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: remoteOrigin,
      expectedVersion: () => "0.3.8",
      close: async () => undefined,
      inspectSpace: async () => ({
        available: true,
        backend: "sdk",
        version: "0.3.8",
        expectedVersion: "0.3.8",
        initialized: true,
        clean: true,
        currentHead: "local-head",
        sync: {
          state: "ahead",
          localHead: "local-head",
          remoteHead: "cloud-head",
          commonAncestor: "base-head",
          ahead: 2,
          behind: 0,
        },
      }),
    } as unknown as GraftClient
    let session: SpaceSession | null = null

    try {
      await fs.mkdir(path.join(root, ".graft"))
      const canonical = await canonicalizeSpaceRoot(root)
      await new SpaceSyncStateStore(
        path.join(userData, "spaces", canonical.id),
        remoteOrigin
      ).markClone(remoteUrl, new Date("2026-08-01T04:30:00.000Z"))

      session = await SpaceSession.createCanonical(canonical, userData, {
        graft,
      })

      await expect(session.refresh()).resolves.toMatchObject({
        graft: {
          sync: {
            state: "ahead",
            localHead: "local-head",
            remoteHead: "cloud-head",
            commonAncestor: "base-head",
            ahead: 2,
            behind: 0,
            checkedAtMs: new Date("2026-08-01T04:30:00.000Z").getTime(),
          },
        },
      })
    } finally {
      await session?.close().catch(() => undefined)
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(userData, { recursive: true, force: true }),
      ])
    }
  })

  it("does not let an automatic checkpoint quiesce a long local mutation", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-long-local-mutation-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-long-local-mutation-state-")
    )
    const stageAll = vi.fn(async () => undefined)
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: () => "0.3.8",
      close: async () => undefined,
      inspectSpace: async () => ({
        available: true,
        backend: "sdk",
        version: "0.3.8",
        expectedVersion: "0.3.8",
        initialized: true,
        clean: false,
      }),
      inspectIgnores: async (_root: string, relativePaths: string[]) =>
        relativePaths.map((relativePath) => ({
          path: relativePath,
          isIgnored: false,
          isTracked: true,
          isDirectory: false,
          hasTrackedDescendants: false,
        })),
      stageAll,
      commit: vi.fn(async () => ({ id: "b".repeat(64) })),
    } as unknown as GraftClient
    const mutation = deferred<void>()
    let session: SpaceSession | null = null

    try {
      await fs.mkdir(path.join(root, ".graft"))
      session = await SpaceSession.create(root, userData, {
        graft,
        automaticCheckpointsEnabled: true,
      })
      const runningMutation = session.gate.withMutation(() => mutation.promise)
      await fs.writeFile(path.join(root, "long-write.txt"), "changed")
      await new Promise((resolve) => setTimeout(resolve, 350))

      expect(session.gate.current().phase).toBe("ready")
      expect(stageAll).not.toHaveBeenCalled()

      mutation.resolve()
      await runningMutation
      session.setAutomaticCheckpointsEnabled(false)
    } finally {
      mutation.resolve()
      await session?.close().catch(() => undefined)
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(userData, { recursive: true, force: true }),
      ])
    }
  })

  it("keeps local mutations available while a manual checkpoint is created", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-nonblocking-checkpoint-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-nonblocking-checkpoint-state-")
    )
    const stageStarted = deferred<void>()
    const commitStarted = deferred<void>()
    const finishCommit = deferred<void>()
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: () => "0.3.8",
      close: async () => undefined,
      inspectSpace: async () => ({
        available: true,
        backend: "sdk",
        version: "0.3.8",
        expectedVersion: "0.3.8",
        initialized: true,
        clean: false,
      }),
      inspectIgnores: async (_root: string, relativePaths: string[]) =>
        relativePaths.map((relativePath) => ({
          path: relativePath,
          isIgnored: false,
          isTracked: true,
          isDirectory: false,
          hasTrackedDescendants: false,
        })),
      stageAll: vi.fn(async () => stageStarted.resolve()),
      commit: vi.fn(async () => {
        commitStarted.resolve()
        await finishCommit.promise
        return { id: "b".repeat(64) }
      }),
    } as unknown as GraftClient
    let session: SpaceSession | null = null

    try {
      await fs.mkdir(path.join(root, ".graft"))
      session = await SpaceSession.create(root, userData, { graft })
      const checkpoint = session.createCheckpoint("Nonblocking checkpoint")
      await stageStarted.promise
      await commitStarted.promise

      await expect(
        session.gate.withMutation(async () => "edited during checkpoint")
      ).resolves.toBe("edited during checkpoint")
      finishCommit.resolve()
      const snapshot = await checkpoint
      expect(snapshot).toMatchObject({
        operation: { phase: "ready" },
        graft: {
          currentHead: "b".repeat(64),
          checking: true,
        },
      })
      expect(snapshot.graft.clean).toBeUndefined()
    } finally {
      finishCommit.resolve()
      await session?.close().catch(() => undefined)
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(userData, { recursive: true, force: true }),
      ])
    }
  })

  it("returns a saved checkpoint before post-commit status reclassification", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-fast-checkpoint-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-fast-checkpoint-state-")
    )
    const backgroundStatus = deferred<GraftSpaceStatus>()
    const dirtyStatus: GraftSpaceStatus = {
      available: true,
      backend: "sdk",
      version: "0.3.8",
      expectedVersion: "0.3.8",
      initialized: true,
      clean: false,
      changedPaths: 1,
      currentHead: "a".repeat(64),
    }
    const inspectSpace = vi
      .fn()
      .mockResolvedValueOnce(dirtyStatus)
      .mockImplementation(() => backgroundStatus.promise)
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: () => "0.3.8",
      close: async () => undefined,
      inspectSpace,
      stageAll: vi.fn(async () => undefined),
      commit: vi.fn(async () => ({ id: "b".repeat(64) })),
      inspectIgnores: async (_root: string, relativePaths: string[]) =>
        relativePaths.map((relativePath) => ({
          path: relativePath,
          isIgnored: false,
          isTracked: true,
          isDirectory: false,
          hasTrackedDescendants: false,
        })),
    } as unknown as GraftClient
    let session: SpaceSession | null = null

    try {
      await fs.mkdir(path.join(root, ".graft"))
      session = await SpaceSession.create(root, userData, { graft })

      const result = await Promise.race([
        session.createCheckpoint("Fast checkpoint"),
        new Promise<"timeout">((resolve) =>
          setTimeout(
            () => resolve("timeout"),
            EIDOS_LITE_PERFORMANCE_BUDGET_MS.checkpointAcknowledgement
          )
        ),
      ])

      expect(result).not.toBe("timeout")
      if (result === "timeout") throw new Error("Checkpoint timed out")
      expect(result).toMatchObject({
        operation: { phase: "ready" },
        graft: {
          currentHead: "b".repeat(64),
          checking: true,
        },
      })
      expect(result.graft.clean).toBeUndefined()
      expect(graft.commit).toHaveBeenCalledOnce()
    } finally {
      backgroundStatus.resolve({
        ...dirtyStatus,
        clean: true,
        changedPaths: 0,
        currentHead: "b".repeat(64),
      })
      await session?.close().catch(() => undefined)
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(userData, { recursive: true, force: true }),
      ])
    }
  })

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
      expectedVersion: () => "0.3.1",
      close: async () => undefined,
      inspectSpace: async () => ({
        available: true,
        backend: "sdk",
        version: "0.3.1",
        expectedVersion: "0.3.1",
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
      version: "0.3.1",
      expectedVersion: "0.3.1",
      initialized: true,
      clean: true,
    }
    let statusCalls = 0
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: () => "0.3.1",
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

  it("lets a background status settle and follows local invalidation with one refresh", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-background-status-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-background-status-state-")
    )
    const statusStarted = deferred<void>()
    const finishStatus = deferred<GraftSpaceStatus>()
    let statusAborts = 0
    let statusCalls = 0
    const cleanStatus: GraftSpaceStatus = {
      available: true,
      backend: "sdk",
      version: "0.3.1",
      expectedVersion: "0.3.1",
      initialized: true,
      clean: true,
    }
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: () => "0.3.1",
      close: async () => undefined,
      inspectSpace: (_root: string, options: { signal?: AbortSignal } = {}) => {
        statusCalls += 1
        if (statusCalls > 1) {
          return Promise.resolve({
            ...cleanStatus,
            clean: false,
            changedPaths: 1,
          })
        }
        statusStarted.resolve()
        options.signal?.addEventListener(
          "abort",
          () => {
            statusAborts += 1
          },
          { once: true }
        )
        return finishStatus.promise
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
      const settled = new Promise<SpaceSnapshot>((resolve) => {
        const unsubscribe = session!.onChanged((snapshot) => {
          if (!snapshot.graft.checking && snapshot.graft.clean === false) {
            unsubscribe()
            resolve(snapshot)
          }
        })
      })

      await expect(session.snapshot()).resolves.toMatchObject({
        graft: { initialized: true, checking: true },
      })
      await statusStarted.promise
      ;(session as unknown as { noteLocalChange(): void }).noteLocalChange()

      expect(statusAborts).toBe(0)
      finishStatus.resolve(cleanStatus)
      await expect(settled).resolves.toMatchObject({
        graft: { initialized: true, clean: false, changedPaths: 1 },
      })
      expect(statusAborts).toBe(0)
      expect(statusCalls).toBe(2)
    } finally {
      finishStatus.resolve(cleanStatus)
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
      let checkingSnapshot: SpaceSnapshot | null = null
      let unsubscribe: () => void = () => undefined
      const settled = new Promise<SpaceSnapshot>((resolve, reject) => {
        const timer = setTimeout(() => {
          unsubscribe()
          reject(new Error("External change status did not settle"))
        }, 2_000)
        unsubscribe = session!.onChanged((snapshot) => {
          if (snapshot.graft.checking) {
            sawChecking = true
            checkingSnapshot = snapshot
          }
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
      expect(checkingSnapshot).toMatchObject({
        graft: { initialized: true, checking: true, clean: true },
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

  it("rechecks clean Graft status after opening an Eidos File adds a verification path", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-open-version-refresh-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-open-version-refresh-state-")
    )
    const relativePath = "records.eidos"
    const inspectSpace = vi.fn(
      async (
        _root: string,
        options: { verifyPaths?: readonly string[] } = {}
      ): Promise<GraftSpaceStatus> => {
        const dirty = options.verifyPaths?.includes(relativePath) === true
        return {
          available: true,
          backend: "sdk",
          version: "0.3.0",
          expectedVersion: "0.3.0",
          initialized: true,
          clean: !dirty,
          changedPaths: dirty ? 1 : 0,
        }
      }
    )
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: () => "0.3.0",
      hasOpenSession: () => false,
      close: async () => undefined,
      inspectSpace,
      inspectIgnores: async (_root: string, relativePaths: string[]) =>
        relativePaths.map((item) => ({
          path: item,
          isIgnored: false,
          isTracked: true,
          isDirectory: false,
          hasTrackedDescendants: false,
        })),
    } as unknown as GraftClient
    let session: SpaceSession | null = null

    try {
      await fs.mkdir(path.join(root, ".graft"))
      session = await SpaceSession.create(root, userData, { graft })
      const openRelativePaths = vi
        .spyOn(session.runtimePool, "openRelativePaths")
        .mockReturnValue([])
      vi.spyOn(session.runtimePool, "open").mockImplementation(async () => {
        openRelativePaths.mockReturnValue([relativePath])
        return {} as never
      })
      await expect(session.refresh()).resolves.toMatchObject({
        graft: { clean: true },
      })

      const settled = new Promise<SpaceSnapshot>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Open Eidos File status did not settle")),
          2_000
        )
        const unsubscribe = session!.onChanged((snapshot) => {
          if (snapshot.graft.clean === false) {
            clearTimeout(timer)
            unsubscribe()
            resolve(snapshot)
          }
        })
      })

      await session.openEidosFile(relativePath)
      await expect(settled).resolves.toMatchObject({
        graft: { clean: false, changedPaths: 1 },
      })
      expect(inspectSpace).toHaveBeenCalledWith(
        session.canonical.root,
        expect.objectContaining({ verifyPaths: [relativePath] })
      )
    } finally {
      await session?.close().catch(() => undefined)
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(userData, { recursive: true, force: true }),
      ])
    }
  }, 15_000)

  it("preempts a cold background status scan before opening an Eidos File", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-open-status-priority-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-open-status-priority-state-")
    )
    const relativePath = "records.eidos"
    const statusStarted = deferred<void>()
    const finishColdStatus = deferred<void>()
    let statusCalls = 0
    let backgroundAborted = false
    const cleanStatus: GraftSpaceStatus = {
      available: true,
      backend: "sdk",
      version: "0.3.8",
      expectedVersion: "0.3.8",
      initialized: true,
      clean: true,
      changedPaths: 0,
    }
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: () => "0.3.8",
      hasOpenSession: () => false,
      close: async () => undefined,
      inspectSpace: async (
        _root: string,
        options: { signal?: AbortSignal } = {}
      ) => {
        statusCalls += 1
        if (statusCalls > 1) return cleanStatus
        statusStarted.resolve()
        options.signal?.addEventListener(
          "abort",
          () => {
            backgroundAborted = true
          },
          { once: true }
        )
        // Model a Graft utility process whose cold repository open cannot observe
        // cancellation until its native initialization has finished.
        await finishColdStatus.promise
        if (options.signal?.aborted) {
          throw new DOMException("Cancelled", "AbortError")
        }
        return cleanStatus
      },
      inspectIgnores: async (_root: string, relativePaths: string[]) =>
        relativePaths.map((item) => ({
          path: item,
          isIgnored: false,
          isTracked: true,
          isDirectory: false,
          hasTrackedDescendants: false,
        })),
    } as unknown as GraftClient
    let session: SpaceSession | null = null

    try {
      await fs.mkdir(path.join(root, ".graft"))
      session = await SpaceSession.create(root, userData, { graft })
      vi.spyOn(session.runtimePool, "open").mockImplementation(async () => {
        expect(backgroundAborted).toBe(true)
        return {} as never
      })

      await session.snapshot()
      await statusStarted.promise
      const opened = session.openEidosFile(relativePath)
      await expect(opened).resolves.toEqual({})
      expect(backgroundAborted).toBe(true)
      finishColdStatus.resolve()
    } finally {
      finishColdStatus.resolve()
      await session?.close().catch(() => undefined)
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
      version: "0.3.1",
      expectedVersion: "0.3.1",
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
      expectedVersion: () => "0.3.1",
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

  it("defers background status while a foreground SQLite diff is active", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-version-read-status-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-version-read-status-state-")
    )
    const status: GraftSpaceStatus = {
      available: true,
      backend: "sdk",
      version: "0.3.8",
      expectedVersion: "0.3.8",
      initialized: true,
      clean: false,
      currentHead: "a".repeat(64),
      changedPaths: 1,
    }
    const pathDiff = deferred<SpaceVersionDiff>()
    const inspectSpace = vi.fn(async () => status)
    const sqlitePathDiff = vi.fn(() => pathDiff.promise)
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: () => "0.3.8",
      close: async () => undefined,
      inspectSpace,
      sqlitePathDiff,
      inspectIgnores: async (_root: string, relativePaths: string[]) =>
        relativePaths.map((relativePath) => ({
          path: relativePath,
          isIgnored: false,
          isTracked: true,
          isDirectory: false,
          hasTrackedDescendants: false,
        })),
    } as unknown as GraftClient
    let session: SpaceSession | null = null

    try {
      await fs.mkdir(path.join(root, ".graft"))
      await fs.writeFile(path.join(root, "space.eidos"), "placeholder")
      session = await SpaceSession.create(root, userData, { graft })
      await session.refresh()
      expect(inspectSpace).toHaveBeenCalledTimes(1)

      const reading = session.getVersionPathDiff("space.eidos")
      await vi.waitFor(() => expect(sqlitePathDiff).toHaveBeenCalledOnce())
      await fs.writeFile(path.join(root, "notes.txt"), "changed")
      await new Promise((resolve) => setTimeout(resolve, 1_100))
      expect(inspectSpace).toHaveBeenCalledTimes(1)

      pathDiff.resolve({
        currentHead: status.currentHead ?? null,
        currentBranch: "main",
        from: "index",
        to: "worktree",
        paths: [],
        files: [],
        hasMore: false,
        nextCursor: null,
      })
      await reading
      await vi.waitFor(() => expect(inspectSpace).toHaveBeenCalledTimes(2), {
        timeout: 2_000,
      })
    } finally {
      pathDiff.resolve({
        currentHead: null,
        currentBranch: null,
        from: null,
        to: null,
        paths: [],
        files: [],
        hasMore: false,
        nextCursor: null,
      })
      await session?.close().catch(() => undefined)
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(userData, { recursive: true, force: true }),
      ])
    }
  }, 15_000)

  it("does not cancel a History list read when a different version view is requested", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-version-read-kinds-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-version-read-kinds-state-")
    )
    const head = "a".repeat(64)
    const historyStarted = deferred<void>()
    const historyResult = deferred<{
      currentHead: string
      currentBranch: string
      commits: []
      hasMore: false
      nextCursor: null
    }>()
    let historyAborts = 0
    const history = vi.fn(
      (_root: string, _limit: number, options: { signal?: AbortSignal } = {}) =>
        new Promise<{
          currentHead: string
          currentBranch: string
          commits: []
          hasMore: false
          nextCursor: null
        }>((resolve) => {
          void historyResult.promise.then(resolve)
          options.signal?.addEventListener(
            "abort",
            () => {
              historyAborts += 1
            },
            { once: true }
          )
          historyStarted.resolve()
        })
    )
    const workingChanges = vi.fn(
      async (): Promise<SpaceVersionDiff> => ({
        currentHead: head,
        currentBranch: "main",
        from: "index",
        to: "worktree",
        paths: [],
        files: [],
        hasMore: false,
        nextCursor: null,
      })
    )
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: () => "0.3.8",
      close: async () => undefined,
      history,
      workingChanges,
    } as unknown as GraftClient
    let session: SpaceSession | null = null

    try {
      await fs.mkdir(path.join(root, ".graft"))
      session = await SpaceSession.create(root, userData, { graft })
      const readingHistory = session.getVersionHistory()
      await historyStarted.promise
      const readingChanges = session.getVersionChanges()

      await Promise.resolve()
      expect(historyAborts).toBe(0)
      expect(workingChanges).not.toHaveBeenCalled()
      historyResult.resolve({
        currentHead: head,
        currentBranch: "main",
        commits: [],
        hasMore: false,
        nextCursor: null,
      })

      await expect(readingHistory).resolves.toMatchObject({ currentHead: head })
      await expect(readingChanges).resolves.toMatchObject({ currentHead: head })
      expect(historyAborts).toBe(0)
      expect(workingChanges).toHaveBeenCalledOnce()
    } finally {
      historyResult.resolve({
        currentHead: head,
        currentBranch: "main",
        commits: [],
        hasMore: false,
        nextCursor: null,
      })
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
      ).toContain("generated")
      const reconciled = await session.refresh()
      expect(
        flattenSpaceTree(reconciled.entries).map((entry) => entry.relativePath)
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
      expectedVersion: () => "0.3.1",
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
        version: "0.3.1",
        expectedVersion: "0.3.1",
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
      expectedVersion: () => "0.3.1",
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
        version: "0.3.1",
        expectedVersion: "0.3.1",
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

  it("keeps Explorer refresh and local path mutations off the Graft critical path", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-local-explorer-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-local-explorer-state-")
    )
    const releaseIgnoreInspection = deferred<void>()
    let ignoreInspectionReleased = false
    const inspectIgnores = vi.fn(
      async (_root: string, relativePaths: string[]) => {
        await releaseIgnoreInspection.promise
        return relativePaths.map((relativePath) => ({
          path: relativePath,
          isIgnored: false,
          isTracked: false,
          isDirectory: false,
          hasTrackedDescendants: false,
        }))
      }
    )
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: () => "0.3.8",
      hasOpenSession: () => true,
      close: async () => undefined,
      inspectSpace: async () => ({
        available: true,
        backend: "sdk",
        version: "0.3.8",
        expectedVersion: "0.3.8",
        initialized: true,
        clean: true,
      }),
      inspectIgnores,
    } as unknown as GraftClient
    let session: SpaceSession | null = null

    try {
      await fs.mkdir(path.join(root, ".graft"))
      await fs.writeFile(path.join(root, "local.txt"), "available")
      session = await SpaceSession.create(root, userData, { graft })

      const refreshed = await session.refreshExplorer()
      expect(
        flattenSpaceTree(refreshed.entries).map((entry) => entry.relativePath)
      ).toContain("local.txt")
      expect(ignoreInspectionReleased).toBe(false)

      const created = await session.createFolder(null, "local-folder")
      expect(
        flattenSpaceTree(created.snapshot.entries).map(
          (entry) => entry.relativePath
        )
      ).toContain("local-folder")
      const textFile = await session.createTextFile(null, "notes.md")
      expect(textFile.relativePath).toBe("notes.md")
      expect(
        flattenSpaceTree(textFile.snapshot.entries).find(
          (entry) => entry.relativePath === "notes.md"
        )
      ).toMatchObject({ kind: "file" })
      await expect(
        fs.readFile(path.join(root, "notes.md"), "utf8")
      ).resolves.toBe("")
      expect(ignoreInspectionReleased).toBe(false)
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(inspectIgnores).toHaveBeenCalled()
      ignoreInspectionReleased = true
      releaseIgnoreInspection.resolve()
    } finally {
      ignoreInspectionReleased = true
      releaseIgnoreInspection.resolve()
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
      expectedVersion: () => "0.3.1",
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
      expectedVersion: () => "0.3.1",
      open: async () => undefined,
      close: async () => undefined,
      inspectSpace: async () => ({
        available: true,
        backend: "sdk",
        version: "0.3.1",
        expectedVersion: "0.3.1",
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

  it("binds a Runtime-derived Eidos policy to merge planning with one CAS signal", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-space-merge-policy-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-space-merge-policy-state-")
    )
    const remoteOrigin = "https://sync-staging.eidos.space"
    const remoteUrl = `${remoteOrigin}/u-alice/project`
    const localHead = "a".repeat(64)
    const hostedHead = "b".repeat(64)
    const base = "c".repeat(64)
    const initialPolicyToken = "d".repeat(64)
    const configuredPolicyToken = "e".repeat(64)
    const signals: AbortSignal[] = []
    let configuredPolicy: unknown
    const file = createEidosFile(path.join(root, "records.eidos"), {
      title: "Merge policy fixture",
    })
    try {
      file.importTable(
        {
          name: "Docs",
          fields: [{ name: "Title", type: "text", isRecordLabel: true }],
        },
        [{ _id: createEidosFileUuid(1_753_000_000_000), Title: "Base" }]
      )
    } finally {
      file.close()
    }
    const noteSignal = (signal: AbortSignal | undefined) => {
      if (signal) signals.push(signal)
    }
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: remoteOrigin,
      expectedVersion: () => "0.3.10",
      close: vi.fn(async () => undefined),
      inspectSpace: vi.fn(async () => ({
        available: true,
        backend: "sdk" as const,
        version: "0.3.10",
        expectedVersion: "0.3.10",
        initialized: true,
        clean: true,
        currentHead: localHead,
        changedPaths: 0,
      })),
      remoteUrl: vi.fn(async () => remoteUrl),
      configureOfficialRemote: vi.fn(
        async (
          _root: string,
          _url: string,
          _token: string,
          options: { signal?: AbortSignal }
        ) => noteSignal(options.signal)
      ),
      status: vi.fn(
        async (_root: string, options: { signal?: AbortSignal }) => {
          noteSignal(options.signal)
          return {
            dirty: false,
            currentHead: localHead,
            currentBranch: "main",
            ahead: 1,
            behind: 1,
            hasConflicts: false,
            changedPaths: 0,
            paths: [],
            changes: [],
          }
        }
      ),
      fetch: vi.fn(async (_root: string, options: { signal?: AbortSignal }) =>
        noteSignal(options.signal)
      ),
      getMergePolicy: vi.fn(
        async (_root: string, options: { signal?: AbortSignal }) => {
          noteSignal(options.signal)
          return {
            policy: { version: 1 as const },
            policy_token: initialPolicyToken,
            active_merge: false,
          }
        }
      ),
      validateMergePolicy: vi.fn(
        async (
          _root: string,
          policy: unknown,
          options: { signal?: AbortSignal }
        ) => {
          noteSignal(options.signal)
          return {
            valid: true,
            policy,
            policy_token: configuredPolicyToken,
            errors: [],
          }
        }
      ),
      setMergePolicy: vi.fn(
        async (
          _root: string,
          policy: unknown,
          _expectedPolicyToken: string,
          options: { signal?: AbortSignal }
        ) => {
          noteSignal(options.signal)
          configuredPolicy = policy
          return {
            policy,
            policy_token: configuredPolicyToken,
            active_merge: false,
          }
        }
      ),
      planMerge: vi.fn(
        async (
          _root: string,
          _revision: string,
          expectedHead: string,
          options: { signal?: AbortSignal }
        ) => {
          noteSignal(options.signal)
          return {
            kind: "three_way" as const,
            expectedHead,
            hostedHead,
            commonAncestor: base,
            stagedPaths: [],
            conflictedPaths: ["records.eidos"],
            planToken: "f".repeat(64),
            policyToken: configuredPolicyToken,
            policyVersion: 1,
          }
        }
      ),
      listMergeConflicts: vi.fn(
        async (
          _root: string,
          relativePath: string,
          stateToken: string,
          options: { signal?: AbortSignal }
        ) => {
          noteSignal(options.signal)
          return {
            stateToken,
            path: relativePath,
            items: [
              {
                id: "row:Docs:doc-1",
                path: relativePath,
                pathKind: "sqlite_database" as const,
                storage: "sqlite_snapshot" as const,
                kind: "row",
                reason: "cell_conflict",
                status: "unresolved" as const,
                table: "Docs",
                columns: ["Title"],
                key: { _id: "doc-1" },
                baseRow: ["doc-1", "Base"],
                oursRow: ["doc-1", "Local"],
                theirsRow: ["doc-1", "Hosted"],
              },
            ],
            nextCursor: null,
          }
        }
      ),
    } as unknown as GraftClient
    let session: SpaceSession | null = null

    try {
      await fs.mkdir(path.join(root, ".graft"))
      const canonical = await canonicalizeSpaceRoot(root)
      await new SpaceSyncStateStore(
        path.join(userData, "spaces", canonical.id),
        remoteOrigin
      ).markClone(remoteUrl)
      session = await SpaceSession.createCanonical(canonical, userData, {
        graft,
      })
      vi.spyOn(session.runtimePool, "open").mockResolvedValue({
        snapshot: {
          tables: [
            {
              table: {
                name: "Docs",
                physicalName: "Docs",
                rawTableName: "Docs",
              },
              fields: [{ physicalName: "_id" }, { physicalName: "Title" }],
            },
          ],
        },
      } as never)

      await expect(
        session.planHostedMerge("access-token")
      ).resolves.toMatchObject({
        kind: "three_way",
        policyToken: configuredPolicyToken,
        policyVersion: 1,
      })
      expect(configuredPolicy).toMatchObject({
        version: 1,
        same_row_merge: true,
        default_semantic_keys: ["_id"],
        column_resolvers: {
          Docs: { _updated_at: "max_timestamp" },
          eidos__meta: { updated_at: "max_timestamp" },
        },
      })
      expect(configuredPolicy).not.toMatchObject({
        column_resolvers: { eidos__meta: { revision: expect.anything() } },
      })
      expect(graft.setMergePolicy).toHaveBeenCalledWith(
        await fs.realpath(root),
        configuredPolicy,
        initialPolicyToken,
        { signal: signals[0] }
      )
      expect(signals.length).toBeGreaterThan(5)
      expect(new Set(signals).size).toBe(1)

      const conflicts = await session.listSyncMergeConflicts(
        "state-1",
        "records.eidos"
      )
      expect(conflicts.items[0]).toMatchObject({
        columns: ["Title"],
        rowColumns: ["_id", "Title"],
      })
    } finally {
      await session?.close().catch(() => undefined)
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(userData, { recursive: true, force: true }),
      ])
    }
  })

  it("validates every Eidos File before continuing a merge and keeps one gate signal", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-space-merge-gate-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-space-merge-gate-state-")
    )
    const stateToken = "d".repeat(64)
    const localHead = "a".repeat(64)
    const hostedHead = "b".repeat(64)
    const calls: string[] = []
    const signals: AbortSignal[] = []
    const graft = {
      backend: "sdk",
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      expectedVersion: () => "0.3.8",
      close: vi.fn(async () => undefined),
      operationMaterializesWorktree: vi.fn(
        async (operation: string, options: { signal?: AbortSignal }) => {
          calls.push("contract")
          if (options.signal) signals.push(options.signal)
          return operation !== "stageMergeSqliteResult"
        }
      ),
      getMergeStatus: vi.fn(
        async (_root: string, options: { signal?: AbortSignal }) => {
          calls.push("status")
          if (options.signal) signals.push(options.signal)
          return {
            state: "merging" as const,
            localHead,
            hostedHead,
            commonAncestor: "c".repeat(64),
            stagedCount: 1,
            unmergedCount: 0,
            stateToken,
            policyToken: "policy-1",
            policyVersion: 1,
          }
        }
      ),
      diffMergeSqlite: vi.fn(
        async (
          _root: string,
          path: string,
          from: string,
          to: string,
          _token: string,
          options: { signal?: AbortSignal }
        ) => {
          calls.push("diff-sqlite")
          if (options.signal) signals.push(options.signal)
          return {
            stateToken,
            path,
            from: { version: from, revision: "c".repeat(64) },
            to: { version: to, revision: hostedHead },
            diff: {
              currentHead: localHead,
              currentBranch: "main",
              from: "c".repeat(64),
              to: hostedHead,
              paths: [],
              files: [],
            },
          }
        }
      ),
      resolveMergeTable: vi.fn(
        async (
          _root: string,
          _path: string,
          _table: string,
          _result: string,
          _token: string,
          options: { signal?: AbortSignal }
        ) => {
          calls.push("resolve-table")
          if (options.signal) signals.push(options.signal)
          return {
            state: "merging" as const,
            localHead,
            hostedHead,
            commonAncestor: "c".repeat(64),
            stagedCount: 1,
            unmergedCount: 0,
            stateToken,
          }
        }
      ),
      resolveMergeCell: vi.fn(
        async (
          _root: string,
          _path: string,
          _table: string,
          _identity: number | Record<string, unknown>,
          _column: string,
          _result: string,
          _token: string,
          options: { signal?: AbortSignal }
        ) => {
          calls.push("resolve-cell")
          if (options.signal) signals.push(options.signal)
          return {
            state: "merging" as const,
            localHead,
            hostedHead,
            commonAncestor: "c".repeat(64),
            stagedCount: 1,
            unmergedCount: 0,
            stateToken,
            policyToken: "policy-1",
            policyVersion: 1,
          }
        }
      ),
      stageMergeSqliteResult: vi.fn(
        async (
          _root: string,
          _path: string,
          _token: string,
          options: { signal?: AbortSignal }
        ) => {
          calls.push("stage-sqlite")
          if (options.signal) signals.push(options.signal)
          return {
            state: "merging" as const,
            localHead,
            hostedHead,
            commonAncestor: "c".repeat(64),
            stagedCount: 1,
            unmergedCount: 0,
            stateToken,
            policyToken: "policy-1",
            policyVersion: 1,
          }
        }
      ),
      unresolveMergePath: vi.fn(
        async (
          _root: string,
          _path: string,
          _token: string,
          options: { signal?: AbortSignal }
        ) => {
          calls.push("unresolve-path")
          if (options.signal) signals.push(options.signal)
          return {
            state: "merging" as const,
            localHead,
            hostedHead,
            commonAncestor: "c".repeat(64),
            stagedCount: 0,
            unmergedCount: 1,
            stateToken,
          }
        }
      ),
      continueMerge: vi.fn(
        async (
          _root: string,
          _message: string,
          _token: string,
          options: { signal?: AbortSignal }
        ) => {
          calls.push("continue")
          if (options.signal) signals.push(options.signal)
          return { state: "none" as const }
        }
      ),
      inspectSpace: vi.fn(async () => ({
        available: true,
        backend: "sdk" as const,
        version: "0.3.8",
        expectedVersion: "0.3.8",
        initialized: true,
        clean: true,
        currentHead: "e".repeat(64),
        changedPaths: 0,
      })),
      inspectIgnores: vi.fn(async (_root: string, relativePaths: string[]) =>
        relativePaths.map((relativePath) => ({
          path: relativePath,
          isIgnored: false,
          isTracked: true,
          isDirectory: false,
          hasTrackedDescendants: false,
        }))
      ),
    } as unknown as GraftClient
    let session: SpaceSession | null = null

    try {
      await fs.mkdir(path.join(root, ".graft"))
      await fs.writeFile(path.join(root, "records.eidos"), "test fixture")
      session = await SpaceSession.create(root, userData, { graft })
      vi.spyOn(session.runtimePool, "closeHandles").mockImplementation(
        async () => {
          calls.push("close")
        }
      )
      vi.spyOn(session.runtimePool, "validatePaths").mockImplementation(
        async (paths) => {
          calls.push(`validate:${paths.join(",")}`)
        }
      )
      vi.spyOn(session.runtimePool, "reopenHandles").mockImplementation(
        async () => {
          calls.push("reopen")
        }
      )

      await expect(
        session.diffSyncMergeSqlite(
          stateToken,
          "records.eidos",
          "base",
          "theirs",
          { mode: "summary" }
        )
      ).resolves.toMatchObject({
        stateToken,
        path: "records.eidos",
        from: { version: "base" },
        to: { version: "theirs" },
      })
      expect(calls).toEqual(["diff-sqlite"])
      expect(graft.diffMergeSqlite).toHaveBeenCalledWith(
        await fs.realpath(root),
        "records.eidos",
        "base",
        "theirs",
        stateToken,
        { mode: "summary", signal: signals[0] }
      )
      expect(signals).toHaveLength(1)

      calls.length = 0
      signals.length = 0

      await expect(
        session.resolveSyncMergeTable(
          stateToken,
          "records.eidos",
          "Docs",
          "theirs"
        )
      ).resolves.toMatchObject({ state: "merging", unmergedCount: 0 })
      expect(calls).toEqual([
        "contract",
        "status",
        "close",
        "resolve-table",
        "validate:records.eidos",
        "reopen",
      ])
      expect(graft.resolveMergeTable).toHaveBeenCalledWith(
        await fs.realpath(root),
        "records.eidos",
        "Docs",
        "theirs",
        stateToken,
        { signal: signals[0] }
      )
      expect(signals).toHaveLength(3)
      expect(new Set(signals).size).toBe(1)

      calls.length = 0
      signals.length = 0

      await expect(
        session.resolveSyncMergeCell(
          stateToken,
          "records.eidos",
          "Docs",
          { _id: "stable-id" },
          "Status",
          "ours"
        )
      ).resolves.toMatchObject({ state: "merging", unmergedCount: 0 })
      expect(calls).toEqual([
        "contract",
        "status",
        "close",
        "resolve-cell",
        "validate:records.eidos",
        "reopen",
      ])
      expect(graft.resolveMergeCell).toHaveBeenCalledWith(
        await fs.realpath(root),
        "records.eidos",
        "Docs",
        { _id: "stable-id" },
        "Status",
        "ours",
        stateToken,
        { signal: signals[0] }
      )
      expect(signals).toHaveLength(3)
      expect(new Set(signals).size).toBe(1)

      calls.length = 0
      signals.length = 0

      await expect(
        session.stageSyncMergeSqliteResult(stateToken, "records.eidos")
      ).resolves.toMatchObject({ state: "merging", unmergedCount: 0 })
      expect(calls).toEqual([
        "contract",
        "status",
        "close",
        "validate:records.eidos",
        "stage-sqlite",
        "validate:records.eidos",
        "reopen",
      ])
      expect(graft.stageMergeSqliteResult).toHaveBeenCalledWith(
        await fs.realpath(root),
        "records.eidos",
        stateToken,
        { signal: signals[0] }
      )
      expect(signals).toHaveLength(3)
      expect(new Set(signals).size).toBe(1)

      calls.length = 0
      signals.length = 0
      await expect(
        session.unresolveSyncMergePath(stateToken, "records.eidos")
      ).resolves.toMatchObject({ state: "merging", unmergedCount: 1 })
      expect(calls).toEqual([
        "contract",
        "status",
        "close",
        "unresolve-path",
        "validate:records.eidos",
        "reopen",
      ])
      expect(graft.unresolveMergePath).toHaveBeenCalledWith(
        await fs.realpath(root),
        "records.eidos",
        stateToken,
        { signal: signals[0] }
      )
      expect(signals).toHaveLength(3)
      expect(new Set(signals).size).toBe(1)

      calls.length = 0
      signals.length = 0

      await expect(
        session.continueSyncMerge(stateToken, " Merge Hosted changes ")
      ).resolves.toEqual({ state: "none" })
      expect(calls.slice(0, 8)).toEqual([
        "contract",
        "status",
        "close",
        "validate:records.eidos",
        "continue",
        "validate:records.eidos",
        "reopen",
      ])
      expect(graft.continueMerge).toHaveBeenCalledWith(
        await fs.realpath(root),
        "Merge Hosted changes",
        stateToken,
        { signal: signals[0] }
      )
      expect(signals).toHaveLength(3)
      expect(new Set(signals).size).toBe(1)
      expect(signals[0]?.aborted).toBe(false)
      expect(session.gate.current().phase).toBe("ready")
    } finally {
      await session?.close().catch(() => undefined)
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(userData, { recursive: true, force: true }),
      ])
    }
  })
})
