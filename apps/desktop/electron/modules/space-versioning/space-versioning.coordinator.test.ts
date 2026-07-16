// @vitest-environment node

import fs from "fs/promises"
import os from "os"
import path from "path"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SpaceRegistry } from "../space-management/space-management.module"
import type { GraftRunner } from "./graft-runner"
import { SpaceVersioningCoordinator } from "./space-versioning.coordinator"

vi.mock("../space-management/space-management.module", () => ({
  SpaceRegistry: class SpaceRegistry {},
}))
vi.mock("./graft-runner", () => ({
  GraftRunner: class GraftRunner {},
}))
vi.mock("../../common/di", () => ({
  Inject: () => () => undefined,
  Injectable: () => (target: unknown) => target,
}))
vi.mock("electron", () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd() },
}))

const tempRoots: string[] = []

async function createSpace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-restore-test-"))
  tempRoots.push(root)
  await fs.mkdir(path.join(root, ".graft"))
  return root
}

function statusPayload(
  paths: unknown[] = [],
  overrides: Record<string, unknown> = {}
) {
  return {
    current_head: "head-2",
    current_branch: "main",
    repository_format_version: 2,
    paths,
    ...overrides,
  }
}

function createCoordinator(
  root: string,
  runJson: ReturnType<typeof vi.fn>,
  registryOverrides: Record<string, unknown> = {}
) {
  const registry = {
    getSpace: (spaceId: string) =>
      spaceId === "space-a"
        ? { id: spaceId, mode: "file", path: root }
        : undefined,
    setSpaceSync: vi.fn(),
    ...registryOverrides,
  }
  return new SpaceVersioningCoordinator(
    registry as unknown as SpaceRegistry,
    { runJson } as unknown as GraftRunner
  )
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true }))
  )
})

describe("SpaceVersioningCoordinator.getStatus", () => {
  it("refreshes managed ignores and hides private Eidos runtime paths", async () => {
    const root = await createSpace()
    const ignorePath = path.join(root, ".graftignore")
    await fs.writeFile(
      ignorePath,
      [
        "# >>> Eidos managed versioning ignores",
        ".eidos/db.sqlite3",
        "# <<< Eidos managed versioning ignores",
        "",
      ].join("\n"),
      "utf8"
    )
    const changedPaths = [
      ".eidos/inbox.sqlite3",
      ".eidos/raw.sqlite3",
      ".eidos/extensions/kanban/index.tsx",
      ".graftignore",
      "todo.md",
    ].map((changedPath) => ({
      path: changedPath,
      kind: "text_file",
      storage: "inline",
      index_status: "none",
      worktree_status: "untracked",
    }))
    const runJson = vi.fn(async () =>
      statusPayload(changedPaths, {
        counts: { unstaged: changedPaths.length, staged: 0, conflicted: 0 },
      })
    )
    const coordinator = createCoordinator(root, runJson)

    const result = await coordinator.getStatus("space-a")

    expect(result.paths.map((entry) => entry.path)).toEqual([
      ".eidos/extensions/kanban/index.tsx",
      ".graftignore",
      "todo.md",
    ])
    expect(result.counts).toEqual({
      unstaged: 3,
      staged: 0,
      conflicted: 0,
    })
    expect(await fs.readFile(ignorePath, "utf8")).toContain(
      ".eidos/inbox.sqlite3"
    )
    expect(await fs.readFile(ignorePath, "utf8")).toContain(
      ".eidos/raw.sqlite3"
    )
  })
})

