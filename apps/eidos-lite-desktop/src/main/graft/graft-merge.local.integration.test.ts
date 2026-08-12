import { createRequire } from "node:module"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createEidosFileUuid, type EidosFileRow } from "@eidos.space/eidos-file"
import {
  createEidosFile,
  openEidosFile,
} from "@eidos.space/eidos-file/node-sqlite"

import type {
  EidosSyncMergeConflict,
  EidosSyncMergeStatus,
} from "../../shared/contracts"
import { SpaceOperationGate } from "../space/operation-gate"
import { SpaceOperationJournal } from "../space/operation-journal"
import { GraftClient } from "./graft-client"
import { GraftInProcessTransport } from "./graft-in-process-transport"

const localSdkPath = process.env.EIDOS_LITE_GRAFT_SDK_PATH
const runMergeIntegration =
  Boolean(localSdkPath) || process.env.EIDOS_LITE_RUN_GRAFT_MERGE === "1"
const integrationDescribe = runMergeIntegration ? describe : describe.skip

type EidosRuntime = ReturnType<typeof openEidosFile>

function client(): GraftClient {
  return new GraftClient({ sdkTransport: new GraftInProcessTransport() })
}

function coded(error: unknown): string | undefined {
  return error instanceof Error && "code" in error
    ? String(error.code)
    : undefined
}

function mergeToken(
  status: EidosSyncMergeStatus
): Extract<EidosSyncMergeStatus, { state: "merging" }> {
  if (status.state !== "merging") throw new Error("Expected an active merge")
  return status
}

function conflictIdentity(
  conflict: EidosSyncMergeConflict
): number | Record<string, unknown> | null {
  if (conflict.key && Object.keys(conflict.key).length > 0) return conflict.key
  if (Number.isSafeInteger(conflict.rowid)) return conflict.rowid ?? null
  if (conflict.oursKey && Object.keys(conflict.oursKey).length > 0) {
    return conflict.oursKey
  }
  if (Number.isSafeInteger(conflict.oursRowid))
    return conflict.oursRowid ?? null
  if (conflict.theirsKey && Object.keys(conflict.theirsKey).length > 0) {
    return conflict.theirsKey
  }
  return Number.isSafeInteger(conflict.theirsRowid)
    ? (conflict.theirsRowid ?? null)
    : null
}

function createEidosFixture(filePath: string, rowId: string): void {
  const runtime = createEidosFile(filePath, { title: "Merge fixture" })
  try {
    runtime.importTable(
      {
        name: "Docs",
        fields: [
          { name: "Title", type: "text", isRecordLabel: true },
          { name: "Status", type: "text" },
          { name: "Owner", type: "text" },
        ],
      },
      [{ _id: rowId, Title: "base", Status: "Draft", Owner: "Ada" }]
    )
  } finally {
    runtime.close()
  }
}

function updateEidosRow(
  filePath: string,
  rowId: string,
  values: EidosFileRow
): void {
  const runtime = openEidosFile(filePath, { readonly: false })
  try {
    const table = runtime.listTables().find((item) => item.name === "Docs")
    if (!table) throw new Error("Missing Docs table")
    runtime.updateRow(table.id, rowId, values)
  } finally {
    runtime.close()
  }
}

function readEidosRow(filePath: string, rowId: string): EidosFileRow {
  const runtime = openEidosFile(filePath, { readonly: true })
  try {
    const table = runtime.listTables().find((item) => item.name === "Docs")
    if (!table) throw new Error("Missing Docs table")
    const row = runtime.getRow(table.id, rowId)
    return row ?? {}
  } finally {
    runtime.close()
  }
}

function validateEidosFile(filePath: string): void {
  const runtime = openEidosFile(filePath, { readonly: true })
  try {
    expect(runtime.info().formatVersion).toBe("1.0")
    expect(runtime.validate({ level: "full" })).toMatchObject({ valid: true })
  } finally {
    runtime.close()
  }
}

