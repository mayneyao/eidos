import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { performance } from "node:perf_hooks"
import { DatabaseSync } from "node:sqlite"

import { EIDOS_LITE_PERFORMANCE_BUDGET_MS } from "../../shared/performance-contract"
import { GraftClient } from "./graft-client"
import { GraftInProcessTransport } from "./graft-in-process-transport"
import { listSpaceTree } from "../space/space-paths"
import { SpaceSession } from "../space/space-session"
import { createSyncPreflight } from "../sync/sync-preflight"

const largeRepositoryRoot = process.env.EIDOS_LITE_LARGE_REPOSITORY_ROOT
const largeRepositoryMutationRoot =
  process.env.EIDOS_LITE_LARGE_REPOSITORY_MUTATION_ROOT
const largeRepositoryDiffRoot =
  process.env.EIDOS_LITE_LARGE_REPOSITORY_DIFF_ROOT

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
        expect(shellMs).toBeLessThan(
          EIDOS_LITE_PERFORMANCE_BUDGET_MS.spaceShell
        )
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
          ? await timed(() =>
              client.sqlitePathDiff(root, changedPath, { rowLimit: 100 })
            )
          : null
        const selectedTable = selectedDiff?.value.files[0]?.tables[0]?.name
        const selectedTableDiff =
          changedPath && selectedTable
            ? await timed(() =>
                client.sqlitePathDiff(root, changedPath, {
                  table: selectedTable,
                  rowLimit: 100,
                })
              )
            : null

        const metrics = {
          changedPaths: hotStatus.value.changedPaths,
          selectedPath: changedPath ?? null,
          selectedTable: selectedTable ?? null,
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
          selectedTableDiffMs: selectedTableDiff?.durationMs ?? null,
        }
        console.info(`large-repository-metrics ${JSON.stringify(metrics)}`)

        expect(hotStatus.value.statusCacheHit).toBe(true)
        expect(history.value.commits.length).toBeLessThanOrEqual(50)
        expect(changes.value.paths.length).toBeLessThanOrEqual(100)
        expect(ignores.value).toHaveLength(rootEntries.length)
        expect(hotStatus.durationMs).toBeLessThan(
          EIDOS_LITE_PERFORMANCE_BUDGET_MS.versionSummary
        )
        expect(history.durationMs).toBeLessThan(
          EIDOS_LITE_PERFORMANCE_BUDGET_MS.versionSummary
        )
        expect(changes.durationMs).toBeLessThan(
          EIDOS_LITE_PERFORMANCE_BUDGET_MS.versionSummary
        )
        expect(ignores.durationMs).toBeLessThan(
          EIDOS_LITE_PERFORMANCE_BUDGET_MS.versionSummary
        )
        expect(hotInventory.durationMs).toBeLessThan(
          EIDOS_LITE_PERFORMANCE_BUDGET_MS.versionSummary
        )
        expect(tree.durationMs).toBeLessThan(
          EIDOS_LITE_PERFORMANCE_BUDGET_MS.spaceTree
        )
        expect(preflight.durationMs).toBeLessThan(
          EIDOS_LITE_PERFORMANCE_BUDGET_MS.syncPreflight
        )
        expect(treeIgnoreBatches).toBeLessThan(100)
        expect(preflightIgnoreBatches).toBeLessThan(100)
        expect(preflight.value.warnings.length).toBeLessThanOrEqual(100)
        expect(preflight.value.excluded.length).toBeLessThanOrEqual(100)
        expect(JSON.stringify(preflight.value).length).toBeLessThan(64 * 1024)
        if (selectedDiff) {
          expect(selectedDiff.durationMs).toBeLessThan(
            EIDOS_LITE_PERFORMANCE_BUDGET_MS.selectedVersionDiff
          )
        }
        if (selectedTableDiff) {
          expect(selectedTableDiff.durationMs).toBeLessThan(
            EIDOS_LITE_PERFORMANCE_BUDGET_MS.selectedVersionDiff
          )
        }
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