describe("SpaceVersioningCoordinator remotes", () => {
  it("configures origin and records its upstream on the current branch", async () => {
    const root = await createSpace()
    const setSpaceSync = vi.fn()
    let configured = false
    const runJson = vi.fn(async (_root: string, args: string[]) => {
      if (args[0] === "status") {
        return statusPayload([], {
          remotes: configured ? [{ name: "origin" }] : [],
          upstream_status: configured
            ? {
                remote: "origin",
                branch: "main",
                ahead: 1,
                behind: 0,
                state: "ahead",
              }
            : null,
        })
      }
      if (args[0] === "remote" && args[1] === "list") {
        return {
          current_head: "head-2",
          current_branch: "main",
          remotes: [],
        }
      }
      if (args[0] === "remote" && args[1] === "add") {
        configured = true
        return {
          operation: "remote_add",
          remote: { name: "origin", url: "fs:///tmp/Eidos Remote" },
        }
      }
      if (args[0] === "branch-upstream") {
        return { operation: "branch_upstream" }
      }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson, { setSpaceSync })

    const result = await coordinator.configureRemote("space-a", {
      url: "fs:///tmp/Eidos Remote",
    })

    expect(result.remote).toEqual({
      name: "origin",
      url: "fs:///tmp/Eidos Remote",
    })
    expect(result.status.upstream).toMatchObject({
      remote: "origin",
      branch: "main",
      state: "ahead",
    })
    expect(runJson).toHaveBeenCalledWith(await fs.realpath(root), [
      "branch-upstream",
      "--json",
      "main",
      "origin/main",
    ])
    expect(setSpaceSync).toHaveBeenCalledWith("space-a", {
      enabled: true,
      remote: "fs:///tmp/Eidos Remote",
      provider: "graft",
    })
  })

  it("restores an existing remote URL when upstream configuration fails", async () => {
    const root = await createSpace()
    const runJson = vi.fn(async (_root: string, args: string[]) => {
      if (args[0] === "status") return statusPayload()
      if (args[0] === "remote" && args[1] === "list") {
        return {
          current_head: "head-2",
          current_branch: "main",
          remotes: [{ name: "origin", url: "fs:///tmp/old" }],
        }
      }
      if (args[0] === "remote" && args[1] === "set-url") {
        return {
          operation: "remote_set_url",
          remote: { name: "origin", url: args[4] },
        }
      }
      if (args[0] === "branch-upstream") {
        throw new Error("invalid upstream")
      }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    await expect(
      coordinator.configureRemote("space-a", {
        url: "fs:///tmp/new",
      })
    ).rejects.toThrow("invalid upstream")

    expect(runJson).toHaveBeenLastCalledWith(await fs.realpath(root), [
      "remote",
      "set-url",
      "--json",
      "origin",
      "fs:///tmp/old",
    ])
  })

  it("pushes through the persistent runner and reconciles status", async () => {
    const root = await createSpace()
    const runJson = vi.fn(async (_root: string, args: string[]) => {
      if (args[0] === "status") {
        return statusPayload([], {
          remotes: [{ name: "origin" }],
          upstream_status: {
            remote: "origin",
            branch: "main",
            ahead: 2,
            behind: 0,
            state: "ahead",
          },
        })
      }
      if (args[0] === "push") {
        return {
          operation: "push",
          current_head: "head-2",
          current_branch: "main",
          remote: "origin",
          branches: [{ remote_branch: "main" }],
          commits: 2,
          forced: false,
        }
      }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    const result = await coordinator.pushRemote("space-a", {
      expectedHead: "head-2",
    })

    expect(result).toMatchObject({
      operation: "push",
      remote: "origin",
      branch: "main",
      commits: 2,
      forced: false,
      status: { currentHead: "head-2" },
    })
    expect(runJson).toHaveBeenCalledWith(
      await fs.realpath(root),
      ["push", "--json", "origin"],
      { timeoutMs: 120_000 }
    )
  })

  it("blocks pull before invoking Graft when local changes are present", async () => {
    const root = await createSpace()
    const runJson = vi.fn(async () =>
      statusPayload(
        [
          {
            path: "note.md",
            kind: "text_file",
            storage: "inline",
            index_status: "none",
            worktree_status: "modified",
          },
        ],
        {
          remotes: [{ name: "origin" }],
          counts: { unstaged: 1, staged: 0, conflicted: 0 },
        }
      )
    )
    const coordinator = createCoordinator(root, runJson)

    await expect(
      coordinator.pullRemote("space-a", { expectedHead: "head-2" })
    ).rejects.toThrow("Commit or discard local changes")
    expect(runJson).toHaveBeenCalledTimes(1)
  })
})

describe("SpaceVersioningCoordinator conflicts", () => {
  it("lists visible conflict paths and resolves a spaced path safely", async () => {
    const root = await createSpace()
    let resolved = false
    const runJson = vi.fn(async (_root: string, args: string[]) => {
      if (args[0] === "conflicts") {
        return {
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
            {
              path: ".eidos/secrets/token",
              kind: "text_file",
              storage: "inline",
              status: "unresolved",
              total: 1,
              unresolved: 1,
              resolved: 0,
            },
          ],
          conflicts: [
            {
              id: "notes/a b.md:file",
              path: "notes/a b.md",
              path_kind: "text_file",
              storage: "inline",
              kind: "file",
              reason: "content_conflict",
              status: "unresolved",
            },
            {
              id: ".eidos/secrets/token:file",
              path: ".eidos/secrets/token",
              path_kind: "text_file",
              storage: "inline",
              kind: "file",
              reason: "content_conflict",
              status: "unresolved",
            },
          ],
        }
      }
      if (args[0] === "status") {
        return statusPayload(
          [
            {
              path: "notes/a b.md",
              kind: "text_file",
              storage: "inline",
              index_status: resolved ? "modified" : "unmerged",
              worktree_status: resolved ? "none" : "unmerged",
              conflicted: !resolved,
            },
          ],
          {
            merge_head: "remote-2",
            has_conflicts: !resolved,
            counts: {
              unstaged: 0,
              staged: resolved ? 1 : 0,
              conflicted: resolved ? 0 : 1,
            },
          }
        )
      }
      if (args[0] === "resolve") {
        resolved = true
        return {
          operation: "resolve_conflict",
          current_head: "head-2",
          current_branch: "main",
          path: "notes/a b.md",
          resolution: "theirs",
          remaining_conflicts: 0,
        }
      }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    const conflicts = await coordinator.getConflicts("space-a")
    expect(conflicts).toMatchObject({
      mergeHead: "remote-2",
      paths: [{ path: "notes/a b.md", status: "unresolved" }],
      conflicts: [{ path: "notes/a b.md", kind: "file" }],
    })

    const result = await coordinator.resolveConflict("space-a", {
      path: "notes/a b.md",
      resolution: "theirs",
      expectedHead: "head-2",
    })
    expect(result).toMatchObject({
      path: "notes/a b.md",
      resolution: "theirs",
      remainingConflicts: 0,
      status: { hasConflicts: false, hasStagedChanges: true },
    })
    expect(runJson).toHaveBeenCalledWith(
      await fs.realpath(root),
      ["resolve", "--json", "--theirs", "notes/a b.md"],
      { timeoutMs: 120_000 }
    )
  })

  it("resolves one SQLite row without accepting the whole file", async () => {
    const root = await createSpace()
    const runJson = vi.fn(async (_root: string, args: string[]) => {
      if (args[0] === "status") {
        return statusPayload(
          [
            {
              path: "tasks.base",
              kind: "sqlite_database",
              storage: "sqlite_snapshot",
              index_status: "unmerged",
              worktree_status: "unmerged",
              conflicted: true,
            },
          ],
          {
            merge_head: "remote-2",
            has_conflicts: true,
            counts: { unstaged: 0, staged: 0, conflicted: 1 },
          }
        )
      }
      if (args[0] === "resolve") {
        return {
          operation: "resolve_conflict",
          path: "tasks.base",
          resolution: "ours",
          remaining_conflicts: 1,
        }
      }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    await coordinator.resolveConflict("space-a", {
      path: "tasks.base",
      resolution: "ours",
      expectedHead: "head-2",
      target: { table: "tb_tasks", rowId: 7 },
    })

    expect(runJson).toHaveBeenCalledWith(
      await fs.realpath(root),
      ["resolve", "--json", "--ours", "--row", "tb_tasks", "7", "tasks.base"],
      { timeoutMs: 120_000 }
    )
  })
})

describe("SpaceVersioningCoordinator.getHistory", () => {
  it("requests one bounded Graft page instead of slicing a full log", async () => {
    const root = await createSpace()
    const runJson = vi.fn(async () => ({
      current_head: "head-3",
      current_branch: "main",
      commits: [
        {
          id: "head-1",
          message: "First",
          parents: [],
          changes: [],
        },
      ],
      next_cursor: null,
      has_more: false,
    }))
    const coordinator = createCoordinator(root, runJson)

    const result = await coordinator.getHistory("space-a", {
      limit: 25,
      cursor: "head-2",
    })

    expect(result).toMatchObject({
      currentHead: "head-3",
      commits: [{ id: "head-1" }],
      nextCursor: null,
      hasMore: false,
    })
    expect(runJson).toHaveBeenCalledWith(
      await fs.realpath(root),
      ["log", "--json", "--limit", "25", "--after", "head-2"],
      { maxBufferBytes: 64 * 1024 * 1024 }
    )
  })
})

describe("SpaceVersioningCoordinator.getDiff", () => {
  it("requests one bounded historical text path without reading the worktree", async () => {
    const root = await createSpace()
    const runJson = vi.fn(async () => ({
      from: "head-1",
      to: "head-2",
      paths: [
        {
          path: "note.md",
          change: "modified",
          kind: "text_file",
          storage: "inline",
        },
      ],
      content: {
        path: "note.md",
        change: "modified",
        kind: "text_file",
        storage: "inline",
        before: {
          state: "utf8",
          content: "before",
          size: 6,
          content_hash: "hash-before",
        },
        after: {
          state: "utf8",
          content: "after",
          size: 5,
          content_hash: "hash-after",
        },
      },
    }))
    const coordinator = createCoordinator(root, runJson)

    const result = await coordinator.getDiff("space-a", {
      from: "head-1",
      to: "head-2",
      path: "note.md",
      includeContent: true,
    })

    expect(result.content?.path).toBe("note.md")
    expect(runJson).toHaveBeenCalledWith(
      await fs.realpath(root),
      [
        "diff",
        "--json",
        "--content",
        "--max-content-bytes",
        "1048576",
        "head-1",
        "head-2",
        "--",
        "note.md",
      ],
      { maxBufferBytes: 4194304 }
    )
  })

  it("rejects content mode without one path", async () => {
    const root = await createSpace()
    const runJson = vi.fn()
    const coordinator = createCoordinator(root, runJson)

    await expect(
      coordinator.getDiff("space-a", {
        from: "head-1",
        includeContent: true,
      })
    ).rejects.toThrow("requires a source or root target and one path")
    expect(runJson).not.toHaveBeenCalled()
  })

  it("requests bounded text content from a revision to the worktree", async () => {
    const root = await createSpace()
    const runJson = vi.fn(async () => ({
      current_head: "head-2",
      current_branch: "main",
      from: "head-2",
      to: "worktree",
      paths: [
        {
          path: "note.md",
          change: "modified",
          kind: "text_file",
          storage: "inline",
        },
      ],
      content: {
        path: "note.md",
        change: "modified",
        kind: "text_file",
        storage: "inline",
        before: {
          state: "utf8",
          content: "committed",
          size: 9,
          content_hash: "before",
        },
        after: {
          state: "utf8",
          content: "working",
          size: 7,
          content_hash: "after",
        },
      },
    }))
    const coordinator = createCoordinator(root, runJson)

    const result = await coordinator.getDiff("space-a", {
      from: "head-2",
      path: "note.md",
      includeContent: true,
    })

    expect(result).toMatchObject({ from: "head-2", to: "worktree" })
    expect(runJson).toHaveBeenCalledWith(
      await fs.realpath(root),
      [
        "diff",
        "--json",
        "--content",
        "--max-content-bytes",
        "1048576",
        "head-2",
        "--",
        "note.md",
      ],
      { maxBufferBytes: 4194304 }
    )
  })

  it("requests first-version content from the empty repository tree", async () => {
    const root = await createSpace()
    const runJson = vi.fn(async () => ({
      from: "root",
      to: "first-commit",
      paths: [
        {
          path: "first.md",
          change: "added",
          kind: "text_file",
          storage: "inline",
        },
      ],
      content: {
        path: "first.md",
        change: "added",
        kind: "text_file",
        storage: "inline",
        before: { state: "absent" },
        after: {
          state: "utf8",
          content: "# First\n",
          size: 8,
          content_hash: "hash-first",
        },
      },
    }))
    const coordinator = createCoordinator(root, runJson)

    const result = await coordinator.getDiff("space-a", {
      root: "first-commit",
      path: "first.md",
      includeContent: true,
    })

    expect(result).toMatchObject({
      from: "root",
      to: "first-commit",
      content: {
        path: "first.md",
        before: { state: "absent" },
        after: { state: "utf8", content: "# First\n" },
      },
    })
    expect(runJson).toHaveBeenCalledWith(
      await fs.realpath(root),
      [
        "diff",
        "--json",
        "--content",
        "--max-content-bytes",
        "1048576",
        "--root",
        "first-commit",
        "--",
        "first.md",
      ],
      { maxBufferBytes: 4194304 }
    )
  })

  it("requests row-level SQLite changes for one Base path", async () => {
    const root = await createSpace()
    const runJson = vi.fn(async () => ({
      current_head: "head-2",
      current_branch: "main",
      from: "head-1",
      to: "head-2",
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
          tables: [],
        },
      ],
    }))
    const coordinator = createCoordinator(root, runJson)

    const result = await coordinator.getDiff("space-a", {
      from: "head-1",
      to: "head-2",
      path: "tasks.base",
      includeRows: true,
    })

    expect(result.sqliteFiles).toHaveLength(1)
    expect(runJson).toHaveBeenCalledWith(
      await fs.realpath(root),
      ["diff", "--json", "--rows", "head-1", "head-2", "--", "tasks.base"],
      { maxBufferBytes: 16 * 1024 * 1024 }
    )
  })

  it("rejects SQLite row mode without one path", async () => {
    const root = await createSpace()
    const runJson = vi.fn()
    const coordinator = createCoordinator(root, runJson)

    await expect(
      coordinator.getDiff("space-a", {
        from: "head-1",
        includeRows: true,
      })
    ).rejects.toThrow("SQLite row diff requires one path")
    expect(runJson).not.toHaveBeenCalled()
  })
})

describe("SpaceVersioningCoordinator change actions", () => {
  it("stages one changed path and returns the reconciled status", async () => {
    const root = await createSpace()
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] === "add") {
        return {
          operation: "add",
          status: statusPayload([
            {
              path: "notes/today.md",
              kind: "text_file",
              storage: "inline",
              index_status: "modified",
              worktree_status: "none",
            },
          ]),
        }
      }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    const result = await coordinator.stagePath("space-a", {
      path: "notes/today.md",
      expectedHead: "head-2",
    })

    expect(result.path).toBe("notes/today.md")
    expect(result.status.paths[0]).toMatchObject({ staged: true })
    expect(runJson).toHaveBeenNthCalledWith(
      1,
      await fs.realpath(root),
      [
        "add",
        "--json",
        "--with-status",
        "--expected-head",
        "head-2",
        "--",
        "notes/today.md",
      ],
      { timeoutMs: 120_000 }
    )
  })

  it("allows a managed ignore migration to be included in the next version", async () => {
    const root = await createSpace()
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] === "add") {
        return {
          operation: "add",
          status: statusPayload([
            {
              path: ".graftignore",
              kind: "text_file",
              storage: "inline",
              index_status: "modified",
              worktree_status: "none",
            },
          ]),
        }
      }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    const result = await coordinator.stagePath("space-a", {
      path: ".graftignore",
      expectedHead: "head-2",
    })

    expect(result.status.paths[0]).toMatchObject({ staged: true })
    expect(runJson).toHaveBeenNthCalledWith(
      1,
      await fs.realpath(root),
      [
        "add",
        "--json",
        "--with-status",
        "--expected-head",
        "head-2",
        "--",
        ".graftignore",
      ],
      { timeoutMs: 120_000 }
    )
  })

  it("stages every changed descendant with one directory pathspec", async () => {
    const root = await createSpace()
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] === "add") {
        return {
          operation: "add",
          status: statusPayload([
            {
              path: "notes/one.md",
              kind: "text_file",
              storage: "inline",
              index_status: "modified",
              worktree_status: "none",
            },
            {
              path: "notes/nested/two.md",
              kind: "text_file",
              storage: "inline",
              index_status: "modified",
              worktree_status: "none",
            },
          ]),
        }
      }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    const result = await coordinator.stagePath("space-a", {
      path: "notes",
      expectedHead: "head-2",
    })

    expect(result.status.paths.every((entry) => entry.staged)).toBe(true)
    expect(runJson).toHaveBeenNthCalledWith(
      1,
      await fs.realpath(root),
      [
        "add",
        "--json",
        "--with-status",
        "--expected-head",
        "head-2",
        "--",
        "notes",
      ],
      { timeoutMs: 120_000 }
    )
  })

  it("guards an unborn repository without a separate status request", async () => {
    const root = await createSpace()
    const runJson = vi.fn(async () => ({
      operation: "add",
      status: statusPayload(
        [
          {
            path: "first.md",
            kind: "text_file",
            storage: "inline",
            index_status: "added",
            worktree_status: "none",
          },
        ],
        { current_head: null }
      ),
    }))
    const coordinator = createCoordinator(root, runJson)

    const result = await coordinator.stagePath("space-a", {
      path: "first.md",
      expectedHead: null,
    })

    expect(result.status.currentHead).toBeNull()
    expect(runJson).toHaveBeenCalledWith(
      await fs.realpath(root),
      [
        "add",
        "--json",
        "--with-status",
        "--expected-head",
        "unborn",
        "--",
        "first.md",
      ],
      { timeoutMs: 120_000 }
    )
  })

  it.each([
    [
      "[graft:add:expected-head-mismatch]",
      "The Space history changed. Refresh Changes before including this file.",
    ],
    [
      "[graft:add:path-no-changes]",
      "This path no longer has changes to include",
    ],
    [
      "[graft:add:path-conflicted]",
      "Resolve conflicts in this path before including it",
    ],
  ])("maps guarded add error %s", async (marker, expectedMessage) => {
    const root = await createSpace()
    const runJson = vi.fn(async () => {
      throw new Error(marker)
    })
    const coordinator = createCoordinator(root, runJson)

    await expect(
      coordinator.stagePath("space-a", {
        path: "notes/today.md",
        expectedHead: "head-2",
      })
    ).rejects.toThrow(expectedMessage)
  })

  it("unstages one included path while preserving its working change", async () => {
    const root = await createSpace()
    let statusReads = 0
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] === "status") {
        statusReads += 1
        return statusReads === 1
          ? statusPayload([
              {
                path: "note.md",
                kind: "text_file",
                storage: "inline",
                index_status: "modified",
                worktree_status: "modified",
              },
            ])
          : statusPayload([
              {
                path: "note.md",
                kind: "text_file",
                storage: "inline",
                index_status: "none",
                worktree_status: "modified",
              },
            ])
      }
      if (args[0] === "restore") return { operation: "restore" }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    const result = await coordinator.unstagePath("space-a", {
      path: "note.md",
      expectedHead: "head-2",
    })

    expect(result.status.paths[0]).toMatchObject({ staged: false })
    expect(runJson).toHaveBeenNthCalledWith(
      2,
      await fs.realpath(root),
      [
        "restore",
        "--json",
        "--staged",
        "--expected-head",
        "head-2",
        "--",
        "note.md",
      ],
      { timeoutMs: 120_000 }
    )
  })

  it("unstages every included descendant with one directory pathspec", async () => {
    const root = await createSpace()
    let statusReads = 0
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] === "status") {
        statusReads += 1
        return statusPayload([
          {
            path: "notes/one.md",
            kind: "text_file",
            storage: "inline",
            index_status: statusReads === 1 ? "modified" : "none",
            worktree_status: "modified",
          },
          {
            path: "notes/nested/two.md",
            kind: "text_file",
            storage: "inline",
            index_status: statusReads === 1 ? "modified" : "none",
            worktree_status: "modified",
          },
        ])
      }
      if (args[0] === "restore") return { operation: "restore" }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    const result = await coordinator.unstagePath("space-a", {
      path: "notes",
      expectedHead: "head-2",
    })

    expect(result.status.paths.every((entry) => !entry.staged)).toBe(true)
    expect(runJson).toHaveBeenNthCalledWith(
      2,
      await fs.realpath(root),
      [
        "restore",
        "--json",
        "--staged",
        "--expected-head",
        "head-2",
        "--",
        "notes",
      ],
      { timeoutMs: 120_000 }
    )
  })

  it("discards tracked staged and working content before clearing the index", async () => {
    const root = await createSpace()
    await fs.writeFile(path.join(root, "note.md"), "working", "utf8")
    let statusReads = 0
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] === "status") {
        statusReads += 1
        return statusReads === 1
          ? statusPayload([
              {
                path: "note.md",
                kind: "text_file",
                storage: "inline",
                index_status: "modified",
                worktree_status: "modified",
              },
            ])
          : statusPayload()
      }
      if (args[0] === "restore") return { operation: "restore" }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    const result = await coordinator.discardPath("space-a", {
      path: "note.md",
      expectedHead: "head-2",
      confirmed: true,
    })

    expect(result).toMatchObject({ path: "note.md", effect: "restored" })
    expect(
      runJson.mock.calls
        .map(([, args]) => args)
        .filter((args) => args[0] === "restore")
    ).toEqual([
      [
        "restore",
        "--json",
        "--expected-head",
        "head-2",
        "--source",
        "head-2",
        "--",
        "note.md",
      ],
      [
        "restore",
        "--json",
        "--staged",
        "--expected-head",
        "head-2",
        "--",
        "note.md",
      ],
    ])
  })

  it("discards every staged, working, deleted, and untracked change in a directory", async () => {
    const root = await createSpace()
    const notes = path.join(root, "notes")
    const untracked = path.join(notes, "untracked.md")
    await fs.mkdir(notes)
    await fs.writeFile(untracked, "draft", "utf8")
    let statusReads = 0
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] === "status") {
        statusReads += 1
        return statusReads === 1
          ? statusPayload([
              {
                path: "notes/one.md",
                kind: "text_file",
                storage: "inline",
                index_status: "modified",
                worktree_status: "modified",
              },
              {
                path: "notes/nested/two.md",
                kind: "text_file",
                storage: "inline",
                index_status: "none",
                worktree_status: "deleted",
              },
              {
                path: "notes/untracked.md",
                kind: "text_file",
                storage: "inline",
                index_status: "none",
                worktree_status: "untracked",
              },
            ])
          : statusPayload()
      }
      if (args[0] === "restore") return { operation: "restore" }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    const result = await coordinator.discardPath("space-a", {
      path: "notes",
      expectedHead: "head-2",
      confirmed: true,
    })

    expect(result).toMatchObject({ path: "notes", effect: "restored" })
    expect(
      runJson.mock.calls
        .map(([, args]) => args)
        .filter((args) => args[0] === "restore")
    ).toEqual([
      [
        "restore",
        "--json",
        "--expected-head",
        "head-2",
        "--source",
        "head-2",
        "--",
        "notes",
      ],
      [
        "restore",
        "--json",
        "--staged",
        "--expected-head",
        "head-2",
        "--",
        "notes",
      ],
    ])
    await expect(fs.stat(untracked)).rejects.toMatchObject({ code: "ENOENT" })
    await expect(fs.stat(notes)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("deletes an untracked directory before the first version", async () => {
    const root = await createSpace()
    const notes = path.join(root, "notes")
    await fs.mkdir(path.join(notes, "nested"), { recursive: true })
    await fs.writeFile(path.join(notes, "one.md"), "one", "utf8")
    await fs.writeFile(path.join(notes, "nested", "two.md"), "two", "utf8")
    let statusReads = 0
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] !== "status") {
        throw new Error(`Unexpected command: ${args.join(" ")}`)
      }
      statusReads += 1
      return statusReads === 1
        ? statusPayload(
            [
              {
                path: "notes/one.md",
                kind: "text_file",
                storage: "inline",
                index_status: "none",
                worktree_status: "untracked",
              },
              {
                path: "notes/nested/two.md",
                kind: "text_file",
                storage: "inline",
                index_status: "none",
                worktree_status: "untracked",
              },
            ],
            { current_head: null }
          )
        : statusPayload([], { current_head: null })
    })
    const coordinator = createCoordinator(root, runJson)

    const result = await coordinator.discardPath("space-a", {
      path: "notes",
      expectedHead: null,
      confirmed: true,
    })

    expect(result).toMatchObject({ path: "notes", effect: "deleted" })
    expect(runJson).toHaveBeenCalledTimes(2)
    await expect(fs.stat(notes)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("deletes an untracked file safely before the first version", async () => {
    const root = await createSpace()
    const draft = path.join(root, "draft.md")
    await fs.writeFile(draft, "draft", "utf8")
    let statusReads = 0
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] !== "status") {
        throw new Error(`Unexpected command: ${args.join(" ")}`)
      }
      statusReads += 1
      return statusReads === 1
        ? statusPayload(
            [
              {
                path: "draft.md",
                kind: "text_file",
                storage: "inline",
                index_status: "none",
                worktree_status: "untracked",
              },
            ],
            { current_head: null }
          )
        : statusPayload([], { current_head: null })
    })
    const coordinator = createCoordinator(root, runJson)

    const result = await coordinator.discardPath("space-a", {
      path: "draft.md",
      expectedHead: null,
      confirmed: true,
    })

    expect(result.effect).toBe("deleted")
    await expect(fs.stat(draft)).rejects.toMatchObject({ code: "ENOENT" })
    expect(runJson).toHaveBeenCalledTimes(2)
  })

  it("unstages an added path before deleting it on an unborn branch", async () => {
    const root = await createSpace()
    const draft = path.join(root, "draft.md")
    await fs.writeFile(draft, "draft", "utf8")
    let statusReads = 0
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] === "status") {
        statusReads += 1
        return statusReads === 1
          ? statusPayload(
              [
                {
                  path: "draft.md",
                  kind: "text_file",
                  storage: "inline",
                  index_status: "added",
                  worktree_status: "none",
                },
              ],
              { current_head: null }
            )
          : statusPayload([], { current_head: null })
      }
      if (args[0] === "restore") return { operation: "restore" }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    await coordinator.discardPath("space-a", {
      path: "draft.md",
      expectedHead: null,
      confirmed: true,
    })

    expect(runJson).toHaveBeenNthCalledWith(
      2,
      await fs.realpath(root),
      ["restore", "--json", "--staged", "--", "draft.md"],
      { timeoutMs: 120_000 }
    )
    await expect(fs.stat(draft)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("preserves a file replaced after discard confirmation", async () => {
    const root = await createSpace()
    const draft = path.join(root, "draft.md")
    await fs.writeFile(draft, "draft", "utf8")
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] === "status") {
        return statusPayload(
          [
            {
              path: "draft.md",
              kind: "text_file",
              storage: "inline",
              index_status: "added",
              worktree_status: "none",
            },
          ],
          { current_head: null }
        )
      }
      if (args[0] === "restore") {
        await fs.writeFile(draft, "replacement from another editor", "utf8")
        return { operation: "restore" }
      }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    await expect(
      coordinator.discardPath("space-a", {
        path: "draft.md",
        expectedHead: null,
        confirmed: true,
      })
    ).rejects.toThrow("changed after discard was confirmed")
    await expect(fs.readFile(draft, "utf8")).resolves.toBe(
      "replacement from another editor"
    )
  })

  it("requires explicit confirmation before discarding", async () => {
    const root = await createSpace()
    const runJson = vi.fn()
    const coordinator = createCoordinator(root, runJson)

    await expect(
      coordinator.discardPath("space-a", {
        path: "note.md",
        expectedHead: "head-2",
      })
    ).rejects.toThrow("requires explicit confirmation")
    expect(runJson).not.toHaveBeenCalled()
  })
})

