import { describe, expect, it, vi } from "vitest"

vi.mock("@eidos.space/rawdata", () => ({
  CREATE_TABLES_SQL: "",
  INIT_DATA_SQL: "",
}))

const { NodeDatabaseInitializer } = await import("./initializer")

function createInitializer(options: { requireRemoteClone?: boolean } = {}) {
  const initializer = new NodeDatabaseInitializer({
    simple: {
      libPath: "",
      dictPath: "",
    },
    graft: {
      libPath: "",
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
  it("bootstraps and pushes main when cloning an empty remote fails", () => {
    const calls: string[] = []
    const db = {
      pragma: vi.fn((command: string) => {
        calls.push(command)
        if (command.startsWith("graft_clone")) {
          throw new Error("remote `origin` has no branch `main`")
        }
        return []
      }),
    }

    createInitializer().initializeWithRemoteSpace(db, "fs:///tmp/eidos-remote")

    expect(calls).toEqual([
      "graft_clone = 'fs:///tmp/eidos-remote'",
      "graft_init",
      "graft_add",
      "graft_commit = 'Initial version'",
      "graft_remote_add = 'origin fs:///tmp/eidos-remote'",
      "graft_branch_upstream = 'origin/main'",
      "graft_push",
    ])
  })

  it("fails instead of bootstrapping when a clone operation cannot read the remote", () => {
    const calls: string[] = []
    const db = {
      pragma: vi.fn((command: string) => {
        calls.push(command)
        if (command.startsWith("graft_clone")) {
          throw new Error("remote `origin` has no branch `main`")
        }
        return []
      }),
    }

    expect(() =>
      createInitializer({ requireRemoteClone: true }).initializeWithRemoteSpace(
        db,
        "fs:///tmp/eidos-remote"
      )
    ).toThrow("remote `origin` has no branch `main`")

    expect(calls).toEqual(["graft_clone = 'fs:///tmp/eidos-remote'"])
  })

  it("refreshes remote refs on startup without pulling into the worktree", () => {
    const calls: string[] = []
    const db = {
      pragma: vi.fn((command: string) => {
        calls.push(command)
        return []
      }),
    }

    createInitializer().refreshRemoteRefsOnStartup(db)

    expect(calls).toEqual(["graft_fetch"])
  })
})