describe.skipIf(!largeRepositoryMutationRoot)(
  "large repository checkpoint integration",
  () => {
    it("checkpoints and restores a tiny change without rescanning unrelated rows", async () => {
      const root = largeRepositoryMutationRoot!
      const filePath = path.join(root, "Untitled.eidos")
      const client = new GraftClient({
        sdkTransport: new GraftInProcessTransport(),
      })

      try {
        await client.open(root)
        const baseline = await client.status(root)
        expect(baseline.dirty).toBe(false)
        expect(baseline.currentHead).toMatch(/^[0-9a-f]{64}$/)

        const database = new DatabaseSync(filePath)
        try {
          database
            .prepare("UPDATE eidos__meta SET title = title || ' · perf'")
            .run()
        } finally {
          database.close()
        }

        const changedStatus = await timed(() => client.status(root))
        const stage = await timed(() => client.stageAll(root))
        const commit = await timed(() =>
          client.commit(root, "Large repository performance probe")
        )
        const checkpointStatus = await timed(() => client.status(root))
        expect(checkpointStatus.value.currentHead).toMatch(/^[0-9a-f]{64}$/)

        const warmDatabase = new DatabaseSync(filePath)
        try {
          warmDatabase
            .prepare("UPDATE eidos__meta SET title = title || ' · perf-warm'")
            .run()
        } finally {
          warmDatabase.close()
        }
        const warmChangedStatus = await timed(() => client.status(root))
        const warmStage = await timed(() => client.stageAll(root))
        const warmCommit = await timed(() =>
          client.commit(root, "Warm large repository performance probe")
        )
        const warmCheckpointStatus = await timed(() => client.status(root))
        const changedHead = warmCheckpointStatus.value.currentHead
        expect(changedHead).toMatch(/^[0-9a-f]{64}$/)

        const restore = await timed(() =>
          client.restorePaths(root, baseline.currentHead!, changedHead!, [
            "Untitled.eidos",
          ])
        )
        const restoredStatus = await timed(() => client.status(root))

        console.info(
          `large-repository-checkpoint ${JSON.stringify({
            changedStatusMs: changedStatus.durationMs,
            stageMs: stage.durationMs,
            commitMs: commit.durationMs,
            checkpointAcknowledgementMs: stage.durationMs + commit.durationMs,
            checkpointStatusMs: checkpointStatus.durationMs,
            warmChangedStatusMs: warmChangedStatus.durationMs,
            warmStageMs: warmStage.durationMs,
            warmCommitMs: warmCommit.durationMs,
            warmCheckpointAcknowledgementMs:
              warmStage.durationMs + warmCommit.durationMs,
            warmCheckpointStatusMs: warmCheckpointStatus.durationMs,
            restoreMs: restore.durationMs,
            restoredStatusMs: restoredStatus.durationMs,
            restoredDirty: restoredStatus.value.dirty,
          })}`
        )

        expect(changedStatus.value.paths).toEqual(["Untitled.eidos"])
        expect(checkpointStatus.value.dirty).toBe(false)
        expect(warmChangedStatus.value.paths).toEqual(["Untitled.eidos"])
        expect(warmCheckpointStatus.value.dirty).toBe(false)
        expect(restoredStatus.value.dirty).toBe(true)
        expect(stage.durationMs + commit.durationMs).toBeLessThan(
          EIDOS_LITE_PERFORMANCE_BUDGET_MS.coldLargeCheckpointAcknowledgement
        )
        expect(warmStage.durationMs + warmCommit.durationMs).toBeLessThan(
          EIDOS_LITE_PERFORMANCE_BUDGET_MS.checkpointAcknowledgement
        )
        expect(restore.durationMs).toBeLessThan(10_000)
      } finally {
        await client.close().catch(() => undefined)
      }
    }, 45_000)
  }
)

describe.skipIf(!largeRepositoryDiffRoot)(
  "large repository dirty diff integration",
  () => {
    it("keeps dirty summary, selected path, and selected table work independently bounded", async () => {
      const root = largeRepositoryDiffRoot!
      const filePath = path.join(root, "Untitled.eidos")
      const client = new GraftClient({
        sdkTransport: new GraftInProcessTransport(),
      })

      try {
        await client.open(root)
        const baseline = await client.status(root)
        expect(baseline.dirty).toBe(false)

        const database = new DatabaseSync(filePath)
        try {
          database
            .prepare("UPDATE eidos__meta SET title = title || ' · perf-diff'")
            .run()
        } finally {
          database.close()
        }

        const changedStatus = await timed(() => client.status(root))
        const workingChanges = await timed(() =>
          client.workingChanges(root, { limit: 100 })
        )
        const selectedPathDiff = await timed(() =>
          client.sqlitePathDiff(root, "Untitled.eidos", { rowLimit: 100 })
        )
        const selectedTable = selectedPathDiff.value.files[0]?.tables.find(
          (table) =>
            table.summary &&
            table.summary.inserts +
              table.summary.deletes +
              table.summary.updates >
              0
        )?.name
        expect(selectedTable).toBeTruthy()
        const selectedTableDiff = await timed(() =>
          client.sqlitePathDiff(root, "Untitled.eidos", {
            table: selectedTable!,
            rowLimit: 100,
          })
        )

        console.info(
          `large-repository-dirty-diff ${JSON.stringify({
            changedStatusMs: changedStatus.durationMs,
            changesSummaryMs: workingChanges.durationMs,
            selectedPathDiffMs: selectedPathDiff.durationMs,
            selectedTable,
            selectedTableDiffMs: selectedTableDiff.durationMs,
          })}`
        )

        expect(changedStatus.value.paths).toEqual(["Untitled.eidos"])
        expect(workingChanges.value.paths).toHaveLength(1)
        expect(workingChanges.durationMs).toBeLessThan(
          EIDOS_LITE_PERFORMANCE_BUDGET_MS.versionSummary
        )
        expect(selectedPathDiff.durationMs).toBeLessThan(
          EIDOS_LITE_PERFORMANCE_BUDGET_MS.coldLargeSelectedVersionDiff
        )
        expect(selectedTableDiff.durationMs).toBeLessThan(
          EIDOS_LITE_PERFORMANCE_BUDGET_MS.selectedVersionDiff
        )
      } finally {
        await client.close().catch(() => undefined)
      }
    }, 20_000)
  }
)