describe("SpaceVersioningCoordinator.restorePath", () => {
  it("restores a clean path without moving HEAD or trimming its name", async () => {
    const root = await createSpace()
    const repositoryPath = " note.md "
    await fs.writeFile(path.join(root, repositoryPath), "current", "utf8")
    let statusReads = 0
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] === "status") {
        statusReads += 1
        return statusReads === 1
          ? statusPayload()
          : statusPayload([
              {
                path: repositoryPath,
                kind: "text_file",
                storage: "inline",
                index_status: "none",
                worktree_status: "modified",
              },
            ])
      }
      if (args[0] === "show") {
        return {
          id: "resolved-1",
          artifacts: {
            [repositoryPath]: { type: "file", kind: "text_file" },
          },
          changes: [
            {
              path: repositoryPath,
              change: "modified",
              kind: "text_file",
              storage: "inline",
            },
          ],
        }
      }
      if (args[0] === "restore") {
        return { operation: "restore", current_head: "head-2" }
      }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    const result = await coordinator.restorePath("space-a", {
      revision: "HEAD~1",
      path: repositoryPath,
      expectedHead: "head-2",
    })

    expect(result).toMatchObject({
      revision: "resolved-1",
      path: repositoryPath,
      effect: "modified",
      status: { currentHead: "head-2" },
    })
    const realRoot = await fs.realpath(root)
    expect(runJson).toHaveBeenCalledWith(
      realRoot,
      [
        "restore",
        "--json",
        "--expected-head",
        "head-2",
        "--require-clean",
        "--source",
        "resolved-1",
        "--",
        repositoryPath,
      ],
      { timeoutMs: 120_000 }
    )
  })

  it("rejects conflicts before Graft can partially rewrite a file", async () => {
    const root = await createSpace()
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] === "status") {
        return statusPayload(
          [
            {
              path: "note.md",
              index_status: "unmerged",
              worktree_status: "unmerged",
              conflicted: true,
            },
          ],
          { has_conflicts: true }
        )
      }
      throw new Error("A mutation command must not run")
    })
    const coordinator = createCoordinator(root, runJson)

    await expect(
      coordinator.restorePath("space-a", {
        revision: "old",
        path: "note.md",
        expectedHead: "head-2",
      })
    ).rejects.toThrow("Resolve version conflicts")
    expect(runJson).toHaveBeenCalledTimes(1)
  })

  it("reports partial success when final status fails after restoring a file", async () => {
    const root = await createSpace()
    let statusReads = 0
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] === "status") {
        statusReads += 1
        if (statusReads === 1) return statusPayload()
        throw new Error("status unavailable")
      }
      if (args[0] === "show") {
        return {
          id: "resolved-1",
          artifacts: { "note.md": { type: "file", kind: "text_file" } },
          changes: [
            {
              path: "note.md",
              change: "modified",
              kind: "text_file",
              storage: "inline",
            },
          ],
        }
      }
      if (args[0] === "restore") {
        return { operation: "restore", current_head: "head-2" }
      }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    await expect(
      coordinator.restorePath("space-a", {
        revision: "old",
        path: "note.md",
        expectedHead: "head-2",
      })
    ).rejects.toThrow(
      "Space files may have been restored, but Eidos could not verify the final version state: status unavailable"
    )
  })

  it("rejects staged paths and dirty descendants without explicit overwrite", async () => {
    const root = await createSpace()
    const staged = vi.fn(async () =>
      statusPayload([
        {
          path: "notes/today.md",
          index_status: "modified",
          worktree_status: "none",
        },
      ])
    )
    const stagedCoordinator = createCoordinator(root, staged)
    await expect(
      stagedCoordinator.restorePath("space-a", {
        revision: "old",
        path: "notes/today.md",
        expectedHead: "head-2",
        overwriteChanges: true,
      })
    ).rejects.toThrow("staged changes")

    const dirtyDescendant = vi.fn(async () =>
      statusPayload([
        {
          path: "note.md/private.txt",
          index_status: "none",
          worktree_status: "untracked",
        },
      ])
    )
    const dirtyCoordinator = createCoordinator(root, dirtyDescendant)
    await expect(
      dirtyCoordinator.restorePath("space-a", {
        revision: "old",
        path: "note.md",
        expectedHead: "head-2",
      })
    ).rejects.toThrow("uncommitted changes")
  })

  it("requires explicit deletion confirmation and returns a deletion change", async () => {
    const root = await createSpace()
    await fs.writeFile(path.join(root, "gone.md"), "current", "utf8")
    let statusReads = 0
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] === "status") {
        statusReads += 1
        return statusReads === 1
          ? statusPayload()
          : statusPayload([
              {
                path: "gone.md",
                kind: "text_file",
                storage: "inline",
                index_status: "none",
                worktree_status: "deleted",
              },
            ])
      }
      if (args[0] === "show") {
        return {
          id: "delete-1",
          artifacts: { "keep.md": { type: "file", kind: "text_file" } },
          changes: [
            {
              path: "gone.md",
              change: "deleted",
              kind: "text_file",
              storage: "inline",
            },
          ],
        }
      }
      if (args[0] === "restore") {
        await fs.rm(path.join(root, "gone.md"))
        return { operation: "restore", current_head: "head-2" }
      }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    await expect(
      coordinator.restorePath("space-a", {
        revision: "delete-1",
        path: "gone.md",
        expectedHead: "head-2",
      })
    ).rejects.toThrow("requires explicit confirmation")

    statusReads = 0
    const result = await coordinator.restorePath("space-a", {
      revision: "delete-1",
      path: "gone.md",
      expectedHead: "head-2",
      allowDelete: true,
    })
    expect(result.effect).toBe("deleted")
    await expect(fs.stat(path.join(root, "gone.md"))).rejects.toMatchObject({
      code: "ENOENT",
    })
  })

  it("rejects private and escaping paths before touching the repository", async () => {
    const root = await createSpace()
    const runJson = vi.fn()
    const coordinator = createCoordinator(root, runJson)

    await expect(
      coordinator.restorePath("space-a", {
        revision: "old",
        path: "../outside.md",
        expectedHead: "head-2",
      })
    ).rejects.toThrow("must stay inside the Space")
    await expect(
      coordinator.restorePath("space-a", {
        revision: "old",
        path: ".EIDOS/state/private.json",
        expectedHead: "head-2",
      })
    ).rejects.toThrow("Private Space paths")
    await expect(
      coordinator.restorePath("space-a", {
        revision: "old",
        path: ".graftignore",
        expectedHead: "head-2",
      })
    ).rejects.toThrow("Private Space paths")
    expect(runJson).not.toHaveBeenCalled()
  })

  it.runIf(process.platform !== "win32")(
    "preserves a POSIX backslash filename instead of treating it as a directory",
    async () => {
      const root = await createSpace()
      const repositoryPath = "notes\\today.md"
      await fs.writeFile(path.join(root, repositoryPath), "current", "utf8")
      let statusReads = 0
      const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
        if (args[0] === "status") {
          statusReads += 1
          return statusReads === 1
            ? statusPayload()
            : statusPayload([
                {
                  path: repositoryPath,
                  kind: "text_file",
                  storage: "inline",
                  index_status: "none",
                  worktree_status: "modified",
                },
              ])
        }
        if (args[0] === "show") {
          return {
            id: "resolved-backslash",
            artifacts: {
              [repositoryPath]: { type: "file", kind: "text_file" },
            },
            changes: [
              {
                path: repositoryPath,
                change: "modified",
                kind: "text_file",
                storage: "inline",
              },
            ],
          }
        }
        if (args[0] === "restore") {
          return { operation: "restore", current_head: "head-2" }
        }
        throw new Error(`Unexpected command: ${args.join(" ")}`)
      })
      const coordinator = createCoordinator(root, runJson)

      const result = await coordinator.restorePath("space-a", {
        revision: "HEAD~1",
        path: repositoryPath,
        expectedHead: "head-2",
      })

      expect(result.path).toBe(repositoryPath)
      expect(runJson).toHaveBeenCalledWith(
        await fs.realpath(root),
        [
          "restore",
          "--json",
          "--expected-head",
          "head-2",
          "--require-clean",
          "--source",
          "resolved-backslash",
          "--",
          repositoryPath,
        ],
        { timeoutMs: 120_000 }
      )
    }
  )
})

