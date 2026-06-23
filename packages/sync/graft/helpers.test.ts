import { describe, expect, it } from "vitest"

import {
  parseGraftAudit,
  parseGraftCheckout,
  parseGraftBranches,
  parseGraftConflicts,
  parseGraftDiff,
  parseGraftInfo,
  parseGraftLog,
  parseGraftResolveConflict,
  parseGraftShow,
  parseGraftStatus,
  parseGraftTags,
  parseGraftTableLog,
  parseGraftVolumes,
} from "./helpers"

describe("parseGraftStatus (JSON)", () => {
  it("exposes git-like working tree state", () => {
    const result = parseGraftStatus(
      JSON.stringify({
        head: { type: "branch", name: "main" },
        head_target: null,
        dirty: true,
        staged: [],
        unstaged: ["app.db"],
        unstaged_changes: [{ path: "app.db", change: "modified" }],
        conflicted: [],
      })
    )

    expect(result.currentBranch).toBe("main")
    expect(result.dirty).toBe(true)
    expect(result.staged).toEqual([])
    expect(result.unstaged).toEqual(["app.db"])
    expect(result.unstagedChanges).toEqual([
      { path: "app.db", change: "modified" },
    ])
    expect(result.suggestedAction).toBe("commit")
    expect(result.workflow).toMatchObject({
      state: "dirty",
      primaryAction: "commit",
      allowedActions: ["check_remote", "commit", "open_changes"],
      mutatesWorktree: false,
      statusLabel: "Uncommitted changes",
    })
  })

  it("does not infer an ahead commit from an upstream branch alone", () => {
    const result = parseGraftStatus(
      JSON.stringify({
        head: { type: "branch", name: "main" },
        head_target: "64ad2e52939b",
        dirty: false,
        staged: [],
        unstaged: [],
        conflicted: [],
        branches: [
          {
            name: "main",
            target: "64ad2e52939b",
            current: true,
            upstream: { remote: "origin", branch: "main" },
          },
        ],
        remotes: [{ name: "origin" }],
        upstream: { remote: "origin", branch: "main" },
      })
    )

    expect(result.currentBranch).toBe("main")
    expect(result.upstream).toEqual({ remote: "origin", branch: "main" })
    expect(result.status).toBe("up_to_date")
    expect(result.ahead).toBe(0)
    expect(result.behind).toBe(0)
    expect(result.commitDiff).toBe(0)
    expect(result.suggestedAction).toBeUndefined()
    expect(result.workflow).toMatchObject({
      state: "clean",
      allowedActions: ["check_remote"],
      statusLabel: "Up to date",
    })
  })

  it("uses explicit ahead and behind counts when JSON status provides them", () => {
    const result = parseGraftStatus(
      JSON.stringify({
        head: { type: "branch", name: "main" },
        head_target: "64ad2e52939b",
        dirty: false,
        staged: [],
        unstaged: [],
        conflicted: [],
        upstream: { remote: "origin", branch: "main" },
        ahead: 2,
        behind: 1,
      })
    )

    expect(result.status).toBe("diverged")
    expect(result.ahead).toBe(2)
    expect(result.behind).toBe(1)
    expect(result.commitDiff).toBe(1)
    expect(result.suggestedAction).toBe("merge")
    expect(result.workflow).toMatchObject({
      state: "diverged",
      primaryAction: "merge",
      allowedActions: ["check_remote", "merge"],
      mutatesWorktree: true,
      statusLabel: "2 commits ahead, 1 commit behind",
    })
  })

  it("blocks remote-mutating actions until local worktree changes are handled", () => {
    const result = parseGraftStatus(
      JSON.stringify({
        head: { type: "branch", name: "main" },
        head_target: "64ad2e52939b",
        dirty: true,
        staged: [],
        unstaged: ["app.db"],
        conflicted: [],
        upstream: { remote: "origin", branch: "main" },
        ahead: 1,
        behind: 2,
      })
    )

    expect(result.status).toBe("diverged")
    expect(result.suggestedAction).toBe("commit")
    expect(result.workflow).toMatchObject({
      state: "dirty",
      primaryAction: "commit",
      allowedActions: ["check_remote", "commit", "open_changes"],
      mutatesWorktree: false,
      statusLabel: "Uncommitted changes, 1 commit ahead, 2 commits behind",
    })
  })

  it("marks a conflict-free merge as ready to complete", () => {
    const result = parseGraftStatus(
      JSON.stringify({
        head: { type: "branch", name: "main" },
        head_target: "64ad2e52939b",
        merge_head: "8d7abf12900c",
        dirty: false,
        staged: ["app.db"],
        unstaged: [],
        conflicted: [],
      })
    )

    expect(result.mergeHead).toBe("8d7abf12900c")
    expect(result.isMergeInProgress).toBe(true)
    expect(result.canCompleteMerge).toBe(true)
    expect(result.suggestedAction).toBe("complete_merge")
    expect(result.workflow).toMatchObject({
      state: "merge_ready",
      primaryAction: "complete_merge",
      allowedActions: ["complete_merge", "abort_merge", "open_changes"],
      statusLabel: "Merge ready",
    })
  })

  it("parses structured conflict analysis from JSON status", () => {
    const result = parseGraftStatus(
      JSON.stringify({
        head: { type: "branch", name: "main" },
        merge_head: "8d7abf12900c",
        dirty: true,
        staged: [],
        unstaged: [],
        conflicted: ["app.db"],
        conflict_analysis: {
          path: "app.db",
          available: true,
          can_auto_merge: false,
          ours_changes: 1,
          theirs_changes: 1,
          apply_changes: 1,
          opaque_changes: 0,
          blocked_reasons: ["row_conflicts"],
          row_conflicts: [
            {
              table: "repo_merge",
              columns: ["id", "name"],
              rowid: 2,
              ours: "insert",
              theirs: "insert",
              base_row: null,
              ours_row: [2, "ours"],
              theirs_row: [2, "theirs"],
            },
          ],
          schema_conflicts: [],
        },
      })
    )

    expect(result.conflictAnalysis).toEqual({
      path: "app.db",
      available: true,
      canAutoMerge: false,
      oursChanges: 1,
      theirsChanges: 1,
      applyChanges: 1,
      opaqueChanges: 0,
      blockedReasons: ["row_conflicts"],
      rowConflicts: [
        {
          table: "repo_merge",
          columns: ["id", "name"],
          rowid: 2,
          ours: "insert",
          theirs: "insert",
          baseRow: null,
          oursRow: [2, "ours"],
          theirsRow: [2, "theirs"],
        },
      ],
      schemaConflicts: [],
    })
  })

  it("marks an auto-mergeable conflicted database as ready to complete", () => {
    const result = parseGraftStatus(
      JSON.stringify({
        head: { type: "branch", name: "main" },
        merge_head: "8d7abf12900c",
        dirty: true,
        staged: [],
        unstaged: [],
        conflicted: ["app.db"],
        conflict_analysis: {
          path: "app.db",
          available: true,
          can_auto_merge: true,
          ours_changes: 7,
          theirs_changes: 7,
          apply_changes: 8,
          opaque_changes: 0,
          blocked_reasons: [],
          row_conflicts: [],
          schema_conflicts: [],
        },
      })
    )

    expect(result.isMergeInProgress).toBe(true)
    expect(result.conflicted).toEqual(["app.db"])
    expect(result.canCompleteMerge).toBe(true)
    expect(result.suggestedAction).toBe("complete_merge")
  })

  it("does not parse legacy text status output", () => {
    const result = parseGraftStatus(
      [
        "On branch main",
        "Merge in progress with 8d7abf12900c",
        "Unmerged paths:",
        "  app.db",
      ].join("\n")
    )

    expect(result.isGrafted).toBe(false)
    expect(result.workflow).toMatchObject({
      state: "not_grafted",
      allowedActions: [],
      statusLabel: "Version history not enabled",
    })
  })
})

