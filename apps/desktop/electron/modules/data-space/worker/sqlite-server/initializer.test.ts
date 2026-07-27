import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@eidos.space/rawdata", () => ({
  CREATE_TABLES_SQL: "",
  INIT_DATA_SQL: "",
}))

const { NodeDatabaseInitializer } = await import("./initializer")
const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

function createInitializer(options: { requireRemoteClone?: boolean } = {}) {
  const initializer = new NodeDatabaseInitializer({
    simple: {
      libPath: "",
      dictPath: "",
    },
    graft: {
      libPath: "",
      cliPath: "/fixture/graft",
      enabled: true,
      syncEnabled: true,
      requireRemoteClone: options.requireRemoteClone,
    },
  })
  ;(initializer as any).logger = {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
  return initializer as any
}

describe("NodeDatabaseInitializer", () => {
  it("materializes an empty legacy VFS placeholder only after validating the export", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "eidos-graft-vfs-"))
    tempRoots.push(root)
    const eidosPath = path.join(root, ".eidos")
    const dbPath = path.join(eidosPath, "db.sqlite3")
    fs.mkdirSync(path.join(eidosPath, ".graft"), { recursive: true })
    fs.writeFileSync(dbPath, "")
    const initializer = createInitializer()
    initializer.runGraft = vi.fn(
      async (_spaceInfo: unknown, args: readonly string[]) => {
        const output = args.at(-1)
        if (!output) throw new Error("missing export output path")
        expect(args).toEqual([
          "--db",
          "db.sqlite3",
          "export",
          "--json",
          "--output",
          output,
        ])
        fs.writeFileSync(output, Buffer.from("SQLite format 3\0fixture"))
        return { operation: "export" }
      }
    )

    await initializer.materializeLegacyVfsWorktree({ path: root })

    expect(fs.readFileSync(dbPath).subarray(0, 16).toString("binary")).toBe(
      "SQLite format 3\0"
    )
  })

  it("never overwrites a non-empty non-SQLite legacy path", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "eidos-graft-vfs-"))
    tempRoots.push(root)
    const eidosPath = path.join(root, ".eidos")
    const dbPath = path.join(eidosPath, "db.sqlite3")
    fs.mkdirSync(path.join(eidosPath, ".graft"), { recursive: true })
    fs.writeFileSync(dbPath, "user-owned-data")
    const initializer = createInitializer()
    initializer.runGraft = vi.fn()

    await expect(
      initializer.materializeLegacyVfsWorktree({ path: root })
    ).rejects.toThrow("Refusing to replace non-SQLite legacy worktree file")
    expect(fs.readFileSync(dbPath, "utf8")).toBe("user-owned-data")
    expect(initializer.runGraft).not.toHaveBeenCalled()
  })

  it("falls back to a local repository when cloning an empty remote fails", async () => {
    const initializer = createInitializer()
    const calls: readonly string[][] = []
    initializer.runGraft = vi.fn(
      async (_spaceInfo, args: readonly string[]) => {
        ;(calls as string[][]).push([...args])
        if (args[0] === "clone") {
          throw new Error("remote `origin` has no branch `main`")
        }
        return {}
      }
    )

    const initializedFromRemote = await initializer.initializeWithRemoteSpace(
      { path: "/tmp/space" },
      "fs:///tmp/eidos-remote"
    )

    expect(initializedFromRemote).toBe(false)
    expect(calls).toEqual([
      ["clone", "--json", "fs:///tmp/eidos-remote"],
      ["init", "--json"],
    ])
  })

  it("fails instead of bootstrapping when a required clone cannot read the remote", async () => {
    const initializer = createInitializer({ requireRemoteClone: true })
    const calls: readonly string[][] = []
    initializer.runGraft = vi.fn(
      async (_spaceInfo, args: readonly string[]) => {
        ;(calls as string[][]).push([...args])
        throw new Error("remote `origin` has no branch `main`")
      }
    )

    await expect(
      initializer.initializeWithRemoteSpace(
        { path: "/tmp/space" },
        "fs:///tmp/eidos-remote"
      )
    ).rejects.toThrow("remote `origin` has no branch `main`")

    expect(calls).toEqual([["clone", "--json", "fs:///tmp/eidos-remote"]])
  })

  it("refreshes remote refs on startup without pulling into the worktree", async () => {
    const initializer = createInitializer()
    const calls: readonly string[][] = []
    initializer.runGraft = vi.fn(
      async (_spaceInfo, args: readonly string[]) => {
        ;(calls as string[][]).push([...args])
        return {}
      }
    )

    await initializer.refreshRemoteRefsOnStartup({ path: "/tmp/space" })

    expect(calls).toEqual([["fetch", "--json"]])
  })
})