async function waitForTurn(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("Graft merge SDK availability", () => {
  it("loads the merge APIs from the pinned published SDK", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-published-graft-merge-")
    )
    const graft = client()
    try {
      await graft.open(root)
      await graft.initialize(root)
      await expect(graft.getMergeStatus(root)).resolves.toMatchObject({
        state: "none",
      })
    } finally {
      await graft.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})

integrationDescribe("Eidos Lite Graft merge workflow", () => {
  it("recovers, resolves text/binary/Eidos conflicts, creates two parents, syncs, and aborts safely", async () => {
    const temporaryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-local-graft-merge-")
    )
    const source = path.join(temporaryRoot, "source")
    const remote = path.join(temporaryRoot, "remote")
    const clone = path.join(temporaryRoot, "clone")
    const gateState = path.join(temporaryRoot, "gate-state")
    const sourceGateState = path.join(temporaryRoot, "source-gate-state")
    const remoteOffline = path.join(temporaryRoot, "remote-offline")
    await Promise.all([
      fs.mkdir(source),
      fs.mkdir(remote),
      fs.mkdir(clone),
      fs.mkdir(gateState),
      fs.mkdir(sourceGateState),
    ])
    const sourceClient = client()
    const cloneClient = client()
    const rowId = createEidosFileUuid(1_753_000_000_000)
    const sourceEidos = path.join(source, "records.eidos")
    const cloneEidos = path.join(clone, "records.eidos")
    let cloneRuntime: EidosRuntime | null = null
    let sourceRuntime: EidosRuntime | null = null
    let remoteMoved = false
    const cloneLifecycle: string[] = []
    const sourceLifecycle: string[] = []
    const executedMaterializations = new Set<string>()

    const closeCloneRuntime = async () => {
      cloneLifecycle.push("close")
      cloneRuntime?.close()
      cloneRuntime = null
    }
    const openCloneRuntime = async () => {
      cloneLifecycle.push("reopen")
      cloneRuntime = openEidosFile(cloneEidos, { readonly: true })
    }
    const cloneGate = new SpaceOperationGate(
      new SpaceOperationJournal(gateState),
      {
        closeRuntimes: closeCloneRuntime,
        validateWorktree: async () => {
          cloneLifecycle.push("validate")
          validateEidosFile(cloneEidos)
        },
        reopenRuntimes: openCloneRuntime,
      }
    )
    const sourceGate = new SpaceOperationGate(
      new SpaceOperationJournal(sourceGateState),
      {
        closeRuntimes: async () => {
          sourceLifecycle.push("close")
          sourceRuntime?.close()
          sourceRuntime = null
        },
        validateWorktree: async () => {
          sourceLifecycle.push("validate")
          validateEidosFile(sourceEidos)
        },
        reopenRuntimes: async () => {
          sourceLifecycle.push("reopen")
          sourceRuntime = openEidosFile(sourceEidos, { readonly: true })
        },
      }
    )

    const throughGate = async (
      gate: SpaceOperationGate,
      owner: GraftClient,
      operationName:
        | "applyMerge"
        | "setMergePathResult"
        | "resolveMergeRow"
        | "resolveMergeCell"
        | "resolveMergeTable"
        | "unresolveMergePath"
        | "writeAndStageTextResult"
        | "continueMerge"
        | "abortMerge",
      operation: (signal: AbortSignal) => Promise<EidosSyncMergeStatus>
    ): Promise<EidosSyncMergeStatus> =>
      gate.withMaterialization({
        kind: `test-${operationName}`,
        beforeClose: async (signal) => {
          await expect(
            owner.operationMaterializesWorktree(operationName, { signal })
          ).resolves.toBe(true)
        },
        materialize: async (signal) => {
          executedMaterializations.add(operationName)
          return operation(signal)
        },
      })

    const resolveRemainingEidosTables = async (
      status: EidosSyncMergeStatus
    ): Promise<Extract<EidosSyncMergeStatus, { state: "merging" }>> => {
      let current = mergeToken(status)
      while (current.unmergedCount > 0) {
        const conflicts = await cloneClient.listMergeConflicts(
          clone,
          "records.eidos",
          current.stateToken,
          { limit: 100 }
        )
        const table = conflicts.items.find(
          (item) =>
            item.kind === "row" &&
            item.status === "unresolved" &&
            item.table !== undefined
        )?.table
        if (!table) {
          throw new Error(
            "Expected every remaining Eidos conflict to be tabular"
          )
        }
        current = mergeToken(
          await throughGate(
            cloneGate,
            cloneClient,
            "resolveMergeTable",
            (signal) =>
              cloneClient.resolveMergeTable(
                clone,
                "records.eidos",
                table,
                "theirs",
                current.stateToken,
                { signal }
              )
          )
        )
        const candidate = readEidosRow(cloneEidos, rowId)
        if (candidate.Status !== "Ready") {
          throw new Error(
            `Resolving ${table} discarded the prior Docs cell result: ${JSON.stringify(candidate)}`
          )
        }
      }
      return current
    }

    try {
      createEidosFixture(sourceEidos, rowId)
      await Promise.all([
        fs.writeFile(path.join(source, "notes.txt"), "base\n"),
        fs.writeFile(path.join(source, "asset.bin"), Buffer.from([0, 1, 2])),
      ])
      await sourceClient.open(source)
      await sourceClient.initialize(source)
      await sourceClient.stageAll(source)
      await sourceClient.commit(source, "Base")
      const remoteUrl = `fs://${remote}`
      await sourceClient.addRemote(source, "origin", remoteUrl)
      await sourceClient.setMainUpstream(source)
      await sourceClient.push(source)
      await cloneClient.clone(clone, remoteUrl)
      await cloneClient.open(clone)
      cloneRuntime = openEidosFile(cloneEidos, { readonly: true })

      const initialPolicy = await cloneClient.getMergePolicy(clone)
      const eidosPolicy = {
        ...initialPolicy.policy,
        version: 1 as const,
        same_row_merge: true,
        default_semantic_keys: ["_id"],
        column_resolvers: {
          ...(initialPolicy.policy.column_resolvers ?? {}),
          Docs: { _updated_at: "max_timestamp" as const },
        },
      }
      await expect(
        cloneClient.validateMergePolicy(clone, eidosPolicy)
      ).resolves.toMatchObject({ valid: true, policy: eidosPolicy })
      const configuredPolicy = await cloneClient.setMergePolicy(
        clone,
        eidosPolicy,
        initialPolicy.policy_token
      )

      updateEidosRow(sourceEidos, rowId, {
        Title: "hosted",
        Owner: "Hosted Team",
      })
      await Promise.all([
        fs.writeFile(path.join(source, "notes.txt"), "hosted\n"),
        fs.writeFile(path.join(source, "asset.bin"), Buffer.from([3, 4, 5])),
      ])
      await sourceClient.stageAll(source)
      await sourceClient.commit(source, "Hosted changes")
      await sourceClient.push(source)

      await closeCloneRuntime()
      updateEidosRow(cloneEidos, rowId, {
        Title: "local",
        Status: "Ready",
      })
      expect(readEidosRow(cloneEidos, rowId)).toMatchObject({
        Title: "local",
        Status: "Ready",
        Owner: "Ada",
      })
      await Promise.all([
        fs.writeFile(path.join(clone, "notes.txt"), "local\n"),
        fs.writeFile(path.join(clone, "asset.bin"), Buffer.from([6, 7, 8])),
      ])
      await openCloneRuntime()
      await cloneClient.stageAll(clone)
      const localCommit = await cloneClient.commit(clone, "Local changes")
      await cloneClient.fetch(clone)
      const relation = await cloneClient.status(clone)
      expect(relation.sync).toMatchObject({
        state: "diverged",
        localHead: localCommit.id,
      })

      const plan = await cloneClient.planMerge(
        clone,
        "origin/main",
        localCommit.id
      )
      expect(plan).toMatchObject({
        kind: "three_way",
        expectedHead: localCommit.id,
        policyToken: configuredPolicy.policy_token,
        policyVersion: 1,
      })
      expect(new Set(plan.conflictedPaths)).toEqual(
        new Set(["asset.bin", "notes.txt", "records.eidos"])
      )

      let releaseMutation: () => void = () => undefined
      const mutationWait = new Promise<void>((resolve) => {
        releaseMutation = resolve
      })
      const pendingMutation = cloneGate.withMutation(() => mutationWait)
      const applying = throughGate(
        cloneGate,
        cloneClient,
        "applyMerge",
        (signal) =>
          cloneClient.applyMerge(
            clone,
            "origin/main",
            localCommit.id,
            plan.planToken,
            { signal }
          )
      )
      await waitForTurn()
      expect(cloneGate.current().phase).toBe("quiescing")
      releaseMutation()
      let merge = mergeToken(await applying)
      await pendingMutation
      expect(merge).toMatchObject({
        policyToken: configuredPolicy.policy_token,
        policyVersion: 1,
      })
      await expect(cloneClient.getMergePolicy(clone)).resolves.toMatchObject({
        active_merge: true,
        policy_token: configuredPolicy.policy_token,
      })

      const initialToken = merge.stateToken
      await cloneClient.close()
      await cloneClient.open(clone)
      merge = mergeToken(await cloneClient.getMergeStatus(clone))
      expect(merge.stateToken).toBe(initialToken)

      const paths = await cloneClient.listMergePaths(clone, merge.stateToken, {
        limit: 100,
      })
      expect(new Set(paths.items.map((item) => item.path))).toEqual(
        new Set(["asset.bin", "notes.txt", "records.eidos"])
      )
      await expect(
        throughGate(
          cloneGate,
          cloneClient,
          "writeAndStageTextResult",
          (signal) =>
            cloneClient.writeAndStageTextResult(
              clone,
              "notes.txt",
              "stale\n",
              "0".repeat(64),
              { signal }
            )
        )
      ).rejects.toSatisfy(
        (error: unknown) => coded(error) === "GRAFT_SDK_REPOSITORY_STALE"
      )

      merge = mergeToken(await cloneClient.getMergeStatus(clone))
      merge = mergeToken(
        await throughGate(
          cloneGate,
          cloneClient,
          "writeAndStageTextResult",
          (signal) =>
            cloneClient.writeAndStageTextResult(
              clone,
              "notes.txt",
              "local + hosted\n",
              merge.stateToken,
              { signal }
            )
        )
      )
      merge = mergeToken(
        await throughGate(
          cloneGate,
          cloneClient,
          "setMergePathResult",
          (signal) =>
            cloneClient.setMergePathResult(
              clone,
              "asset.bin",
              "ours",
              merge.stateToken,
              { signal }
            )
        )
      )

      await expect(
        cloneClient.operationMaterializesWorktree("diffMergeSqlite")
      ).resolves.toBe(false)
      await expect(
        cloneClient.operationMaterializesWorktree("resolveMergeCell")
      ).resolves.toBe(true)
      await expect(
        cloneClient.operationMaterializesWorktree("stageMergeSqliteResult")
      ).resolves.toBe(false)
      const mergeDiffToken = merge.stateToken
      const [localSqliteDiff, hostedSqliteDiff] = await Promise.all([
        cloneClient.diffMergeSqlite(
          clone,
          "records.eidos",
          "base",
          "ours",
          mergeDiffToken,
          { mode: "summary" }
        ),
        cloneClient.diffMergeSqlite(
          clone,
          "records.eidos",
          "base",
          "theirs",
          mergeDiffToken,
          { mode: "summary" }
        ),
      ])
      expect(localSqliteDiff).toMatchObject({
        stateToken: mergeDiffToken,
        path: "records.eidos",
        from: { version: "base" },
        to: { version: "ours" },
      })
      expect(hostedSqliteDiff).toMatchObject({
        stateToken: mergeDiffToken,
        path: "records.eidos",
        from: { version: "base" },
        to: { version: "theirs" },
      })
      expect(localSqliteDiff.diff.files).toHaveLength(1)
      expect(hostedSqliteDiff.diff.files).toHaveLength(1)
      expect(
        mergeToken(await cloneClient.getMergeStatus(clone)).stateToken
      ).toBe(mergeDiffToken)

      const eidosConflicts = await cloneClient.listMergeConflicts(
        clone,
        "records.eidos",
        merge.stateToken,
        { limit: 100 }
      )
      const row = eidosConflicts.items.find(
        (item) => item.kind === "row" && item.status === "unresolved"
      )
      expect(row?.table).toBe("Docs")
      expect(conflictIdentity(row!)).not.toBeNull()
      expect(row?.cells).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            column: "Title",
            base: "base",
            local: "local",
            hosted: "hosted",
          }),
        ])
      )

      merge = mergeToken(
        await throughGate(
          cloneGate,
          cloneClient,
          "resolveMergeCell",
          (signal) =>
            cloneClient.resolveMergeCell(
              clone,
              "records.eidos",
              "Docs",
              conflictIdentity(row!)!,
              "Title",
              "theirs",
              merge.stateToken,
              { signal }
            )
        )
      )
      expect(merge.unmergedCount).toBeGreaterThan(0)
      const afterCellConflicts = await cloneClient.listMergeConflicts(
        clone,
        "records.eidos",
        merge.stateToken,
        { limit: 100 }
      )
      expect(
        afterCellConflicts.items.find((item) => item.id === row?.id)
      ).toMatchObject({
        status: "resolved",
        resolution: "cells",
        cells: expect.arrayContaining([
          expect.objectContaining({
            column: "Title",
            resolution: "theirs",
          }),
        ]),
      })
      expect(readEidosRow(cloneEidos, rowId)).toMatchObject({
        Title: "hosted",
        Status: "Ready",
        Owner: "Hosted Team",
      })
      merge = await resolveRemainingEidosTables(merge)
      expect(merge.unmergedCount).toBe(0)
      let resolvedConflicts = await cloneClient.listMergeConflicts(
        clone,
        "records.eidos",
        merge.stateToken,
        { limit: 100 }
      )
      expect(resolvedConflicts.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "row",
            status: "resolved",
            resolution: "cells",
            table: "Docs",
            cells: expect.arrayContaining([
              expect.objectContaining({
                column: "Title",
                resolution: "theirs",
              }),
            ]),
          }),
        ])
      )

      const resolvedToken = merge.stateToken
      await cloneClient.close()
      await cloneClient.open(clone)
      merge = mergeToken(await cloneClient.getMergeStatus(clone))
      expect(merge.stateToken).toBe(resolvedToken)
      resolvedConflicts = await cloneClient.listMergeConflicts(
        clone,
        "records.eidos",
        merge.stateToken,
        { limit: 100 }
      )
      expect(resolvedConflicts.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "row",
            status: "resolved",
            resolution: "cells",
            table: "Docs",
          }),
        ])
      )

      merge = mergeToken(
        await throughGate(
          cloneGate,
          cloneClient,
          "unresolveMergePath",
          (signal) =>
            cloneClient.unresolveMergePath(
              clone,
              "records.eidos",
              merge.stateToken,
              { signal }
            )
        )
      )
      expect(merge.unmergedCount).toBe(1)
      const restoredConflicts = await cloneClient.listMergeConflicts(
        clone,
        "records.eidos",
        merge.stateToken,
        { limit: 100 }
      )
      expect(restoredConflicts.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "row",
            status: "unresolved",
            table: "Docs",
          }),
        ])
      )

      const restoredDocs = restoredConflicts.items.find(
        (item) =>
          item.kind === "row" &&
          item.status === "unresolved" &&
          item.table === "Docs"
      )
      if (!restoredDocs) throw new Error("Missing restored Docs conflict")
      merge = mergeToken(
        await throughGate(
          cloneGate,
          cloneClient,
          "resolveMergeCell",
          (signal) =>
            cloneClient.resolveMergeCell(
              clone,
              "records.eidos",
              "Docs",
              conflictIdentity(restoredDocs)!,
              "Title",
              "theirs",
              merge.stateToken,
              { signal }
            )
        )
      )
      merge = await resolveRemainingEidosTables(merge)
      expect(merge.unmergedCount).toBe(0)
      validateEidosFile(cloneEidos)
      const mergedStatus = await throughGate(
        cloneGate,
        cloneClient,
        "continueMerge",
        async (signal) => {
          validateEidosFile(cloneEidos)
          return cloneClient.continueMerge(
            clone,
            "Merge Local and Hosted",
            merge.stateToken,
            { signal }
          )
        }
      )
      expect(mergedStatus).toEqual({ state: "none" })
      expect(await fs.readFile(path.join(clone, "notes.txt"), "utf8")).toBe(
        "local + hosted\n"
      )
      expect(await fs.readFile(path.join(clone, "asset.bin"))).toEqual(
        Buffer.from([6, 7, 8])
      )
      expect(readEidosRow(cloneEidos, rowId)).toMatchObject({
        Title: "hosted",
        Status: "Ready",
        Owner: "Hosted Team",
      })
      expect(cloneLifecycle).toEqual(
        expect.arrayContaining(["close", "validate", "reopen"])
      )

      const mergedHead = (await cloneClient.status(clone)).currentHead
      expect(mergedHead).toMatch(/^[0-9a-f]{64}$/)
      await cloneClient.close()
      const localModule = createRequire(import.meta.url)(
        localSdkPath ?? "@eidos.space/graft"
      ) as {
        RepositorySession: {
          open(root: string): Promise<{
            commitDetails(revision: string): Promise<{ parents: string[] }>
            close(): Promise<void>
          }>
        }
      }
      const detailSession = await localModule.RepositorySession.open(clone)
      const mergeCommit = await detailSession.commitDetails(mergedHead!)
      expect(mergeCommit.parents).toHaveLength(2)
      await detailSession.close()
      await cloneClient.open(clone)
      await cloneClient.push(clone)

      sourceRuntime = openEidosFile(sourceEidos, { readonly: true })
      await sourceClient.fetch(source)
      const sourceBefore = await sourceClient.status(source)
      expect(sourceBefore.sync?.state).toBe("behind")
      const fastForwardPlan = await sourceClient.planMerge(
        source,
        "origin/main",
        sourceBefore.currentHead ?? null
      )
      expect(fastForwardPlan.kind).toBe("fast_forward")
      await throughGate(sourceGate, sourceClient, "applyMerge", (signal) =>
        sourceClient.applyMerge(
          source,
          "origin/main",
          sourceBefore.currentHead ?? null,
          fastForwardPlan.planToken,
          { signal }
        )
      )
      expect((await sourceClient.status(source)).sync?.state).toBe("up_to_date")
      expect(await fs.readFile(path.join(source, "notes.txt"), "utf8")).toBe(
        "local + hosted\n"
      )
      expect(readEidosRow(sourceEidos, rowId)).toMatchObject({
        Title: "hosted",
        Status: "Ready",
        Owner: "Hosted Team",
      })

      sourceRuntime?.close()
      sourceRuntime = null
      await fs.writeFile(path.join(source, "notes.txt"), "hosted second\n")
      await sourceClient.stageAll(source)
      await sourceClient.commit(source, "Hosted second")
      await sourceClient.push(source)
      await closeCloneRuntime()
      await fs.writeFile(path.join(clone, "notes.txt"), "local second\n")
      await openCloneRuntime()
      await cloneClient.stageAll(clone)
      const secondLocal = await cloneClient.commit(clone, "Local second")
      await cloneClient.fetch(clone)
      const secondPlan = await cloneClient.planMerge(
        clone,
        "origin/main",
        secondLocal.id
      )
      merge = mergeToken(
        await throughGate(cloneGate, cloneClient, "applyMerge", (signal) =>
          cloneClient.applyMerge(
            clone,
            "origin/main",
            secondLocal.id,
            secondPlan.planToken,
            { signal }
          )
        )
      )
      merge = mergeToken(
        await throughGate(
          cloneGate,
          cloneClient,
          "writeAndStageTextResult",
          (signal) =>
            cloneClient.writeAndStageTextResult(
              clone,
              "notes.txt",
              "partial result\n",
              merge.stateToken,
              { signal }
            )
        )
      )
      await cloneClient.close()
      await cloneClient.open(clone)
      expect(
        mergeToken(await cloneClient.getMergeStatus(clone)).stateToken
      ).toBe(merge.stateToken)
      expect(await fs.readFile(path.join(clone, "notes.txt"), "utf8")).toBe(
        "partial result\n"
      )
      expect(
        await throughGate(cloneGate, cloneClient, "abortMerge", (signal) =>
          cloneClient.abortMerge(clone, merge.stateToken, { signal })
        )
      ).toEqual({ state: "none" })
      expect(await fs.readFile(path.join(clone, "notes.txt"), "utf8")).toBe(
        "local second\n"
      )
      await expect(cloneClient.getMergeStatus(clone)).resolves.toEqual({
        state: "none",
      })
      await expect(cloneClient.getMergeStatus(clone)).resolves.toEqual({
        state: "none",
      })

      const aborted = new AbortController()
      aborted.abort()
      await expect(
        cloneClient.getMergeStatus(clone, { signal: aborted.signal })
      ).rejects.toMatchObject({ name: "AbortError" })

      await fs.rename(remote, remoteOffline)
      remoteMoved = true
      await expect(sourceClient.fetch(source)).rejects.toBeDefined()
      await fs.rename(remoteOffline, remote)
      remoteMoved = false
      await expect(sourceClient.fetch(source)).resolves.toBeDefined()
      expect(sourceLifecycle).toEqual(["close", "validate", "reopen"])
      expect(executedMaterializations).toEqual(
        new Set([
          "applyMerge",
          "setMergePathResult",
          "resolveMergeCell",
          "resolveMergeTable",
          "unresolveMergePath",
          "writeAndStageTextResult",
          "continueMerge",
          "abortMerge",
        ])
      )
    } finally {
      cloneRuntime?.close()
      sourceRuntime?.close()
      await Promise.allSettled([
        cloneGate.close(),
        sourceGate.close(),
        cloneClient.close(),
        sourceClient.close(),
      ])
      if (remoteMoved) {
        await fs.rename(remoteOffline, remote).catch(() => undefined)
      }
      await fs.rm(temporaryRoot, { recursive: true, force: true })
    }
  }, 120_000)
})