describe("parseGraftBranches", () => {
  it("parses JSON branch output", () => {
    const result = parseGraftBranches(
      JSON.stringify({
        branches: [
          {
            name: "main",
            target: "64ad2e52939b0000",
            current: true,
            upstream: { remote: "origin", branch: "main" },
          },
        ],
        remote_branches: [
          {
            remote: "origin",
            branch: "main",
            head: "64ad2e52939b0000",
          },
        ],
      })
    )

    expect(result).toEqual([
      {
        name: "main",
        volumeId: "64ad2e52939b",
        status: "origin/main",
        isCurrent: true,
      },
      {
        name: "remotes/origin/main",
        volumeId: "64ad2e52939b",
        remote: "origin",
        status: "remote",
        isCurrent: false,
      },
    ])
  })

  it("does not parse legacy text branch output", () => {
    const result = parseGraftBranches(
      [
        "* main                     64ad2e52939b [origin/main]",
        "  feature/sync             abcdef123456",
        "  remotes/origin/main      64ad2e52939b",
      ].join("\n")
    )

    expect(result).toEqual([])
  })
})

describe("parseGraftTags", () => {
  it("parses JSON tag output", () => {
    const result = parseGraftTags(
      JSON.stringify([
        {
          name: "v1.0",
          target: "64ad2e52939b",
          object: "64ad2e52939b",
          annotated: false,
        },
      ])
    )

    expect(result).toEqual([
      {
        name: "v1.0",
        target: "64ad2e52939b",
        object: "64ad2e52939b",
        annotated: false,
      },
    ])
  })

  it("does not parse legacy text tag output", () => {
    const result = parseGraftTags(
      [
        "v1.0                     64ad2e52939b",
        "release                  fedcba654321 (annotated 111111111111)",
      ].join("\n")
    )

    expect(result).toEqual([])
  })

  it("does not parse legacy no-tags output", () => {
    expect(parseGraftTags("No tags.")).toEqual([])
  })
})

