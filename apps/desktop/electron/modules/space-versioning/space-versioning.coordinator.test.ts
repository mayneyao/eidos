// @vitest-environment node

import fs from "fs/promises"
import os from "os"
import path from "path"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SpaceRegistry } from "../space-management/space-management.module"
import type { GraftCliRunner } from "./graft-cli-runner"
import { SpaceVersioningCoordinator } from "./space-versioning.coordinator"

vi.mock("../space-management/space-management.module", () => ({
  SpaceRegistry: class SpaceRegistry {},
}))
vi.mock("./graft-cli-runner", () => ({
  GraftCliRunner: class GraftCliRunner {},
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

function createCoordinator(root: string, runJson: ReturnType<typeof vi.fn>) {
  const registry = {
    getSpace: (spaceId: string) =>
      spaceId === "space-a"
        ? { id: spaceId, mode: "file", path: root }
        : undefined,
  }
  return new SpaceVersioningCoordinator(
    registry as unknown as SpaceRegistry,
    { runJson } as unknown as GraftCliRunner
  )
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true }))
  )
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
        "--",
        "head-1",
        "head-2",
        "note.md",
      ],
      { maxBufferBytes: 4194304 }
    )
  })

  it("rejects content mode without two revisions and one path", async () => {
    const root = await createSpace()
    const runJson = vi.fn()
    const coordinator = createCoordinator(root, runJson)

    await expect(
      coordinator.getDiff("space-a", {
        from: "head-1",
        includeContent: true,
      })
    ).rejects.toThrow("requires a root target or two revisions and one path")
    expect(runJson).not.toHaveBeenCalled()
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
      ["restore", "--json", "--source", "resolved-1", "--", repositoryPath],
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
        await fs.writeFile(ignorePath, "user-rule/\n", "utf8")
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
      ["restore", "--json", "--source", "resolved-1", "--", "."],
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
      { runJson } as unknown as GraftCliRunner
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
  it("repairs managed ignores before status and staging while preserving user rules", async () => {
    const root = await createSpace()
    const ignorePath = path.join(root, ".graftignore")
    await fs.writeFile(ignorePath, "user-rule/\n", "utf8")
    let statusReads = 0
    const runJson = vi.fn(async (_cwd: string, args: readonly string[]) => {
      if (args[0] === "status") {
        statusReads += 1
        const ignore = await fs.readFile(ignorePath, "utf8")
        expect(ignore).toContain("user-rule/\n")
        expect(ignore).toContain(".eidos/sessions/\n")
        return statusReads === 1
          ? statusPayload()
          : statusPayload([
              {
                path: "note.md",
                kind: "text_file",
                storage: "inline",
                index_status: "modified",
                worktree_status: "none",
              },
            ])
      }
      if (args[0] === "add") {
        return { operation: "add" }
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
      "add",
      "status",
      "commit",
    ])
  })
})