describe("SpaceVersioningCoordinator.restoreVersion", () => {
  it("restores the whole Space from a canonical revision without moving HEAD", async () => {
    const root = await createSpace()
    const ignorePath = path.join(root, ".graftignore")
    await fs.writeFile(ignorePath, "user-rule/\n", "utf8")
    let statusReads = 0
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] === "status") {
        statusReads += 1
        if (statusReads === 1) {
          return statusPayload(
            [
              {
                path: "draft.md",
                kind: "text_file",
                storage: "inline",
                index_status: "none",
                worktree_status: "modified",
              },
            ],
            { work_in_progress: true }
          )
        }
        const ignore = await fs.readFile(ignorePath, "utf8")
        expect(ignore).toContain("user-rule/\n")
        expect(ignore).toContain(".eidos/sessions/\n")
        return statusPayload([
          {
            path: "draft.md",
            kind: "text_file",
            storage: "inline",
            index_status: "none",
            worktree_status: "modified",
          },
          {
            path: "later.md",
            kind: "text_file",
            storage: "inline",
            index_status: "none",
            worktree_status: "deleted",
          },
        ])
      }
      if (args[0] === "show") {
        if (args[args.length - 1] === "head-2") {
          return {
            id: "head-2",
            files: {},
            artifacts: {
              ".eidos/extensions/calendar.ts": {
                type: "file",
                kind: "text_file",
              },
              ".graftignore": { type: "file", kind: "text_file" },
              "draft.md": { type: "file", kind: "text_file" },
              "later.md": { type: "file", kind: "text_file" },
            },
          }
        }
        return {
          id: "resolved-1",
          files: {},
          artifacts: {
            ".eidos/extensions/calendar.ts": {
              type: "file",
              kind: "text_file",
            },
            ".graftignore": { type: "file", kind: "text_file" },
            "draft.md": { type: "file", kind: "text_file" },
          },
        }
      }
      if (args[0] === "restore") {
        // A historical tree can replace an older .graftignore. Eidos must
        // repair its managed block before reading the final status.
        await fs.writeFile(
          ignorePath,
          [
            "user-rule/",
            "# >>> Eidos managed versioning ignores",
            "obsolete-eidos-rule/",
            "# <<< Eidos managed versioning ignores",
            "",
          ].join("\n"),
          "utf8"
        )
        return {
          operation: "restore",
          current_head: "head-2",
          paths: [
            "later.md",
            "draft.md",
            ".graftignore",
            ".eidos/extensions/calendar.ts",
          ],
          path_details: [
            { path: "later.md" },
            { path: "draft.md" },
            { path: ".graftignore" },
            { path: ".eidos/extensions/calendar.ts" },
          ],
        }
      }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    const result = await coordinator.restoreVersion("space-a", {
      revision: "HEAD~1",
      expectedHead: "head-2",
      overwriteChanges: true,
    })

    expect(result).toMatchObject({
      revision: "resolved-1",
      restoredPaths: [
        ".eidos/extensions/calendar.ts",
        ".graftignore",
        "draft.md",
        "later.md",
      ],
      status: { currentHead: "head-2", hasUnstagedChanges: true },
    })
    expect(runJson.mock.calls.map(([, args]) => args[0])).toEqual([
      "status",
      "show",
      "show",
      "restore",
      "status",
    ])
    expect(runJson).toHaveBeenCalledWith(
      await fs.realpath(root),
      [
        "restore",
        "--json",
        "--expected-head",
        "head-2",
        "--source",
        "resolved-1",
        "--",
        ".",
      ],
      { timeoutMs: 120_000 }
    )
  })

  it("rejects stale history, conflicts, staged work, and unconfirmed dirty work before show", async () => {
    const cases: Array<{
      name: string
      payload: Record<string, unknown>
      options?: { expectedHead?: string; overwriteChanges?: boolean }
      message: string
    }> = [
      {
        name: "stale history",
        payload: statusPayload(),
        options: { expectedHead: "stale-head" },
        message: "history changed",
      },
      {
        name: "conflict",
        payload: statusPayload([], {
          has_conflicts: true,
          work_in_progress: true,
        }),
        options: { overwriteChanges: true },
        message: "Resolve version conflicts",
      },
      {
        name: "staged work",
        payload: statusPayload([], {
          has_staged_changes: true,
          work_in_progress: true,
        }),
        options: { overwriteChanges: true },
        message: "staged changes",
      },
      {
        name: "dirty work",
        payload: statusPayload([], {
          has_unstaged_changes: true,
          work_in_progress: true,
        }),
        message: "uncommitted changes",
      },
    ]

    for (const testCase of cases) {
      const root = await createSpace()
      const runJson = vi.fn(async () => testCase.payload)
      const coordinator = createCoordinator(root, runJson)

      await expect(
        coordinator.restoreVersion("space-a", {
          revision: "old",
          expectedHead: testCase.options?.expectedHead ?? "head-2",
          overwriteChanges: testCase.options?.overwriteChanges,
        })
      ).rejects.toThrow(testCase.message)
      expect(runJson, testCase.name).toHaveBeenCalledTimes(1)
    }
  })

  it("rejects a restore whose final status moved HEAD", async () => {
    const root = await createSpace()
    let statusReads = 0
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] === "status") {
        statusReads += 1
        return statusPayload([], {
          current_head: statusReads === 1 ? "head-2" : "head-1",
        })
      }
      if (args[0] === "show") {
        if (args[args.length - 1] === "head-2") {
          return {
            id: "head-2",
            files: {},
            artifacts: { "note.md": { type: "file" } },
          }
        }
        return {
          id: "resolved-1",
          files: {},
          artifacts: { "note.md": { type: "file" } },
        }
      }
      if (args[0] === "restore") {
        return {
          operation: "restore",
          current_head: "head-1",
          path: "note.md",
          path_details: [{ path: "note.md" }],
        }
      }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    await expect(
      coordinator.restoreVersion("space-a", {
        revision: "old",
        expectedHead: "head-2",
      })
    ).rejects.toThrow("current version changed")
  })

  it("does not edit managed ignores when Graft rejects the restore", async () => {
    const root = await createSpace()
    const ignorePath = path.join(root, ".graftignore")
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] === "status") {
        return statusPayload()
      }
      if (args[0] === "show") {
        if (args[args.length - 1] === "head-2") {
          return {
            id: "head-2",
            files: {},
            artifacts: { "note.md": { type: "file" } },
          }
        }
        return {
          id: "resolved-1",
          files: {},
          artifacts: { "note.md": { type: "file" } },
        }
      }
      if (args[0] === "restore") {
        await fs.writeFile(ignorePath, "user-rule/\n", "utf8")
        throw new Error("restore failed after materialization")
      }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    await expect(
      coordinator.restoreVersion("space-a", {
        revision: "old",
        expectedHead: "head-2",
      })
    ).rejects.toThrow("restore failed after materialization")
    const ignore = await fs.readFile(ignorePath, "utf8")
    expect(ignore).toBe("user-rule/\n")
  })

  it("reports partial success when managed-ignore repair fails after restoring a Space", async () => {
    const root = await createSpace()
    const ignorePath = path.join(root, ".graftignore")
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] === "status") {
        return statusPayload()
      }
      if (args[0] === "show") {
        return {
          id: args[args.length - 1] === "head-2" ? "head-2" : "resolved-1",
          files: {},
          artifacts: { "note.md": { type: "file" } },
        }
      }
      if (args[0] === "restore") {
        await fs.mkdir(ignorePath)
        return {
          operation: "restore",
          current_head: "head-2",
          paths: ["note.md"],
          path_details: [{ path: "note.md" }],
        }
      }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    await expect(
      coordinator.restoreVersion("space-a", {
        revision: "old",
        expectedHead: "head-2",
      })
    ).rejects.toThrow(
      "Space files may have been restored, but Eidos could not verify the final version state"
    )
  })

  it("rejects private runtime paths tracked by the source or current tree", async () => {
    const sourceRoot = await createSpace()
    const sourceRunner = vi.fn(
      async (_cwd: string, args: readonly string[]) => {
        if (args[0] === "status") {
          return statusPayload()
        }
        if (args[0] === "show") {
          return {
            id: "resolved-1",
            files: {},
            artifacts: {
              ".eidos/secrets.json": { type: "file" },
              ".eidos/extensions/calendar.ts": { type: "file" },
              ".graftignore": { type: "file" },
            },
          }
        }
        throw new Error("Restore must not run for a private source tree")
      }
    )
    const sourceCoordinator = createCoordinator(sourceRoot, sourceRunner)

    await expect(
      sourceCoordinator.restoreVersion("space-a", {
        revision: "old",
        expectedHead: "head-2",
      })
    ).rejects.toThrow(".eidos/secrets.json")
    expect(sourceRunner.mock.calls.map(([, args]) => args[0])).toEqual([
      "status",
      "show",
    ])

    const currentRoot = await createSpace()
    const currentRunner = vi.fn(
      async (_cwd: string, args: readonly string[]) => {
        if (args[0] === "status") {
          return statusPayload()
        }
        if (args[0] === "show" && args[args.length - 1] === "old") {
          return {
            id: "resolved-1",
            files: {},
            artifacts: { "note.md": { type: "file" } },
          }
        }
        if (args[0] === "show") {
          return {
            id: "head-2",
            files: {},
            artifacts: {
              ".eidos/cache/index.bin": { type: "large_file" },
            },
          }
        }
        throw new Error("Restore must not run for a private current tree")
      }
    )
    const currentCoordinator = createCoordinator(currentRoot, currentRunner)

    await expect(
      currentCoordinator.restoreVersion("space-a", {
        revision: "old",
        expectedHead: "head-2",
      })
    ).rejects.toThrow(".eidos/cache/index.bin")
    expect(currentRunner.mock.calls.map(([, args]) => args[0])).toEqual([
      "status",
      "show",
      "show",
    ])
  })

  it("is unavailable for a legacy database Space", async () => {
    const root = await createSpace()
    const runJson = vi.fn()
    const registry = {
      getSpace: () => ({ id: "space-a", mode: "db", path: root }),
    }
    const coordinator = new SpaceVersioningCoordinator(
      registry as unknown as SpaceRegistry,
      { runJson } as unknown as GraftRunner
    )

    await expect(
      coordinator.restoreVersion("space-a", {
        revision: "old",
        expectedHead: "head-2",
      })
    ).rejects.toThrow("only available for file Spaces")
    expect(runJson).not.toHaveBeenCalled()
  })
})