describe("parseGraftVolumes", () => {
  it("parses JSON volume list output", () => {
    const result = parseGraftVolumes(
      JSON.stringify([
        {
          id: "vid1",
          local: "local1",
          remote: "remote1",
          status: "2 r2",
          current: true,
        },
      ])
    )

    expect(result).toEqual([
      {
        id: "vid1",
        local: "local1",
        remote: "remote1",
        status: "2 r2",
        isCurrent: true,
      },
    ])
  })
})

describe("parseGraftLog (JSON)", () => {
  it("returns isEmpty for empty JSON array", () => {
    const result = parseGraftLog("[]")
    expect(result.isEmpty).toBe(true)
    expect(result.entries).toEqual([])
  })

  it("returns isEmpty for whitespace-only input", () => {
    expect(parseGraftLog("   ").isEmpty).toBe(true)
  })

  it("parses a full commit history from JSON", () => {
    const raw = JSON.stringify([
      {
        id: "abcdef1234567890",
        parent: "123456abcdef0000",
        parents: ["123456abcdef0000"],
        tree: "tree-1",
        message: "Update users",
        timestamp_ms: 1717482202003,
        changed_tables: 1,
        tables: [{ name: "users", inserts: 2, deletes: 0, updates: 1 }],
        files: {
          "db.sqlite3": {
            volume: "vol-1",
            snapshot: { page_count: 2, ranges: [{ start: 1, end: 2 }] },
          },
        },
      },
      {
        id: "123456abcdef0000",
        parent: null,
        parents: [],
        tree: "tree-0",
        message: "Initial version",
        timestamp_ms: 1717482202002,
        files: {
          "db.sqlite3": {
            volume: "vol-1",
            snapshot: { page_count: 2, ranges: [{ start: 1, end: 2 }] },
          },
        },
      },
    ])

    const result = parseGraftLog(raw)
    expect(result.isEmpty).toBe(false)
    expect(result.entries).toHaveLength(2)

    expect(result.entries[0]).toMatchObject({
      id: "abcdef1234567890",
      shortId: "abcdef123456",
      lsn: "abcdef1234567890",
      parent: "123456abcdef0000",
      parents: ["123456abcdef0000"],
      tree: "tree-1",
      files: ["db.sqlite3"],
      pages: 2,
      changed: 1,
      checkpoint: false,
      timestampMs: 1717482202003,
      message: "Update users",
      changedTables: 1,
      tables: [{ table: "users", inserts: 2, deletes: 0, updates: 1 }],
    })

    expect(result.entries[1]).toMatchObject({
      id: "123456abcdef0000",
      pages: 2,
      changed: 1,
      timestampMs: 1717482202002,
    })
  })

  it("handles input wrapped in single-column rows from better-sqlite3", () => {
    const raw = [
      {
        graft_json_log: JSON.stringify([
          {
            lsn: 2,
            page_count: 2,
            is_checkpoint: false,
            changed_pages: 1,
            segment: "abc",
          },
        ]),
      },
    ]
    const result = parseGraftLog(raw)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].lsn).toBe("2")
    expect(result.entries[0].segment).toBe("abc")
  })
})

