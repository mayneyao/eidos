import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { performance } from "node:perf_hooks"

import { GraftClient } from "./graft-client"
import { GraftInProcessTransport } from "./graft-in-process-transport"
import { listSpaceTree } from "../space/space-paths"
import { SpaceSession } from "../space/space-session"
import { createSyncPreflight } from "../sync/sync-preflight"

const largeRepositoryRoot = process.env.EIDOS_LITE_LARGE_REPOSITORY_ROOT

async function timed<T>(read: () => Promise<T>): Promise<{
  value: T
  durationMs: number
}> {
  const startedAt = performance.now()
  const value = await read()
  return { value, durationMs: performance.now() - startedAt }
}

describe.skipIf(!largeRepositoryRoot)(
  "large repository SDK integration",
  () => {
    it("returns the Space shell without waiting for cold repository status", async () => {
      const root = largeRepositoryRoot!
      const userData = await fs.mkdtemp(
        path.join(os.tmpdir(), "eidos-lite-large-space-state-")
      )
      const startedAt = performance.now()
      const session = await SpaceSession.create(root, userData, {
        graft: new GraftClient({
          sdkTransport: new GraftInProcessTransport(),
        }),
      })
      try {
        const snapshot = await session.snapshot()
        const shellMs = performance.now() - startedAt
        console.info(
          `large-repository-shell ${JSON.stringify({ shellMs, rootEntries: snapshot.entries.length, statusChecking: snapshot.graft.checking })}`
        )
        expect(shellMs).toBeLessThan(1_000)
        expect(snapshot.entries.length).toBeGreaterThan(0)
        expect(snapshot.graft.checking).toBe(true)
      } finally {
        await session.close()
        await fs.rm(userData, { recursive: true, force: true })
      }
    }, 10_000)

    it("keeps status, history, changes, path diff, and ignore inspection bounded", async () => {
      const root = largeRepositoryRoot!
      const stats = await fs.stat(root)
      expect(stats.isDirectory()).toBe(true)
      const client = new GraftClient({
        sdkTransport: new GraftInProcessTransport(),
      })

      try {
        await client.open(root)
        const coldStatus = await timed(() => client.status(root))
        const hotStatus = await timed(() => client.status(root))
        const history = await timed(() => client.history(root, 50))
        const changes = await timed(() =>
          client.workingChanges(root, { limit: 100 })
        )
        const rootEntries = await fs.readdir(root)
        const ignores = await timed(() =>
          client.inspectIgnores(root, rootEntries)
        )
        const coldInventory = await timed(() =>
          client.trackedIgnored(root, { limit: 100 })
        )
        const hotInventory = await timed(() =>
          client.trackedIgnored(root, { limit: 100 })
        )
        let treeIgnoreBatches = 0
        const tree = await timed(() =>
          listSpaceTree(root, {
            ignoredPaths: async (relativePaths) => {
              treeIgnoreBatches += 1
              const rows = await client.inspectIgnores(root, relativePaths)
              return new Set(
                rows
                  .filter(
                    (row) =>
                      row.isIgnored &&
                      !row.isTracked &&
                      !row.hasTrackedDescendants
                  )
                  .map((row) => row.path)
              )
            },
          })
        )
        let preflightIgnoreBatches = 0
        const preflight = await timed(() =>
          createSyncPreflight(root, {
            inspectIgnores: async (relativePaths) => {
              preflightIgnoreBatches += 1
              const rows = await client.inspectIgnores(root, relativePaths)
              return new Map(rows.map((row) => [row.path, row]))
            },
          })
        )
        const changedPath = changes.value.paths[0]?.path
        const selectedDiff = changedPath
          ? await timed(() => client.pathDiff(root, changedPath))
          : null

        const metrics = {
          changedPaths: hotStatus.value.changedPaths,
          selectedPath: changedPath ?? null,
          commits: history.value.commits.length,
          ignoredTracked: hotInventory.value.total,
          coldStatusMs: coldStatus.durationMs,
          hotStatusMs: hotStatus.durationMs,
          historyMs: history.durationMs,
          changesMs: changes.durationMs,
          ignoreBatchMs: ignores.durationMs,
          coldInventoryMs: coldInventory.durationMs,
          hotInventoryMs: hotInventory.durationMs,
          treeMs: tree.durationMs,
          treeIgnoreBatches,
          preflightMs: preflight.durationMs,
          preflightIgnoreBatches,
          preflightResponseBytes: JSON.stringify(preflight.value).length,
          selectedDiffMs: selectedDiff?.durationMs ?? null,
        }
        console.info(`large-repository-metrics ${JSON.stringify(metrics)}`)

        expect(hotStatus.value.statusCacheHit).toBe(true)
        expect(history.value.commits.length).toBeLessThanOrEqual(50)
        expect(changes.value.paths.length).toBeLessThanOrEqual(100)
        expect(ignores.value).toHaveLength(rootEntries.length)
        expect(hotStatus.durationMs).toBeLessThan(1_000)
        expect(history.durationMs).toBeLessThan(1_000)
        expect(changes.durationMs).toBeLessThan(1_000)
        expect(ignores.durationMs).toBeLessThan(1_000)
        expect(hotInventory.durationMs).toBeLessThan(1_000)
        expect(tree.durationMs).toBeLessThan(3_000)
        expect(preflight.durationMs).toBeLessThan(3_000)
        expect(treeIgnoreBatches).toBeLessThan(100)
        expect(preflightIgnoreBatches).toBeLessThan(100)
        expect(preflight.value.warnings.length).toBeLessThanOrEqual(100)
        expect(preflight.value.excluded.length).toBeLessThanOrEqual(100)
        expect(JSON.stringify(preflight.value).length).toBeLessThan(64 * 1024)
        if (selectedDiff) expect(selectedDiff.durationMs).toBeLessThan(3_000)
      } finally {
        await client.close().catch(() => undefined)
      }
    }, 45_000)

    it("reuses the persisted status snapshot after a repository session restart", async () => {
      const root = largeRepositoryRoot!
      const first = new GraftClient({
        sdkTransport: new GraftInProcessTransport(),
      })
      const reopened = new GraftClient({
        sdkTransport: new GraftInProcessTransport(),
      })

      try {
        await first.open(root)
        const baseline = await timed(() => first.status(root))
        await first.close()

        await reopened.open(root)
        const restored = await timed(() => reopened.status(root))
        console.info(
          `large-repository-persistent-status ${JSON.stringify({ baselineMs: baseline.durationMs, reopenedMs: restored.durationMs, persistentSnapshotHit: restored.value.persistentSnapshotHit, stabilityRetries: restored.value.stabilityRetries })}`
        )
        expect(restored.value).toMatchObject({
          dirty: baseline.value.dirty,
          currentHead: baseline.value.currentHead,
          changedPaths: baseline.value.changedPaths,
          persistentSnapshotHit: true,
        })
        expect(restored.durationMs).toBeLessThan(1_500)
      } finally {
        await Promise.all([
          first.close().catch(() => undefined),
          reopened.close().catch(() => undefined),
        ])
      }
    }, 20_000)
  }
)
