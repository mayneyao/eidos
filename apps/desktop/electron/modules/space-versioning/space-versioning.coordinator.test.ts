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
    ).rejects.toThrow("requires source and target revisions and one path")
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