describe("parseGraftConflicts (JSON)", () => {
  it("parses row conflict artifacts", () => {
    const result = parseGraftConflicts(
      JSON.stringify({
        merge_head: "remote-head",
        conflicts: [
          {
            id: "db.sqlite3:row:users:1",
            path: "db.sqlite3",
            kind: "row",
            reason: "row_conflict",
            status: "resolved",
            resolution: "theirs",
            table: "users",
            columns: ["id", "name"],
            rowid: 1,
            ours_op: "update",
            theirs_op: "update",
            base_row: [1, "base"],
            ours_row: [1, "ours"],
            theirs_row: [1, "theirs"],
          },
        ],
      })
    )

    expect(result).toMatchObject({
      mergeHead: "remote-head",
      isEmpty: false,
      conflicts: [
        {
          id: "db.sqlite3:row:users:1",
          path: "db.sqlite3",
          kind: "row",
          reason: "row_conflict",
          status: "resolved",
          resolution: "theirs",
          table: "users",
          columns: ["id", "name"],
          rowid: 1,
          oursOp: "update",
          theirsOp: "update",
          baseRow: [1, "base"],
          oursRow: [1, "ours"],
          theirsRow: [1, "theirs"],
        },
      ],
    })
  })

  it("parses resolve-conflict outcome", () => {
    const result = parseGraftResolveConflict(
      JSON.stringify({
        operation: "resolve_conflict",
        path: "db.sqlite3",
        resolution: "manual",
        remaining_conflicts: 0,
      })
    )

    expect(result).toMatchObject({
      operation: "resolve_conflict",
      path: "db.sqlite3",
      resolution: "manual",
      remainingConflicts: 0,
    })
  })
})

describe("parseGraftShow (JSON)", () => {
  it("parses commit metadata and schema listing", () => {
    const raw = JSON.stringify({
      id: "abcdef1234567890",
      parent: "123456abcdef0000",
      parents: ["123456abcdef0000"],
      tree: "tree-1",
      message: "Update users",
      timestamp_ms: 1717482202003,
      changed_tables: 1,
      tables: [{ name: "users", inserts: 10000, deletes: 0, updates: 0 }],
      files: {
        "db.sqlite3": {
          volume: "vol-1",
          snapshot: { page_count: 2, ranges: [{ start: 1, end: 2 }] },
        },
      },
    })

    const result = parseGraftShow(raw)
    expect(result).not.toBeNull()
    expect(result?.id).toBe("abcdef1234567890")
    expect(result?.shortId).toBe("abcdef123456")
    expect(result?.lsn).toBe("abcdef1234567890")
    expect(result?.pageCount).toBe(2)
    expect(result?.changedPages).toBeUndefined()
    expect(result?.changedTables).toBe(1)
    expect(result?.rowChanges).toBe(10000)
    expect(result?.tables).toEqual([
      { table: "users", inserts: 10000, deletes: 0, updates: 0 },
    ])
    expect(result?.checkpoint).toBe(false)
    expect(result?.message).toBe("Update users")
    expect(result?.schemas).toEqual([
      { type: "database", table: "db.sqlite3", rowCount: 2 },
    ])
  })

  it("returns null on empty input", () => {
    expect(parseGraftShow("")).toBeNull()
    expect(parseGraftShow("   ")).toBeNull()
  })

  it("handles checkpoint commit", () => {
    const raw = JSON.stringify({
      lsn: 5,
      page_count: 4,
      is_checkpoint: true,
      changed_pages: 3,
      segment: "ckp-seg",
      tables: [],
    })

    const result = parseGraftShow(raw)
    expect(result?.checkpoint).toBe(true)
    expect(result?.isEmpty).toBe(true)
  })
})

