import Database from "better-sqlite3"
import { describe, expect, it, vi } from "vitest"

import { BetterSqlite3EidosFileConnection } from "./better-sqlite3"

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