describe("SpaceVersioningCoordinator.commit", () => {
  it("continues a resolved remote merge instead of creating a single-parent commit", async () => {
    const root = await createSpace()
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] === "status") {
        return statusPayload(
          [
            {
              path: "note.md",
              kind: "text_file",
              storage: "inline",
              index_status: "modified",
              worktree_status: "none",
            },
          ],
          { merge_head: "remote-2" }
        )
      }
      if (args[0] === "merge-continue") {
        return {
          current_head: "merge-3",
          current_branch: "main",
          commit: {
            id: "merge-3",
            message: "Merge remote versions",
            parents: ["head-2", "remote-2"],
          },
          paths: [
            {
              path: "note.md",
              change: "modified",
              kind: "text_file",
              storage: "inline",
            },
          ],
        }
      }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    const result = await coordinator.commit("space-a", {
      message: "Merge remote versions",
    })

    expect(result.commit.parents).toEqual(["head-2", "remote-2"])
    expect(runJson).toHaveBeenCalledWith(
      await fs.realpath(root),
      ["merge-continue", "--json", "Merge remote versions"],
      { timeoutMs: 120_000 }
    )
  })

  it("commits an existing staged subset without staging other working changes", async () => {
    const root = await createSpace()
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] === "status") {
        return statusPayload([
          {
            path: "included.md",
            kind: "text_file",
            storage: "inline",
            index_status: "modified",
            worktree_status: "none",
          },
          {
            path: "later.md",
            kind: "text_file",
            storage: "inline",
            index_status: "none",
            worktree_status: "modified",
          },
        ])
      }
      if (args[0] === "commit") {
        return {
          current_head: "head-3",
          current_branch: "main",
          commit: {
            id: "head-3",
            message: "Only included",
            parents: ["head-2"],
          },
          paths: [
            {
              path: "included.md",
              change: "modified",
              kind: "text_file",
              storage: "inline",
            },
          ],
        }
      }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    const result = await coordinator.commit("space-a", {
      message: "Only included",
    })

    expect(result.commit.changes.map((change) => change.path)).toEqual([
      "included.md",
    ])
    expect(runJson.mock.calls.map(([, args]) => args[0])).toEqual([
      "status",
      "commit",
    ])
  })

  it("refreshes owned managed ignores before committing while preserving user rules", async () => {
    const root = await createSpace()
    const ignorePath = path.join(root, ".graftignore")
    await fs.writeFile(
      ignorePath,
      [
        "user-rule/",
        "# >>> Eidos managed versioning ignores",
        "obsolete-eidos-rule/",
        "# <<< Eidos managed versioning ignores",
        "",
      ].join("\n"),
      "utf8"
    )
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] === "status") {
        const ignore = await fs.readFile(ignorePath, "utf8")
        expect(ignore).toContain("user-rule/\n")
        expect(ignore).toContain(".eidos/sessions/\n")
        return statusPayload([
          {
            path: "note.md",
            kind: "text_file",
            storage: "inline",
            index_status: "modified",
            worktree_status: "none",
          },
        ])
      }
      if (args[0] === "commit") {
        return {
          current_head: "head-3",
          current_branch: "main",
          commit: {
            id: "head-3",
            message: "Safe version",
            parents: ["head-2"],
          },
          paths: [
            {
              path: "note.md",
              change: "modified",
              kind: "text_file",
              storage: "inline",
            },
          ],
        }
      }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    const result = await coordinator.commit("space-a", {
      message: "Safe version",
    })

    expect(result.commit).toMatchObject({
      id: "head-3",
      message: "Safe version",
    })
    expect(runJson.mock.calls.map(([, args]) => args[0])).toEqual([
      "status",
      "commit",
    ])
  })

  it("requires an explicit staged selection before committing", async () => {
    const root = await createSpace()
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] === "status") {
        return statusPayload([
          {
            path: "draft.md",
            kind: "text_file",
            storage: "inline",
            index_status: "none",
            worktree_status: "modified",
          },
        ])
      }
      throw new Error(`Unexpected command: ${args.join(" ")}`)
    })
    const coordinator = createCoordinator(root, runJson)

    await expect(
      coordinator.commit("space-a", { message: "Not staged" })
    ).rejects.toThrow("Stage changes before creating a version")
    expect(runJson).toHaveBeenCalledTimes(1)
  })
})