describe("parseGraftDiff (JSON)", () => {
  it("parses repository file diff", () => {
    const raw = JSON.stringify({
      from: "123456abcdef0000",
      to: "abcdef1234567890",
      files: [
        {
          path: "db.sqlite3",
          change: "modified",
          from: {
            volume: "vol-1",
            snapshot: {
              page_count: 2,
              ranges: [
                {
                  log: "log-1",
                  start: 1,
                  end: 2,
                  commits: [{ lsn: 2, commit_hash: "hash-2" }],
                },
              ],
            },
          },
          to: {
            volume: "vol-1",
            snapshot: {
              page_count: 3,
              ranges: [
                {
                  log: "log-1",
                  start: 1,
                  end: 3,
                  commits: [{ lsn: 3, commit_hash: "hash-3" }],
                },
              ],
            },
          },
        },
      ],
    })

    const result = parseGraftDiff(raw, {
      from: "123456abcdef0000",
      to: "abcdef1234567890",
      mode: "summary",
    })
    expect(result.empty).toBe(false)
    expect(result.files).toEqual([
      {
        path: "db.sqlite3",
        change: "modified",
        fromPages: 2,
        toPages: 3,
        fromState: {
          volume: "vol-1",
          snapshot: {
            pageCount: 2,
            ranges: [
              {
                log: "log-1",
                start: 1,
                end: 2,
                commits: [{ lsn: 2, commitHash: "hash-2" }],
              },
            ],
          },
        },
        toState: {
          volume: "vol-1",
          snapshot: {
            pageCount: 3,
            ranges: [
              {
                log: "log-1",
                start: 1,
                end: 3,
                commits: [{ lsn: 3, commitHash: "hash-3" }],
              },
            ],
          },
        },
        fromLsn: 2,
        toLsn: 3,
      },
    ])
    expect(result.tables).toEqual([
      { table: "db.sqlite3", inserts: 0, deletes: 0, updates: 1 },
    ])
    expect(result.rows).toEqual([])
  })

  it("parses repository row-level diff files", () => {
    const raw = JSON.stringify({
      from: "abc",
      to: "def",
      files: [
        {
          path: "db.sqlite3",
          change: "modified",
          row_diff_available: true,
          tables: [
            {
              name: "tb_users",
              columns: ["id", "name"],
              changes: [
                { op: "insert", rowid: 2, values: [2, "Bob"] },
                {
                  op: "update",
                  rowid: 1,
                  old_values: [1, "Alice"],
                  values: [1, "Alicia"],
                },
              ],
            },
          ],
          opaque_changes: [
            {
              table: "fts_docs_data",
              change: "modified",
              reason: "fts_shadow_table",
              owner: "fts_docs",
            },
          ],
        },
      ],
    })

    const result = parseGraftDiff(raw, {
      from: "abc",
      to: "def",
      mode: "rows",
    })

    expect(result.empty).toBe(false)
    expect(result.files[0]).toMatchObject({
      path: "db.sqlite3",
      change: "modified",
      rowDiffAvailable: true,
    })
    expect(result.tables).toEqual([
      { table: "tb_users", inserts: 1, deletes: 0, updates: 1 },
    ])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toMatchObject({
      table: "tb_users",
      op: "insert",
      rowid: 2,
      columns: ["id", "name"],
      values: [2, "Bob"],
    })
    expect(result.rows[1]).toMatchObject({
      table: "tb_users",
      op: "update",
      rowid: 1,
      columns: ["id", "name"],
      before: [1, "Alice"],
      after: [1, "Alicia"],
    })
    expect(result.opaqueChanges).toEqual([
      {
        table: "fts_docs_data",
        change: "modified",
        reason: "fts_shadow_table",
        owner: "fts_docs",
      },
    ])
  })

  it("parses summary mode", () => {
    const raw = JSON.stringify({
      from_lsn: 1,
      to_lsn: 3,
      tables: [{ name: "users", inserts: 2, deletes: 0, updates: 0 }],
    })

    const result = parseGraftDiff(raw, { from: "1", to: "3", mode: "summary" })
    expect(result.empty).toBe(false)
    expect(result.tables).toEqual([
      { table: "users", inserts: 2, deletes: 0, updates: 0 },
    ])
    expect(result.rows).toEqual([])
  })

  it("parses row-level diff with values array", () => {
    const raw = JSON.stringify({
      from_lsn: 1,
      to_lsn: 3,
      tables: [
        {
          name: "users",
          columns: ["id", "name", "email"],
          changes: [
            {
              op: "insert",
              rowid: 1,
              values: [null, "Alice", "alice@example.com"],
            },
            {
              op: "insert",
              rowid: 2,
              values: [null, "Bob", "bob@example.com"],
            },
          ],
        },
      ],
    })

    const result = parseGraftDiff(raw, { from: "1", to: "3", mode: "rows" })
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toMatchObject({
      table: "users",
      op: "insert",
      rowid: 1,
    })
    expect(result.rows[0].values).toEqual([null, "Alice", "alice@example.com"])
    expect(result.rows[0].columns).toEqual(["id", "name", "email"])
  })

  it("captures UPDATE with old_values", () => {
    const raw = JSON.stringify({
      from_lsn: 1,
      to_lsn: 4,
      tables: [
        {
          name: "users",
          columns: ["id", "name", "email"],
          changes: [
            {
              op: "update",
              rowid: 1,
              values: [1, "Alice", "alice_new@example.com"],
              old_values: [1, "Alice", "alice@example.com"],
            },
          ],
        },
      ],
    })

    const result = parseGraftDiff(raw, { from: "1", to: "4", mode: "rows" })
    expect(result.rows[0]).toMatchObject({
      table: "users",
      op: "update",
      rowid: 1,
    })
    expect(result.rows[0].values).toEqual([1, "Alice", "alice_new@example.com"])
    expect(result.rows[0].before).toEqual([1, "Alice", "alice@example.com"])
    expect(result.rows[0].after).toEqual([1, "Alice", "alice_new@example.com"])
  })

  it("preserves opaque changes when row diff skips virtual tables", () => {
    const raw = JSON.stringify({
      from_lsn: 2,
      to_lsn: 3,
      tables: [],
      opaque_changes: [
        {
          name: "fts_docs_data",
          change: "modified",
          reason: "fts_shadow_table",
          owner: "fts_docs",
        },
      ],
    })

    const result = parseGraftDiff(raw, { from: "2", to: "3", mode: "rows" })
    expect(result.empty).toBe(false)
    expect(result.tables).toEqual([])
    expect(result.rows).toEqual([])
    expect(result.opaqueChanges).toEqual([
      {
        table: "fts_docs_data",
        change: "modified",
        reason: "fts_shadow_table",
        owner: "fts_docs",
      },
    ])
  })

  it("handles empty diff (no changes)", () => {
    const raw = JSON.stringify({ from_lsn: 1, to_lsn: 1, tables: [] })
    const result = parseGraftDiff(raw, { from: "1", to: "1", mode: "summary" })
    expect(result.empty).toBe(true)
    expect(result.tables).toEqual([])
  })
})

