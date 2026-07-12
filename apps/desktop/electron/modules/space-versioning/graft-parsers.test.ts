// @vitest-environment node

import { describe, expect, it } from "vitest"

import {
  parseGraftCommit,
  parseGraftCommitResult,
  parseGraftConflicts,
  parseGraftDiff,
  parseGraftLog,
  parseGraftRemoteMutation,
  parseGraftRemotes,
  parseGraftRestorePaths,
  parseGraftRestoreSource,
  parseGraftRestoreVersionSource,
  parseGraftResolveConflict,
  parseGraftStatus,
  parseGraftSyncResult,
} from "./graft-parsers"

describe("Graft v0.5 JSON parsers", () => {
  it("prefers status.paths and treats staged-only work as dirty", () => {
    const status = parseGraftStatus(
      {
        current_head: "head-1",
        current_branch: "main",
        repository_format_version: 2,
        dirty: false,
        work_in_progress: true,
        counts: { unstaged: 0, staged: 1, conflicted: 0 },
        paths: [
          {
            path: "note.md",
            kind: "text_file",
            storage: "inline",
            index_status: "modified",
            worktree_status: "none",
            code: "M ",
            staged_change: "modified",
            conflicted: false,
          },
        ],
        staged_changes: [
          {
            path: "note.md",
            change: "modified",
            kind: "text_file",
            storage: "inline",
          },
        ],
      },
      "notes"
    )

    expect(status).toMatchObject({
      spaceId: "notes",
      enabled: true,
      currentHead: "head-1",
      currentBranch: "main",
      dirty: true,
      hasStagedChanges: true,
    })
    expect(status.paths).toEqual([
      {
        path: "note.md",
        kind: "text_file",
        storage: "inline",
        state: "modified",
        indexState: "modified",
        worktreeState: "none",
        code: "M ",
        staged: true,
        conflicted: false,
      },
    ])
  })

  it("falls back to detailed status arrays when paths is absent", () => {
    const status = parseGraftStatus(
      {
        head: { type: "branch", name: "main" },
        head_target: null,
        unstaged_changes: [
          {
            path: "assets/image.png",
            change: "untracked",
            kind: "binary_file",
            storage: "external",
          },
        ],
      },
      "media"
    )

    expect(status.currentBranch).toBe("main")
    expect(status.counts.unstaged).toBe(1)
    expect(status.paths[0]).toMatchObject({
      path: "assets/image.png",
      state: "untracked",
      kind: "binary_file",
      storage: "external",
    })
  })

  it("maps the real Graft v0.5 unmerged status payload to a conflict", () => {
    const status = parseGraftStatus(
      {
        current_head: "6a2964d19bce2efb",
        current_branch: "main",
        repository_format_version: 2,
        head: { type: "branch", name: "main" },
        head_target: "6a2964d19bce2efb",
        merge_head: "9e4a5ff1451e70a",
        orig_head: "6a2964d19bce2efb",
        dirty: false,
        has_unstaged_changes: false,
        has_staged_changes: false,
        has_conflicts: true,
        work_in_progress: true,
        counts: { unstaged: 0, staged: 0, conflicted: 1 },
        paths: [
          {
            path: "note.md",
            kind: "text_file",
            storage: "inline",
            index_status: "unmerged",
            worktree_status: "unmerged",
            code: "UU",
            conflicted: true,
          },
        ],
        unstaged: [],
        staged: [],
        conflicted: ["note.md"],
        conflicted_changes: [
          { path: "note.md", kind: "text_file", storage: "inline" },
        ],
      },
      "notes"
    )

    expect(status).toMatchObject({
      mergeHead: "9e4a5ff1451e70a",
      dirty: true,
      hasUnstagedChanges: false,
      hasStagedChanges: false,
      hasConflicts: true,
      counts: { unstaged: 0, staged: 0, conflicted: 1 },
    })
    expect(status.paths).toEqual([
      {
        path: "note.md",
        kind: "text_file",
        storage: "inline",
        state: "conflicted",
        indexState: "conflicted",
        worktreeState: "conflicted",
        code: "UU",
        staged: false,
        conflicted: true,
      },
    ])
  })

  it("infers a conflict from unmerged states when the boolean is absent", () => {
    const status = parseGraftStatus(
      {
        paths: [
          {
            path: "note.md",
            index_status: "unmerged",
            worktree_status: "unmerged",
          },
        ],
      },
      "notes"
    )

    expect(status.hasConflicts).toBe(true)
    expect(status.counts.conflicted).toBe(1)
    expect(status.paths[0]).toMatchObject({
      state: "conflicted",
      staged: false,
      conflicted: true,
    })
  })

  it("preserves remote and upstream state from repository status", () => {
    const status = parseGraftStatus(
      {
        current_head: "head-2",
        current_branch: "main",
        remotes: [
          { name: "origin", config: { type: "fs", root: "/tmp/remote" } },
        ],
        upstream_status: {
          remote: "origin",
          branch: "main",
          local: "head-2",
          remote_target: "head-1",
          ahead: 1,
          behind: 0,
          state: "ahead",
        },
        ahead: 1,
        behind: 0,
      },
      "notes"
    )

    expect(status).toMatchObject({
      remoteNames: ["origin"],
      ahead: 1,
      behind: 0,
      upstream: {
        remote: "origin",
        branch: "main",
        ahead: 1,
        behind: 0,
        state: "ahead",
      },
    })
  })

  it("parses remote lists, mutations, and sync summaries", () => {
    expect(
      parseGraftRemotes({
        current_head: "head-1",
        current_branch: "main",
        remotes: [
          {
            name: "origin",
            url: "fs:///tmp/Eidos Remote",
            config: { type: "fs", root: "/tmp/Eidos Remote" },
          },
        ],
      })
    ).toEqual({
      currentHead: "head-1",
      currentBranch: "main",
      remotes: [{ name: "origin", url: "fs:///tmp/Eidos Remote" }],
    })
    expect(
      parseGraftRemoteMutation({
        operation: "remote_add",
        remote: { name: "origin", url: "memory" },
      })
    ).toEqual({ name: "origin", url: "memory" })
    expect(
      parseGraftSyncResult(
        {
          operation: "push",
          remote: "origin",
          current_branch: "main",
          commits: 2,
          forced: false,
          branches: [
            {
              remote_branch: "main",
              local_branch: "main",
              commits: 2,
            },
          ],
        },
        "push"
      )
    ).toEqual({
      operation: "push",
      remote: "origin",
      branch: "main",
      commits: 2,
      forced: false,
    })
  })

  it("parses conflict paths and file-level resolution results", () => {
    expect(
      parseGraftConflicts({
        current_head: "head-2",
        current_branch: "main",
        merge_head: "remote-2",
        paths: [
          {
            path: "notes/a b.md",
            kind: "text_file",
            storage: "inline",
            status: "unresolved",
            total: 1,
            unresolved: 1,
            resolved: 0,
          },
        ],
      })
    ).toEqual({
      currentHead: "head-2",
      currentBranch: "main",
      mergeHead: "remote-2",
      paths: [
        {
          path: "notes/a b.md",
          kind: "text_file",
          storage: "inline",
          status: "unresolved",
          total: 1,
          unresolved: 1,
          resolved: 0,
        },
      ],
    })
    expect(
      parseGraftResolveConflict({
        operation: "resolve_conflict",
        path: "notes/a b.md",
        resolution: "theirs",
        remaining_conflicts: 0,
      })
    ).toEqual({
      path: "notes/a b.md",
      resolution: "theirs",
      remainingConflicts: 0,
    })
  })

  it("normalizes log commits and their parent graph", () => {
    const history = parseGraftLog({
      current_head: "commit-2",
      current_branch: "main",
      next_cursor: "commit-2",
      has_more: true,
      commits: [
        {
          id: "commit-2",
          parent: "commit-1",
          parents: ["commit-1", "merge-parent"],
          tree: "tree-2",
          message: "Merge notes",
          timestamp_ms: 1234,
          changes: [
            {
              path: "note.md",
              change: "modified",
              kind: "text_file",
              storage: "inline",
            },
          ],
        },
      ],
    })

    expect(history.currentHead).toBe("commit-2")
    expect(history.nextCursor).toBe("commit-2")
    expect(history.hasMore).toBe(true)
    expect(history.commits[0]).toEqual({
      id: "commit-2",
      parent: "commit-1",
      parents: ["commit-1", "merge-parent"],
      tree: "tree-2",
      message: "Merge notes",
      timestampMs: 1234,
      changes: [
        {
          path: "note.md",
          change: "modified",
          kind: "text_file",
          storage: "inline",
        },
      ],
      changedPaths: 1,
    })
  })

  it("parses the compact commit command response", () => {
    const result = parseGraftCommitResult({
      head: "commit-1",
      branch: "main",
      commit: {
        id: "commit-1",
        message: "Initial version",
        parents: [],
      },
      paths: [
        {
          path: ".obsidian/app.json",
          change: "added",
          kind: "text_file",
          storage: "inline",
        },
      ],
    })

    expect(result.currentHead).toBe("commit-1")
    expect(result.currentBranch).toBe("main")
    expect(result.commit.timestampMs).toBeNull()
    expect(result.commit.changes).toHaveLength(1)
  })

  it("derives paths from older commit artifact maps", () => {
    const commit = parseGraftCommit({
      id: "legacy-output",
      parent: null,
      message: "Legacy",
      artifacts: {
        "assets/image.png": {
          type: "large_file",
          kind: "binary_file",
        },
      },
    })

    expect(commit.changes).toEqual([
      {
        path: "assets/image.png",
        change: "unknown",
        kind: "binary_file",
        storage: "external",
      },
    ])
  })

  it("normalizes revision diff paths without requiring file payloads", () => {
    const diff = parseGraftDiff(
      {
        current_head: "commit-2",
        current_branch: "main",
        from: "commit-1",
        to: "commit-2",
        paths: [
          {
            path: "note.md",
            change: "modified",
            kind: "text_file",
            storage: "inline",
          },
        ],
      },
      "fallback-from",
      "fallback-to"
    )

    expect(diff).toEqual({
      currentHead: "commit-2",
      currentBranch: "main",
      from: "commit-1",
      to: "commit-2",
      paths: [
        {
          path: "note.md",
          change: "modified",
          kind: "text_file",
          storage: "inline",
        },
      ],
      content: null,
      sqliteFiles: [],
    })
  })

  it("parses bounded UTF-8 text content without losing absent states", () => {
    const diff = parseGraftDiff(
      {
        from: "commit-1",
        to: "commit-2",
        paths: [
          {
            path: "note.md",
            change: "added",
            kind: "text_file",
            storage: "inline",
          },
        ],
        content: {
          path: "note.md",
          change: "added",
          kind: "text_file",
          storage: "inline",
          before: { state: "absent" },
          after: {
            state: "utf8",
            content: "# Hello\n",
            size: 8,
            content_hash: "hash-after",
          },
        },
      },
      "fallback-from",
      "fallback-to"
    )

    expect(diff.content).toEqual({
      path: "note.md",
      change: "added",
      kind: "text_file",
      storage: "inline",
      before: { state: "absent" },
      after: {
        state: "utf8",
        content: "# Hello\n",
        size: 8,
        contentHash: "hash-after",
      },
    })
    expect(diff.sqliteFiles).toEqual([])
  })

  it("preserves Graft row-level SQLite changes for one Base file", () => {
    const diff = parseGraftDiff(
      {
        current_head: "commit-2",
        current_branch: "main",
        from: "commit-1",
        to: "commit-2",
        paths: [
          {
            path: "tasks.base",
            change: "modified",
            kind: "sqlite_database",
            storage: "sqlite_snapshot",
          },
        ],
        files: [
          {
            path: "tasks.base",
            change: "modified",
            kind: "sqlite_database",
            storage: "sqlite_snapshot",
            row_diff_available: true,
            logical_status: "logical_changes",
            capabilities: ["rowid_table_rows", "schema_entries"],
            limitations: [
              { kind: "index_btree", subject: "sqlite_autoindex_tasks_1" },
            ],
            tables: [
              {
                name: "tb_tasks",
                columns: ["_id", "title", "done"],
                changes: [
                  {
                    op: "update",
                    rowid: 1,
                    values: ["1", "First", 1],
                    old_values: ["1", "First", 0],
                  },
                  {
                    op: "insert",
                    rowid: 2,
                    values: ["2", "Second", 0],
                  },
                ],
              },
            ],
            opaque_changes: [
              {
                name: "sqlite_autoindex_tasks_1",
                change: "modified",
                reason: "index_btree",
              },
            ],
          },
        ],
      },
      "fallback-from",
      "fallback-to"
    )

    expect(diff.sqliteFiles).toEqual([
      {
        path: "tasks.base",
        change: "modified",
        kind: "sqlite_database",
        storage: "sqlite_snapshot",
        rowDiffAvailable: true,
        logicalStatus: "logical_changes",
        capabilities: ["rowid_table_rows", "schema_entries"],
        limitations: [
          { kind: "index_btree", subject: "sqlite_autoindex_tasks_1" },
        ],
        message: null,
        tables: [
          {
            name: "tb_tasks",
            columns: ["_id", "title", "done"],
            changes: [
              {
                operation: "update",
                rowId: 1,
                values: ["1", "First", 1],
                beforeValues: ["1", "First", 0],
              },
              {
                operation: "insert",
                rowId: 2,
                values: ["2", "Second", 0],
                beforeValues: null,
              },
            ],
          },
        ],
        opaqueChanges: [
          {
            name: "sqlite_autoindex_tasks_1",
            change: "modified",
            reason: "index_btree",
            owner: null,
          },
        ],
      },
    ])
  })

  it("resolves a changed file against the selected revision tree", () => {
    expect(
      parseGraftRestoreSource(
        {
          id: "resolved-commit",
          artifacts: {
            "assets/image.png": {
              type: "large_file",
              kind: "binary_file",
            },
          },
          changes: [
            {
              path: "assets/image.png",
              change: "modified",
              kind: "binary_file",
              storage: "external",
            },
          ],
        },
        "assets/image.png"
      )
    ).toEqual({
      revision: "resolved-commit",
      path: "assets/image.png",
      change: "modified",
      kind: "binary_file",
      storage: "external",
      containsPath: true,
    })
  })

  it("recognizes a deletion without confusing the full tree inventory", () => {
    expect(
      parseGraftRestoreSource(
        {
          id: "delete-commit",
          artifacts: {
            "keep.md": { type: "file", kind: "text_file" },
          },
          changes: [
            {
              path: "gone.md",
              change: "deleted",
              kind: "text_file",
              storage: "inline",
            },
          ],
        },
        "gone.md"
      )
    ).toMatchObject({
      revision: "delete-commit",
      path: "gone.md",
      change: "deleted",
      containsPath: false,
    })
  })

  it("recognizes a SQLite path in the revision file inventory", () => {
    expect(
      parseGraftRestoreSource(
        {
          id: "database-commit",
          files: {
            "data/app.db": { snapshot: "snapshot-1" },
          },
          artifacts: {},
          changes: [
            {
              path: "data/app.db",
              change: "modified",
              kind: "sqlite_database",
              storage: "sqlite_snapshot",
            },
          ],
        },
        "data/app.db"
      )
    ).toMatchObject({
      path: "data/app.db",
      kind: "sqlite_database",
      storage: "sqlite_snapshot",
      containsPath: true,
    })
  })

  it("canonicalizes a whole-Space restore source and lists its exact paths", () => {
    expect(
      parseGraftRestoreVersionSource({
        id: "resolved-commit",
        files: {
          "data/app.db": { snapshot: "snapshot-1" },
        },
        artifacts: {
          " note.md ": { type: "file", kind: "text_file" },
          "assets/image.png": { type: "large_file", kind: "binary_file" },
        },
      })
    ).toEqual({
      revision: "resolved-commit",
      paths: [" note.md ", "assets/image.png", "data/app.db"],
    })
  })

  it("rejects duplicate whole-Space source tree entries", () => {
    expect(() =>
      parseGraftRestoreVersionSource({
        id: "resolved-commit",
        files: { "data/app.db": {} },
        artifacts: { "data/app.db": {} },
      })
    ).toThrow("duplicate file data")
  })

  it("parses and de-duplicates exact paths restored by Graft", () => {
    expect(
      parseGraftRestorePaths({
        operation: "restore",
        path: null,
        paths: ["ignored-fallback.md"],
        path_details: [
          { path: "notes/today.md", kind: "artifact" },
          { path: " note.md ", kind: "artifact" },
          { path: "notes/today.md", kind: "artifact" },
        ],
      })
    ).toEqual([" note.md ", "notes/today.md"])
  })
})
