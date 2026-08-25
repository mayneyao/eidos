import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { EIDOS_LITE_SERVICE_ENVIRONMENTS } from "../../shared/service-environment"
import {
  classifySyncHistory,
  GraftClient,
  isOfficialRemoteUrl,
} from "./graft-client"
import type { GraftSdkTransport } from "./graft-sdk-transport"

const unusedRevisionTextDiff: GraftSdkTransport["revisionTextDiff"] = vi.fn(
  async () => {
    throw new Error("Unexpected Graft SDK revision text diff")
  }
)

function createUnusedTransport(): GraftSdkTransport {
  return {
    target: null,
    open: vi.fn(async () => undefined),
    reopen: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    command: vi.fn(async () => {
      throw new Error("Unexpected Graft SDK command")
    }),
    revisionTextDiff: unusedRevisionTextDiff,
    clone: vi.fn(async () => {
      throw new Error("Unexpected Graft SDK clone")
    }),
  }
}

describe("GraftClient", () => {
  it("captures a SQLite publication snapshot and projects its reusable token", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-publish-capture-")
    )
    const output = path.join(root, "snapshot.eidos")
    const signal = new AbortController().signal
    const command = vi.fn(async () => ({
      path: "records.eidos",
      output,
      snapshot_token: "opaque-snapshot-token",
      content_fingerprint: `graft-sqlite-v1:${"a".repeat(64)}`,
      sha256: "c".repeat(64),
      bytes: 8192,
      page_count: 2,
      changed_pages: 1,
      reused_snapshot: false,
      page_hash_cache_hit: true,
      delta_output: `${output}.delta`,
      delta_bytes: 4204,
      delta_changed_pages: 1,
      delta_base_content_fingerprint: `graft-sqlite-v1:${"b".repeat(64)}`,
      delta_base_sha256: "d".repeat(64),
      delta_target_sha256: "c".repeat(64),
      materializes_worktree: false,
    }))
    const client = new GraftClient({
      sdkTransport: {
        ...createUnusedTransport(),
        target: root,
        command,
      },
    })

    try {
      await expect(
        client.captureSqliteSnapshot(root, {
          path: "records.eidos",
          output,
          baseSnapshotToken: "prior-token",
          deltaOutput: `${output}.delta`,
          signal,
        })
      ).resolves.toEqual({
        path: "records.eidos",
        output,
        snapshotToken: "opaque-snapshot-token",
        contentFingerprint: `graft-sqlite-v1:${"a".repeat(64)}`,
        sha256: "c".repeat(64),
        bytes: 8192,
        pageCount: 2,
        changedPages: 1,
        reusedSnapshot: false,
        pageHashCacheHit: true,
        deltaOutput: `${output}.delta`,
        deltaBytes: 4204,
        deltaChangedPages: 1,
        deltaBaseContentFingerprint: `graft-sqlite-v1:${"b".repeat(64)}`,
        deltaBaseSha256: "d".repeat(64),
        deltaTargetSha256: "c".repeat(64),
        materializesWorktree: false,
      })
      expect(command).toHaveBeenCalledWith(
        "captureSqliteSnapshot",
        [
          {
            path: "records.eidos",
            output,
            baseSnapshotToken: "prior-token",
            deltaOutput: `${output}.delta`,
          },
        ],
        { signal }
      )
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("classifies fetched history from heads and their common ancestor", () => {
    const base = "a".repeat(64)
    const local = "b".repeat(64)
    const hosted = "c".repeat(64)

    expect(
      classifySyncHistory({
        state: "diverged",
        localHead: hosted,
        remoteHead: hosted,
        commonAncestor: base,
        ahead: 9,
        behind: 9,
      })
    ).toBe("up_to_date")
    expect(
      classifySyncHistory({
        state: "unknown",
        localHead: base,
        remoteHead: hosted,
        commonAncestor: base,
        ahead: 0,
        behind: 0,
      })
    ).toBe("behind")
    expect(
      classifySyncHistory({
        state: "unknown",
        localHead: local,
        remoteHead: base,
        commonAncestor: base,
        ahead: 0,
        behind: 0,
      })
    ).toBe("ahead")
    expect(
      classifySyncHistory({
        state: "ahead",
        localHead: local,
        remoteHead: hosted,
        commonAncestor: base,
        ahead: 1,
        behind: 0,
      })
    ).toBe("diverged")
  })

  it("forwards merge CAS tokens and AbortSignal and projects SDK results", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-merge-contract-")
    )
    const head = "a".repeat(64)
    const hosted = "b".repeat(64)
    const base = "c".repeat(64)
    const planToken = "d".repeat(64)
    const policyToken = "e".repeat(64)
    const nextPolicyToken = "f".repeat(64)
    const policy = { version: 1 as const, same_row_merge: true }
    const stateTokens = Array.from({ length: 12 }, (_, index) =>
      (index + 1).toString(16).repeat(64)
    )
    const requests: Array<{
      command: string
      args: unknown[]
      signal: AbortSignal | undefined
      onProgress: unknown
    }> = []
    let mutation = 0
    const merging = () => ({
      state: "merging",
      orig_head: head,
      merge_head: hosted,
      merge_base: base,
      staged_count: mutation,
      unmerged_count: Math.max(0, 6 - mutation),
      state_token: stateTokens[Math.min(mutation, stateTokens.length - 1)],
      policy_token: nextPolicyToken,
      policy_version: 1,
    })
    const transport: GraftSdkTransport = {
      ...createUnusedTransport(),
      target: root,
      command: vi.fn(async (command, args = [], options) => {
        requests.push({
          command,
          args,
          signal: options?.signal,
          onProgress: options?.onProgress,
        })
        if (command === "getMergePolicy") {
          return { policy, policy_token: policyToken, active_merge: false }
        }
        if (command === "validateMergePolicy") {
          return {
            valid: true,
            policy,
            policy_token: nextPolicyToken,
            errors: [],
          }
        }
        if (command === "setMergePolicy") {
          return {
            policy,
            policy_token: nextPolicyToken,
            active_merge: false,
          }
        }
        if (command === "planMerge") {
          return {
            kind: "three_way",
            expected_head: head,
            target: hosted,
            merge_base: base,
            staged_paths: ["clean.txt"],
            conflicted_paths: ["notes.txt", "records.eidos"],
            plan_token: planToken,
            policy_token: nextPolicyToken,
            policy_version: 1,
          }
        }
        if (command === "getMergeStatus") return merging()
        if (command === "listMergePaths") {
          return {
            state_token: stateTokens[mutation],
            items: [
              {
                path: "notes.txt",
                state: "unmerged",
                kind: "text_file",
                storage: "inline",
                has_base: true,
                has_ours: true,
                has_theirs: true,
              },
            ],
            next_cursor: null,
          }
        }
        if (command === "listMergeConflicts") {
          return {
            state_token: stateTokens[mutation],
            path: "records.eidos",
            items: [
              {
                id: "row:Docs:1",
                path: "records.eidos",
                path_kind: "sqlite_database",
                storage: "sqlite_snapshot",
                kind: "row",
                reason: "both_updated",
                status: "unresolved",
                auto_resolvable: true,
                recommended_result: "ours",
                table: "Docs",
                rowid: 1,
                base_row: ["base"],
                ours_row: ["local"],
                theirs_row: ["hosted"],
                cells: [
                  {
                    column: "title",
                    base: "base",
                    ours: "local",
                    theirs: "hosted",
                  },
                ],
              },
            ],
            next_cursor: null,
          }
        }
        if (command === "readMergeVersion") {
          const request = args[0] as { version: string }
          return {
            version: request.version,
            revision: head,
            path: "notes.txt",
            kind: "text_file",
            storage: "inline",
            content: { state: "utf8", content: "", size: 0 },
            state_token: stateTokens[mutation],
          }
        }
        if (command === "diffMergeSqlite") {
          return {
            state_token: stateTokens[mutation],
            path: "records.eidos",
            from: { version: "base", revision: base },
            to: { version: "ours", revision: head },
            diff: {
              from: base,
              to: head,
              paths: [
                {
                  path: "records.eidos",
                  change: "modified",
                  kind: "sqlite_database",
                  storage: "sqlite_snapshot",
                },
              ],
              files: [
                {
                  path: "records.eidos",
                  change: "modified",
                  kind: "sqlite_database",
                  storage: "sqlite_snapshot",
                  row_diff_available: true,
                  mode: "summary",
                  logical_status: "changed",
                  capabilities: ["schema"],
                  limitations: [],
                  schema_changes: [
                    {
                      name: "Docs",
                      entry_type: "table",
                      op: "modified",
                      sql: "CREATE TABLE Docs (id TEXT PRIMARY KEY, title TEXT)",
                      old_sql: "CREATE TABLE Docs (id TEXT PRIMARY KEY)",
                    },
                  ],
                  has_more: false,
                  telemetry: {
                    tables_considered: 1,
                    tables_scanned: 0,
                    rows_scanned: 0,
                    rows_returned: 0,
                    truncated: false,
                    response_scope: "unavailable",
                  },
                },
              ],
            },
          }
        }
        if (command === "continueMerge" || command === "abortMerge") {
          mutation += 1
          return {
            output: {},
            merge: { state: "none" },
            worktree_paths: ["records.eidos"],
          }
        }
        mutation += 1
        return {
          output: {},
          merge: merging(),
          worktree_paths:
            command === "resolveMergeCell" ? [] : ["records.eidos"],
        }
      }),
    }
    const client = new GraftClient({ sdkTransport: transport })
    const controller = new AbortController()
    const onProgress = vi.fn()

    try {
      await expect(
        client.getMergePolicy(root, { signal: controller.signal })
      ).resolves.toMatchObject({ policy, policy_token: policyToken })
      await expect(
        client.validateMergePolicy(root, policy, {
          signal: controller.signal,
        })
      ).resolves.toMatchObject({ valid: true, policy })
      await expect(
        client.setMergePolicy(root, policy, policyToken, {
          signal: controller.signal,
        })
      ).resolves.toMatchObject({ policy_token: nextPolicyToken })
      const plan = await client.planMerge(root, "origin/main", head, {
        signal: controller.signal,
      })
      expect(plan).toMatchObject({
        kind: "three_way",
        expectedHead: head,
        hostedHead: hosted,
        commonAncestor: base,
        planToken,
        policyToken: nextPolicyToken,
        policyVersion: 1,
      })
      const appliedWorktreePaths = vi.fn()
      const applied = await client.applyMerge(
        root,
        "origin/main",
        head,
        planToken,
        {
          signal: controller.signal,
          onProgress,
          onWorktreePaths: appliedWorktreePaths,
        }
      )
      expect(applied).toMatchObject({ state: "merging", localHead: head })
      expect(appliedWorktreePaths).toHaveBeenCalledWith(["records.eidos"])
      expect(client.hasExactMergeWorktreePaths()).toBe(true)
      await client.getMergeStatus(root, { signal: controller.signal })
      await client.listMergePaths(root, stateTokens[1], {
        signal: controller.signal,
      })
      const conflicts = await client.listMergeConflicts(
        root,
        "records.eidos",
        stateTokens[1],
        { signal: controller.signal }
      )
      expect(conflicts.items[0]).toMatchObject({
        table: "Docs",
        rowid: 1,
        baseRow: ["base"],
        oursRow: ["local"],
        theirsRow: ["hosted"],
        autoResolvable: true,
        recommendedResult: "ours",
        cells: [
          {
            column: "title",
            base: "base",
            local: "local",
            hosted: "hosted",
          },
        ],
      })
      const empty = await client.readMergeVersion(
        root,
        "notes.txt",
        "result",
        stateTokens[1],
        { signal: controller.signal }
      )
      expect(empty.content).toEqual({ state: "utf8", content: "", size: 0 })
      const sqliteDiff = await client.diffMergeSqlite(
        root,
        "records.eidos",
        "base",
        "ours",
        stateTokens[1],
        { mode: "summary", signal: controller.signal }
      )
      expect(sqliteDiff).toMatchObject({
        stateToken: stateTokens[1],
        path: "records.eidos",
        from: { version: "base", revision: base },
        to: { version: "ours", revision: head },
      })
      expect(sqliteDiff.diff.files[0]?.schemaChanges).toEqual([
        {
          name: "Docs",
          entryType: "table",
          operation: "modified",
          sql: "CREATE TABLE Docs (id TEXT PRIMARY KEY, title TEXT)",
          oldSql: "CREATE TABLE Docs (id TEXT PRIMARY KEY)",
        },
      ])
      await client.setMergePathResult(
        root,
        "asset.bin",
        "ours",
        stateTokens[1],
        { signal: controller.signal }
      )
      await client.resolveMergeRow(
        root,
        "records.eidos",
        "Docs",
        { id: "stable-id" },
        "theirs",
        stateTokens[2],
        { signal: controller.signal }
      )
      const cellWorktreePaths = vi.fn()
      await client.resolveMergeCell(
        root,
        "records.eidos",
        "Docs",
        { id: "stable-id" },
        "title",
        "ours",
        stateTokens[3],
        { signal: controller.signal, onWorktreePaths: cellWorktreePaths }
      )
      expect(cellWorktreePaths).toHaveBeenCalledWith([])
      await client.resolveMergeTable(
        root,
        "records.eidos",
        "Docs",
        "ours",
        stateTokens[4],
        { signal: controller.signal }
      )
      await client.unresolveMergePath(root, "records.eidos", stateTokens[5], {
        signal: controller.signal,
      })
      await client.stageMergeSqliteResult(
        root,
        "records.eidos",
        stateTokens[6],
        { signal: controller.signal }
      )
      await client.writeAndStageTextResult(
        root,
        "notes.txt",
        "combined\n",
        stateTokens[7],
        { signal: controller.signal }
      )
      await client.continueMerge(root, "Merge Hosted changes", stateTokens[8], {
        signal: controller.signal,
      })
      await client.abortMerge(root, stateTokens[9], {
        signal: controller.signal,
      })

      expect(requests.map((request) => request.command)).toEqual([
        "getMergePolicy",
        "validateMergePolicy",
        "setMergePolicy",
        "planMerge",
        "applyMerge",
        "getMergeStatus",
        "listMergePaths",
        "listMergeConflicts",
        "readMergeVersion",
        "diffMergeSqlite",
        "setMergePathResult",
        "resolveMergeRow",
        "resolveMergeCell",
        "resolveMergeTable",
        "unresolveMergePath",
        "stageMergeSqliteResult",
        "writeAndStageTextResult",
        "continueMerge",
        "abortMerge",
      ])
      expect(
        requests.every((request) => request.signal === controller.signal)
      ).toBe(true)
      expect(requests[4]?.onProgress).toBe(onProgress)
      expect(requests[3]?.args).toEqual([
        { revision: "origin/main", expectedHead: head },
      ])
      expect(requests[4]?.args).toEqual([
        { revision: "origin/main", expectedHead: head, planToken },
      ])
      expect(requests[9]?.args).toEqual([
        {
          path: "records.eidos",
          from: "base",
          to: "ours",
          mode: "summary",
          expectedStateToken: stateTokens[1],
        },
      ])
      expect(requests[11]?.args).toEqual([
        {
          path: "records.eidos",
          table: "Docs",
          identity: { id: "stable-id" },
          result: "theirs",
          expectedStateToken: stateTokens[2],
        },
      ])
      expect(requests[12]?.args).toEqual([
        {
          path: "records.eidos",
          table: "Docs",
          identity: { id: "stable-id" },
          column: "title",
          result: "ours",
          expectedStateToken: stateTokens[3],
        },
      ])
      expect(requests[13]?.args).toEqual([
        {
          path: "records.eidos",
          table: "Docs",
          result: "ours",
          expectedStateToken: stateTokens[4],
        },
      ])
      expect(requests[14]?.args).toEqual([
        {
          path: "records.eidos",
          expectedStateToken: stateTokens[5],
        },
      ])
      expect(requests[15]?.args).toEqual([
        {
          path: "records.eidos",
          expectedStateToken: stateTokens[6],
        },
      ])
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("forwards cancellation and transfer progress through hosted remote operations", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-remote-signal-")
    )
    const requests: Array<{
      command: string
      signal: AbortSignal | undefined
      onProgress: unknown
    }> = []
    const transport: GraftSdkTransport = {
      ...createUnusedTransport(),
      target: root,
      command: vi.fn(async (command, _args, options) => {
        requests.push({
          command,
          signal: options?.signal,
          onProgress: options?.onProgress,
        })
        return {}
      }),
    }
    const client = new GraftClient({ sdkTransport: transport })
    const controller = new AbortController()
    const onProgress = vi.fn()

    try {
      await client.fetch(root, { signal: controller.signal, onProgress })
      await client.pull(root, { signal: controller.signal, onProgress })
      await client.push(root, undefined, {
        signal: controller.signal,
        onProgress,
      })

      expect(requests).toEqual([
        { command: "fetch", signal: controller.signal, onProgress },
        { command: "pull", signal: controller.signal, onProgress },
        { command: "push", signal: controller.signal, onProgress },
      ])
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("rejects non-official product remotes before invoking the SDK", async () => {
    const client = new GraftClient({ sdkTransport: createUnusedTransport() })
    await expect(
      client.configureOfficialRemote(
        "/tmp/space",
        "s3://bucket/space",
        "secret"
      )
    ).rejects.toThrow("only the official")
  })

  it("reasserts origin/main when an existing official origin is configured", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-official-upstream-")
    )
    const storedRemoteUrl =
      "https://sync-staging.eidos.space/u-alice/existing-space"
    const remoteUrl = `graft+${storedRemoteUrl}`
    const controller = new AbortController()
    const command = vi.fn(async (name: string) => {
      if (name === "listRemotes") {
        return { remotes: [{ name: "origin", url: storedRemoteUrl }] }
      }
      if (name === "configureRemote") return {}
      throw new Error(`Unexpected Graft SDK command: ${name}`)
    })
    const client = new GraftClient({
      syncRemoteOrigin: "https://sync-staging.eidos.space",
      sdkTransport: {
        ...createUnusedTransport(),
        command,
      },
    })

    try {
      await client.configureOfficialRemote(root, remoteUrl, "secret", {
        signal: controller.signal,
      })

      expect(command).toHaveBeenNthCalledWith(
        2,
        "configureRemote",
        [
          {
            name: "origin",
            url: storedRemoteUrl,
            bearerToken: "secret",
            upstreamBranch: "main",
          },
        ],
        { signal: controller.signal }
      )
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("allows only the selected environment's official repository origin", () => {
    const staging = EIDOS_LITE_SERVICE_ENVIRONMENTS.staging.syncRemoteOrigin
    const production =
      EIDOS_LITE_SERVICE_ENVIRONMENTS.production.syncRemoteOrigin

    expect(
      isOfficialRemoteUrl(
        "https://sync-staging.eidos.space/u-alice/project",
        staging
      )
    ).toBe(true)
    expect(
      isOfficialRemoteUrl(
        "graft+https://sync.eidos.space/u-alice/project",
        production
      )
    ).toBe(true)
    expect(
      isOfficialRemoteUrl("https://sync.eidos.space/u-alice/project", staging)
    ).toBe(false)
    expect(
      isOfficialRemoteUrl(
        "https://token@sync-staging.eidos.space/u-alice/project",
        staging
      )
    ).toBe(false)
    expect(
      isOfficialRemoteUrl(
        "https://sync-staging.eidos.space/u-alice/project?token=secret",
        staging
      )
    ).toBe(false)
  })

  it("uses status paths without running a whole-Space diff during inspection", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-inspect-")
    )
    await fs.mkdir(path.join(root, ".graft"))
    const commands: string[] = []
    const transport: GraftSdkTransport = {
      target: root,
      open: vi.fn(async () => undefined),
      reopen: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      command: vi.fn(async (command) => {
        commands.push(command)
        if (command === "sdkVersion") {
          return "0.3.21"
        }
        if (command === "statusIncremental") {
          return {
            generation: 1,
            change_token: "token-1",
            status: {
              dirty: true,
              current_head: "local-head",
              ahead: 1,
              behind: 0,
              upstream_status: {
                remote: "origin",
                branch: "main",
                local: "local-head",
                remote_target: "cloud-head",
                common_ancestor: "base-head",
                ahead: 1,
                behind: 0,
                state: "ahead",
              },
              paths: Array.from({ length: 1_000 }, (_, index) => ({
                path: `file-${index}.txt`,
                change: "modified",
              })),
              path_diagnostics: [
                {
                  path: "broken.eidos",
                  status: "corrupt",
                  operation: "status",
                  protected_by_index: true,
                  message: "SQLite integrity check failed",
                },
              ],
            },
            telemetry: {
              status_cache_hit: false,
              persistent_snapshot_hit: true,
              persistent_snapshot_saved: false,
              stability_retries: 1,
            },
          }
        }
        throw new Error(`Unexpected Graft command: ${command}`)
      }),
      revisionTextDiff: unusedRevisionTextDiff,
      clone: vi.fn(async () => undefined),
    }
    const client = new GraftClient({ sdkTransport: transport })

    try {
      await expect(client.inspectSpace(root)).resolves.toMatchObject({
        initialized: true,
        clean: false,
        changedPaths: 1_000,
        pathDiagnostics: [
          {
            path: "broken.eidos",
            status: "corrupt",
            operation: "status",
            protectedByIndex: true,
            message: "SQLite integrity check failed",
          },
        ],
        sync: {
          state: "diverged",
          localHead: "local-head",
          remoteHead: "cloud-head",
          commonAncestor: "base-head",
          ahead: 1,
          behind: 0,
        },
      })
      expect(commands).toEqual(["sdkVersion", "statusIncremental"])
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("reads history metadata and Remote URLs without scanning repository status", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-metadata-apis-")
    )
    const commands: string[] = []
    const localHead = "a".repeat(64)
    const remoteHead = "b".repeat(64)
    const transport: GraftSdkTransport = {
      target: root,
      open: vi.fn(async () => undefined),
      reopen: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      command: vi.fn(async (command) => {
        commands.push(command)
        if (command === "repositoryMetadata") {
          return {
            current_head: localHead,
            current_branch: "main",
            upstream: { remote: "origin", branch: "main" },
            upstream_target: remoteHead,
            telemetry: { paths_examined: 0 },
          }
        }
        if (command === "historySummaries") {
          return {
            commits: [
              {
                id: localHead,
                parents: [],
                message: "Local checkpoint",
                timestamp_ms: 1_700_000_000_000,
                path_changes: { added: 0, modified: 1, deleted: 0 },
                path_counts_complete: true,
                tables: [],
                changed_tables: 0,
              },
            ],
            has_more: false,
            next_cursor: null,
            telemetry: { paths_examined: 0 },
          }
        }
        if (command === "commitDetails") {
          return {
            id: remoteHead,
            parents: [],
            message: "Hosted checkpoint",
            timestamp_ms: 1_700_000_001_000,
            changes: [],
            tables: [],
            changed_tables: 0,
          }
        }
        if (command === "listRemotes") {
          return {
            remotes: [
              {
                name: "origin",
                kind: "http",
                url: "https://sync-staging.eidos.space/u-alice/project",
              },
            ],
            telemetry: { paths_examined: 0 },
          }
        }
        throw new Error(`Unexpected Graft command: ${command}`)
      }),
      revisionTextDiff: unusedRevisionTextDiff,
      clone: vi.fn(async () => undefined),
    }
    const client = new GraftClient({ sdkTransport: transport })

    try {
      await expect(client.history(root)).resolves.toMatchObject({
        currentHead: localHead,
        currentBranch: "main",
        commits: [
          {
            id: remoteHead,
            parent: null,
            parents: [],
          },
          {
            id: localHead,
            parent: null,
            parents: [],
            files: 1,
          },
        ],
      })
      await expect(client.remoteUrl(root)).resolves.toBe(
        "https://sync-staging.eidos.space/u-alice/project"
      )
      expect(commands).toEqual([
        "repositoryMetadata",
        "historySummaries",
        "commitDetails",
        "listRemotes",
      ])
      expect(commands).not.toContain("status")
      expect(commands).not.toContain("statusIncremental")
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("returns the durable checkpoint id without a follow-up status read", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-commit-result-")
    )
    const commands: string[] = []
    const transport = createUnusedTransport()
    transport.command = vi.fn(async (command) => {
      commands.push(command)
      if (command === "commit") {
        return { commit: { id: "b".repeat(64) } }
      }
      throw new Error(`Unexpected Graft command: ${command}`)
    })
    const client = new GraftClient({ sdkTransport: transport })

    try {
      await expect(client.commit(root, "Fast checkpoint")).resolves.toEqual({
        id: "b".repeat(64),
      })
      expect(commands).toEqual(["commit"])
      expect(commands).not.toContain("statusIncremental")
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("retries one incremental status read after a repository stale race", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-stale-status-")
    )
    let statusCalls = 0
    const transport: GraftSdkTransport = {
      target: root,
      open: vi.fn(async () => undefined),
      reopen: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      command: vi.fn(async (command) => {
        if (command !== "statusIncremental") {
          throw new Error(`Unexpected Graft command: ${command}`)
        }
        statusCalls += 1
        if (statusCalls === 1) {
          throw Object.assign(new Error("repository changed during status"), {
            code: "GRAFT_SDK_REPOSITORY_STALE",
          })
        }
        return {
          generation: 2,
          change_token: "stable-token",
          status: { dirty: false, paths: [] },
          telemetry: {
            status_cache_hit: false,
            persistent_snapshot_hit: false,
            persistent_snapshot_saved: true,
            stability_retries: 1,
          },
        }
      }),
      revisionTextDiff: unusedRevisionTextDiff,
      clone: vi.fn(async () => undefined),
    }
    const client = new GraftClient({ sdkTransport: transport })

    try {
      await expect(client.status(root)).resolves.toMatchObject({
        dirty: false,
        generation: 2,
        changeToken: "stable-token",
        stabilityRetries: 1,
      })
      expect(statusCalls).toBe(2)
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("trusts a clean Graft status when stale staged metadata remains", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-clean-staged-metadata-")
    )
    const transport = createUnusedTransport()
    transport.command = vi.fn(async (command) => {
      if (command !== "statusIncremental") {
        throw new Error(`Unexpected Graft command: ${command}`)
      }
      return {
        generation: 25,
        change_token: "clean-token",
        status: {
          dirty: false,
          has_staged_changes: true,
          staged: ["docs/restored.md"],
          paths: [],
        },
      }
    })
    const client = new GraftClient({ sdkTransport: transport })

    try {
      await expect(client.status(root)).resolves.toMatchObject({
        dirty: false,
        changedPaths: 0,
        paths: [],
      })
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("treats staged path changes as dirty even when the worktree is clean", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-staged-path-change-")
    )
    const transport = createUnusedTransport()
    transport.command = vi.fn(async (command) => {
      if (command !== "statusIncremental") {
        throw new Error(`Unexpected Graft command: ${command}`)
      }
      return {
        generation: 26,
        change_token: "staged-rename-token",
        status: {
          dirty: false,
          has_staged_changes: true,
          paths: [
            {
              path: "docs/renamed.md",
              previous_path: "docs/original.md",
              staged_change: "renamed",
              kind: "text_file",
              storage: "inline",
            },
          ],
        },
      }
    })
    const client = new GraftClient({ sdkTransport: transport })

    try {
      await expect(client.status(root)).resolves.toMatchObject({
        dirty: true,
        changedPaths: 1,
        paths: ["docs/renamed.md"],
        changes: [
          {
            path: "docs/renamed.md",
            previousPath: "docs/original.md",
            change: "renamed",
          },
        ],
      })
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("hydrates commit paths and one selected diff without loading full commit details", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-history-apis-")
    )
    const commands: string[] = []
    let diffOptions: Record<string, unknown> | undefined
    const transport: GraftSdkTransport = {
      target: root,
      open: vi.fn(async () => undefined),
      reopen: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      command: vi.fn(async (command, args) => {
        commands.push(command)
        if (command === "commitChangedPaths") {
          return {
            revision: "b".repeat(64),
            parent: "a".repeat(64),
            paths: [
              {
                path: "data.eidos",
                previous_path: "archive/data.eidos",
                change: "renamed",
                kind: "sqlite_database",
                storage: "sqlite_snapshot",
              },
            ],
            has_more: false,
            next_cursor: null,
          }
        }
        if (command === "diffPaths") {
          diffOptions = args[0] as Record<string, unknown>
          return {
            paths: [
              {
                path: "data.eidos",
                diff: {
                  paths: [
                    {
                      path: "data.eidos",
                      change: "modified",
                      kind: "sqlite_database",
                    },
                  ],
                  files: [],
                },
              },
            ],
            has_more: false,
            next_cursor: null,
          }
        }
        throw new Error(`Unexpected Graft command: ${command}`)
      }),
      revisionTextDiff: unusedRevisionTextDiff,
      clone: vi.fn(async () => undefined),
    }
    const client = new GraftClient({ sdkTransport: transport })

    try {
      const revision = "b".repeat(64)
      await expect(
        client.revisionChanges(root, revision)
      ).resolves.toMatchObject({
        from: "a".repeat(64),
        to: revision,
        paths: [
          {
            path: "data.eidos",
            previousPath: "archive/data.eidos",
            change: "renamed",
          },
        ],
        files: [],
      })
      await expect(
        client.pathDiff(root, "data.eidos", {
          from: "a".repeat(64),
          to: revision,
          table: "Customers",
        })
      ).resolves.toMatchObject({ paths: [{ path: "data.eidos" }] })
      expect(commands).toEqual(["commitChangedPaths", "diffPaths"])
      expect(commands).not.toContain("commitDetails")
      expect(diffOptions).toMatchObject({
        paths: ["data.eidos"],
        rows: true,
        table: "Customers",
      })
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("plans restore materialization from commit metadata without loading row diffs", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-restore-plan-")
    )
    const ancestor = "a".repeat(64)
    const middle = "b".repeat(64)
    const descendant = "c".repeat(64)
    const commands: string[] = []
    const transport = createUnusedTransport()
    transport.command = vi.fn(async (command, args) => {
      commands.push(command)
      if (command !== "commitChangedPaths") {
        throw new Error(`Unexpected Graft command: ${command}`)
      }
      const revision = (args[0] as { revision: string }).revision
      if (revision === descendant) {
        return {
          revision,
          parent: middle,
          paths: [
            {
              path: "current/data.eidos",
              previous_path: "archive/data.eidos",
              change: "renamed",
            },
            { path: "removed.txt", change: "deleted" },
          ],
          has_more: false,
          next_cursor: null,
        }
      }
      if (revision === middle) {
        return {
          revision,
          parent: ancestor,
          paths: [{ path: "notes.txt", change: "modified" }],
          has_more: false,
          next_cursor: null,
        }
      }
      throw new Error(`Unexpected revision: ${revision}`)
    })
    const client = new GraftClient({ sdkTransport: transport })

    try {
      await expect(
        client.materializationPathsBetweenRevisions(root, ancestor, descendant)
      ).resolves.toEqual([
        "archive/data.eidos",
        "current/data.eidos",
        "notes.txt",
        "removed.txt",
      ])
      expect(commands).toEqual(["commitChangedPaths", "commitChangedPaths"])
      expect(commands).not.toContain("diffPaths")
      expect(commands).not.toContain("diffSqlitePaths")
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("loads SQLite table summaries before bounded row pages", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-sqlite-pages-")
    )
    const requests: Record<string, unknown>[] = []
    const transport: GraftSdkTransport = {
      target: root,
      open: vi.fn(async () => undefined),
      reopen: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      command: vi.fn(async (command, args) => {
        if (command !== "diffSqlitePaths") {
          throw new Error(`Unexpected Graft command: ${command}`)
        }
        const options = args[0] as Record<string, unknown>
        requests.push(options)
        const rows = options.mode === "rows"
        return {
          paths: [
            {
              path: "data.eidos",
              diff: {
                current_head: "b".repeat(64),
                from: "a".repeat(64),
                to: "b".repeat(64),
                paths: [
                  {
                    path: "data.eidos",
                    change: "modified",
                    kind: "sqlite_database",
                    storage: "sqlite_snapshot",
                  },
                ],
                files: [
                  {
                    path: "data.eidos",
                    change: "modified",
                    kind: "sqlite_database",
                    storage: "sqlite_snapshot",
                    row_diff_available: true,
                    mode: rows ? "rows" : "summary",
                    logical_status: "logical_changes",
                    limitations: [],
                    ...(rows
                      ? {
                          tables: [
                            {
                              name: "Customers",
                              columns: ["name"],
                              changes: [
                                {
                                  op: "insert",
                                  rowid: 101,
                                  values: ["Ada"],
                                },
                              ],
                            },
                          ],
                          has_more: true,
                          next_cursor: "row-page-1",
                        }
                      : {
                          summaries: [
                            {
                              name: "Customers",
                              inserts: 1_000_000,
                              deletes: 0,
                              updates: 0,
                            },
                          ],
                          has_more: false,
                        }),
                  },
                ],
              },
            },
          ],
          has_more: false,
          next_cursor: null,
        }
      }),
      revisionTextDiff: unusedRevisionTextDiff,
      clone: vi.fn(async () => undefined),
    }
    const client = new GraftClient({ sdkTransport: transport })

    try {
      await expect(
        client.sqlitePathDiff(root, "data.eidos", {
          from: "a".repeat(64),
          to: "b".repeat(64),
        })
      ).resolves.toMatchObject({
        files: [
          {
            path: "data.eidos",
            tables: [
              {
                name: "Customers",
                rowChangesLoaded: false,
                summary: { inserts: 1_000_000, deletes: 0, updates: 0 },
                changes: [],
              },
            ],
          },
        ],
      })
      await expect(
        client.sqlitePathDiff(root, "data.eidos", {
          table: "Customers",
          rowAfter: "row-page-0",
          rowLimit: 100,
        })
      ).resolves.toMatchObject({
        files: [
          {
            tables: [
              {
                name: "Customers",
                rowChangesLoaded: true,
                hasMore: true,
                nextCursor: "row-page-1",
                changes: [{ op: "insert", key: { rowid: 101 } }],
              },
            ],
          },
        ],
      })
      expect(requests).toEqual([
        expect.objectContaining({
          paths: ["data.eidos"],
          mode: "summary",
          limit: 1,
        }),
        expect.objectContaining({
          paths: ["data.eidos"],
          mode: "rows",
          table: "Customers",
          rowLimit: 100,
          rowAfter: "row-page-0",
        }),
      ])
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("keeps Graft's root diff sentinel out of the Lite checkpoint contract", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-root-sqlite-diff-")
    )
    const commit = "b".repeat(64)
    const transport: GraftSdkTransport = {
      ...createUnusedTransport(),
      target: root,
      command: vi.fn(async (command, args) => {
        if (command !== "diffSqlitePaths") {
          throw new Error(`Unexpected Graft command: ${command}`)
        }
        const options = args[0] as Record<string, unknown>
        const table = typeof options.table === "string" ? options.table : null
        return {
          paths: [
            {
              path: "data.eidos",
              diff: {
                current_head: commit,
                from: "root",
                to: commit,
                paths: [
                  {
                    path: "data.eidos",
                    change: "added",
                    kind: "sqlite_database",
                    storage: "sqlite_snapshot",
                  },
                ],
                files: [
                  {
                    path: "data.eidos",
                    change: "added",
                    kind: "sqlite_database",
                    storage: "sqlite_snapshot",
                    row_diff_available: true,
                    mode: table ? "rows" : "summary",
                    limitations: [],
                    ...(table
                      ? {
                          tables: [
                            {
                              name: table,
                              columns: ["name"],
                              changes: [],
                            },
                          ],
                        }
                      : { summaries: [] }),
                  },
                ],
              },
            },
          ],
          has_more: false,
          next_cursor: null,
        }
      }),
    }
    const client = new GraftClient({ sdkTransport: transport })

    try {
      const summary = await client.sqlitePathDiff(root, "data.eidos", {
        from: null,
        to: commit,
      })
      const firstTable = await client.sqlitePathDiff(root, "data.eidos", {
        table: "Customers",
        from: summary.from,
        to: commit,
      })
      const secondTable = await client.sqlitePathDiff(root, "data.eidos", {
        table: "Orders",
        from: firstTable.from,
        to: commit,
      })

      expect([summary.from, firstTable.from, secondTable.from]).toEqual([
        null,
        null,
        null,
      ])
      expect(firstTable.to).toBe(commit)
      expect(secondTable.to).toBe(commit)
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("bounds explicit path diffs to one UI page and returns a host cursor", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-diff-page-")
    )
    let requestedPaths: string[] = []
    const allPaths = Array.from(
      { length: 250 },
      (_, index) => `file-${String(index).padStart(3, "0")}.txt`
    )
    const transport: GraftSdkTransport = {
      target: root,
      open: vi.fn(async () => undefined),
      reopen: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      command: vi.fn(async (command, args) => {
        if (command === "statusIncremental") {
          return {
            generation: 1,
            change_token: "token",
            status: {
              dirty: true,
              paths: allPaths.map((relativePath) => ({
                path: relativePath,
                change: "modified",
              })),
            },
            telemetry: { status_cache_hit: false },
          }
        }
        if (command === "diffPaths") {
          requestedPaths = (args[0] as { paths: string[] }).paths
          return {
            paths: requestedPaths.map((relativePath) => ({
              path: relativePath,
              diff: {
                paths: [{ path: relativePath, change: "modified" }],
                files: [],
              },
            })),
            has_more: false,
            next_cursor: null,
          }
        }
        throw new Error(`Unexpected Graft command: ${command}`)
      }),
      revisionTextDiff: unusedRevisionTextDiff,
      clone: vi.fn(async () => undefined),
    }
    const client = new GraftClient({ sdkTransport: transport })

    try {
      const page = await client.workingDiff(root, false, { limit: 100 })
      expect(requestedPaths).toHaveLength(100)
      expect(page).toMatchObject({
        totalPaths: 250,
        hasMore: true,
        nextCursor: "file-099.txt",
      })
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("batches ignore inspection instead of crossing the SDK boundary per path", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-ignore-batch-")
    )
    const batchSizes: number[] = []
    const transport: GraftSdkTransport = {
      target: root,
      open: vi.fn(async () => undefined),
      reopen: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      command: vi.fn(async (command, args) => {
        if (command !== "isIgnoredPaths") {
          throw new Error(`Unexpected Graft command: ${command}`)
        }
        const options = args[0] as { paths: string[] }
        batchSizes.push(options.paths.length)
        return {
          paths: options.paths.map((relativePath) => ({
            path: relativePath,
            is_ignored: relativePath.startsWith("generated/"),
            is_tracked: false,
            is_directory: false,
            has_tracked_descendants: false,
          })),
        }
      }),
      revisionTextDiff: unusedRevisionTextDiff,
      clone: vi.fn(async () => undefined),
    }
    const client = new GraftClient({ sdkTransport: transport })
    const paths = Array.from({ length: 2_001 }, (_, index) =>
      index % 2 === 0 ? `generated/${index}.txt` : `notes/${index}.txt`
    )

    try {
      const inspections = await client.inspectIgnores(root, paths)
      expect(inspections).toHaveLength(2_001)
      expect(inspections.map((inspection) => inspection.path)).toEqual(paths)
      expect(batchSizes).toEqual([1_000, 1_000, 1])
      expect(inspections.filter((item) => item.isIgnored)).toHaveLength(1_001)
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