describe("parseGraftTableLog", () => {
  it("parses JSON array with timestamps and summaries", () => {
    const raw = JSON.stringify([
      {
        id: "abcdef1234567890",
        timestamp_ms: 1717482202000,
        message: "Update users",
        files: {
          "db.sqlite3": {
            volume: "vol-1",
            snapshot: { page_count: 2, ranges: [{ start: 1, end: 2 }] },
          },
        },
      },
      {
        id: "123456abcdef0000",
        timestamp_ms: 1717482202003,
        message: "Initial version",
        files: {},
      },
    ])

    const result = parseGraftTableLog(raw, "users")
    expect(result.table).toBe("users")
    expect(result.isEmpty).toBe(false)
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0]).toMatchObject({
      id: "abcdef1234567890",
      shortId: "abcdef123456",
      files: ["db.sqlite3"],
      lsn: "abcdef1234567890",
      timestampMs: 1717482202000,
      summary: "Update users",
      detail: "db.sqlite3",
    })
    expect(result.entries[1].summary).toBe("Initial version")
  })

  it("returns isEmpty for empty array", () => {
    const result = parseGraftTableLog("[]", "orders")
    expect(result.isEmpty).toBe(true)
    expect(result.entries).toEqual([])
  })
})

describe("parseGraftCheckout", () => {
  it("parses JSON checkout output", () => {
    const result = parseGraftCheckout(
      JSON.stringify({
        operation: "checkout",
        target: "abcdef1234567890",
      })
    )
    expect(result.lsn).toBe("abcdef1234567890")
    expect(result.revision).toBe("abcdef1234567890")
  })

  it("does not extract fields from legacy checkout text", () => {
    const result = parseGraftCheckout("HEAD detached at abcdef123456")
    expect(result.rawMessage).toBe("HEAD detached at abcdef123456")
    expect(result.lsn).toBeUndefined()
    expect(result.revision).toBeUndefined()
  })

  it("does not parse legacy LSN checkout text", () => {
    const raw =
      "Checked out LSN 2 into new Volume 5rMKB5Dhd2-2zhGKae4fGRDe (local log: 74gh2Rf2Xi-2fd4LpCX4Hnc7)"
    const result = parseGraftCheckout(raw)
    expect(result.rawMessage).toBe(raw)
    expect(result.lsn).toBeUndefined()
    expect(result.volumeId).toBeUndefined()
    expect(result.localLogId).toBeUndefined()
  })

  it("falls back to rawMessage when format is unknown", () => {
    const result = parseGraftCheckout("unknown output")
    expect(result.lsn).toBeUndefined()
    expect(result.volumeId).toBeUndefined()
    expect(result.rawMessage).toBe("unknown output")
  })
})

describe("parseGraftInfo", () => {
  it("parses JSON volume info output", () => {
    const result = parseGraftInfo(
      JSON.stringify({
        vid: "vid1",
        local: "local1",
        remote: "remote1",
        snapshot_pages: 3,
        snapshot_size_bytes: 12288,
      })
    )

    expect(result).toEqual({
      volumeId: "vid1",
      localLog: "local1",
      remoteLog: "remote1",
      snapshotPages: 3,
      snapshotSize: "12288",
      rawMessage:
        '{"vid":"vid1","local":"local1","remote":"remote1","snapshot_pages":3,"snapshot_size_bytes":12288}',
    })
  })
})

describe("parseGraftAudit", () => {
  it("parses JSON volume audit output", () => {
    const result = parseGraftAudit(
      JSON.stringify({
        local_pages: 2,
        total_pages: 3,
        percentage: 66.67,
        checksum: "abc",
        needs_hydrate: true,
      })
    )

    expect(result).toEqual({
      localPages: 2,
      totalPages: 3,
      percentage: 66.67,
      checksum: "abc",
      needsHydrate: true,
      rawMessage:
        '{"local_pages":2,"total_pages":3,"percentage":66.67,"checksum":"abc","needs_hydrate":true}',
    })
  })
})
