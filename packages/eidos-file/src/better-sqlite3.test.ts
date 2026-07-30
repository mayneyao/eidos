import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import Database from "better-sqlite3"
import { describe, expect, it, vi } from "vitest"

import {
  BetterSqlite3ConnectionPort,
  BetterSqlite3EidosFileConnection,
} from "./better-sqlite3"
import { expectConnectionPortConformance } from "./connection-port.conformance"
import { Runtime } from "./runtime-service"
import type { RuntimeEnvironment } from "./runtime-contract"

const runtimeEnvironment = (): RuntimeEnvironment => ({
  clock: {
    nowInstant: () => "2026-07-23T00:00:00.000Z",
    nowMilliseconds: () => performance.now(),
  },
  entropy: {
    randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
  },
})

const runtimeFactoryContext = {
  cancellation: {
    cancelled: () => false,
    onCancel: () => () => undefined,
  },
}

const runtimeContext = (requestId: string) => ({
  requestId,
  deadlineMilliseconds: 30_000,
})

describe("BetterSqlite3EidosFileConnection statement cache", () => {
  it("reuses prepared statements and evicts the least recently used SQL", () => {
    const database = new Database(":memory:")
    const connection = new BetterSqlite3EidosFileConnection(database, {
      statementCacheSize: 2,
    })
    const prepare = vi.spyOn(database, "prepare")
    try {
      expect(connection.get<{ value: number }>("SELECT 1 AS value")).toEqual({
        value: 1,
      })
      connection.get("SELECT 1 AS value")
      connection.get("SELECT 2 AS value")
      connection.get("SELECT 3 AS value")
      connection.get("SELECT 1 AS value")

      expect(
        prepare.mock.calls.filter(([sql]) => sql === "SELECT 1 AS value")
      ).toHaveLength(2)
      expect(prepare).toHaveBeenCalledTimes(4)
    } finally {
      prepare.mockRestore()
      connection.close()
    }
  })

  it("invalidates cached statements before schema changes", () => {
    const database = new Database(":memory:")
    const connection = new BetterSqlite3EidosFileConnection(database)
    connection.exec("CREATE TABLE records (title TEXT)")
    const prepare = vi.spyOn(database, "prepare")
    try {
      connection.run("INSERT INTO records (title) VALUES (?)", ["First"])
      connection.run("INSERT INTO records (title) VALUES (?)", ["Second"])
      expect(
        prepare.mock.calls.filter(([sql]) =>
          String(sql).startsWith("INSERT INTO records")
        )
      ).toHaveLength(1)

      expect(connection.query("SELECT * FROM records")).toHaveLength(2)
      expect(connection.query("SELECT * FROM records")).toHaveLength(2)
      expect(
        prepare.mock.calls.filter(([sql]) => sql === "SELECT * FROM records")
      ).toHaveLength(1)

      connection.exec("ALTER TABLE records ADD COLUMN points INTEGER")
      expect(connection.query("SELECT * FROM records")).toEqual([
        { title: "First", points: null },
        { title: "Second", points: null },
      ])
      expect(
        prepare.mock.calls.filter(([sql]) => sql === "SELECT * FROM records")
      ).toHaveLength(2)
    } finally {
      prepare.mockRestore()
      connection.close()
    }
  })
})

describe("BetterSqlite3ConnectionPort EA-Connection-1.0", () => {
  it("passes the shared Browser/Desktop connection transcript", async () => {
    const connection = new BetterSqlite3ConnectionPort(new Database(":memory:"))
    try {
      await expectConnectionPortConformance(connection)
    } finally {
      connection.close()
    }
  })

  it("opens a Runtime 1.0 binding over a read-only database", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "eidos-runtime-readonly-")
    )
    const filePath = path.join(directory, "readonly.eidos")
    try {
      const writable = new BetterSqlite3ConnectionPort(new Database(filePath))
      const created = await Runtime.create(
        writable,
        runtimeEnvironment(),
        { title: "Read-only" },
        runtimeFactoryContext
      )
      await created.service.close(runtimeContext("close-created"))
      writable.close()

      const readonly = new BetterSqlite3ConnectionPort(
        new Database(filePath, { fileMustExist: true, readonly: true })
      )
      try {
        const opened = await Runtime.open(
          readonly,
          runtimeEnvironment(),
          "read",
          runtimeFactoryContext
        )
        await expect(
          opened.service.negotiate(
            { protocol: "eidos-runtime", versions: ["1.0"] },
            runtimeContext("negotiate-readonly")
          )
        ).resolves.toMatchObject({
          version: "1.0",
          capabilities: {
            readRows: true,
            mutateRows: false,
            csvImport: false,
          },
        })
        expect(opened.service.importCsv).toBeUndefined()
        await opened.service.close(runtimeContext("close-readonly"))
      } finally {
        readonly.close()
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
