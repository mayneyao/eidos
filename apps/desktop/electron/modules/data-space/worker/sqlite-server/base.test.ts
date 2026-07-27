// @vitest-environment node

import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { SqliteDatabase } from "./better-sqlite3"

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  runJson: vi.fn(),
}))

vi.mock("../../../space-versioning/graft-cli-process", () => ({
  GraftCliProcess: class GraftCliProcess {
    runJson = mocks.runJson
  },
}))

vi.mock("@eidos.space/space-manager", () => ({
  getSpaceRegistry: vi.fn(),
}))

const { NodeBaseServerDatabase } = await import("./base")

function database(label: string, inTransaction = false) {
  const close = vi.fn(() => mocks.events.push(`${label}:close`))
  const pragma = vi.fn()
  return {
    close,
    pragma,
    value: { inTransaction, close, pragma } as unknown as SqliteDatabase,
  }
}

function versionedDatabase(inTransaction = false) {
  const initial = database("initial", inTransaction)
  const reopened = database("reopened")
  const server = new NodeBaseServerDatabase(
    initial.value,
    { path: "fixture-space" },
    { cliPath: "/fixture/graft" },
    false,
    () => {
      mocks.events.push("db:reopen")
      return reopened.value
    }
  )
  server.setSyncEnabled(true)
  return { initial, reopened, server }
}

beforeEach(() => {
  mocks.events.length = 0
  mocks.runJson.mockReset()
  mocks.runJson.mockImplementation(
    async (_cwd: string, args: readonly string[]) => {
      mocks.events.push(`cli:${args[0]}`)
      return args[0] === "commit"
        ? { commit: { id: "commit-1" } }
        : { operation: args[0] }
    }
  )
})

describe("NodeBaseServerDatabase Graft v0.8 lifecycle", () => {
  it("stages the live WAL worktree, then closes for commit and reopens", async () => {
    const { initial, server } = versionedDatabase()

    await server.commit("Save WAL transaction")

    expect(mocks.events).toEqual([
      "cli:add",
      "initial:close",
      "cli:commit",
      "db:reopen",
    ])
    expect(mocks.runJson).toHaveBeenNthCalledWith(
      1,
      path.join("fixture-space", ".eidos"),
      ["add", "--json", "db.sqlite3"],
      { timeoutMs: 30_000 }
    )
    expect(mocks.runJson).toHaveBeenNthCalledWith(
      2,
      path.join("fixture-space", ".eidos"),
      ["commit", "--json", "--message", "Save WAL transaction"],
      { timeoutMs: 30_000 }
    )
    expect(initial.pragma).not.toHaveBeenCalled()
  })

  it("closes around worktree-materializing pull even when the CLI fails", async () => {
    const { reopened, server } = versionedDatabase()
    mocks.runJson.mockRejectedValueOnce(new Error("remote unavailable"))

    await expect(server.pull()).rejects.toThrow("remote unavailable")

    expect(mocks.events).toEqual(["initial:close", "db:reopen"])
    expect(reopened.close).not.toHaveBeenCalled()
  })

  it("rejects commit before add when a SQLite transaction is open", async () => {
    const { server } = versionedDatabase(true)

    await expect(server.commit("unsafe")).rejects.toThrow(
      "while a SQLite transaction is open"
    )
    expect(mocks.runJson).not.toHaveBeenCalled()
  })

  it("passes a composite BLOB primary-key identity to resolve", async () => {
    const { server } = versionedDatabase()

    await server.resolveConflict("theirs", "db.sqlite3", {
      table: "docs",
      key: { namespace: "personal", id: { $blob: "00ff" } },
    })

    expect(mocks.runJson).toHaveBeenCalledWith(
      path.join("fixture-space", ".eidos"),
      [
        "--db",
        "db.sqlite3",
        "resolve",
        "--json",
        "--theirs",
        "--row",
        "docs",
        '{"id":{"$blob":"00ff"},"namespace":"personal"}',
        "db.sqlite3",
      ],
      { timeoutMs: 30_000 }
    )
  })
})
