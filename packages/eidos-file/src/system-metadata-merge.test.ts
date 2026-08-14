import Database from "better-sqlite3"
import { copyFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  BetterSqlite3EidosFileConnection,
  createEidosFile,
} from "./better-sqlite3"
import type { EidosFileConnection } from "./connection"
import { mergeEidosSystemMetadata } from "./system-metadata-merge"

const CREATED_AT = "2026-08-13T00:00:00.000Z"
const OURS_AT = "2026-08-13T00:01:00.000Z"
const THEIRS_AT = "2026-08-13T00:02:00.000Z"
const MERGE_AT = "2026-08-13T23:59:00.000Z"

interface OpenConnection {
  connection: EidosFileConnection
  close(): void
}

function open(filePath: string): OpenConnection {
  const database = new Database(filePath)
  const connection = new BetterSqlite3EidosFileConnection(database)
  connection.exec("PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF;")
  return { connection, close: () => connection.close?.() }
}

function paths(directory: string) {
  return {
    base: path.join(directory, "base.eidos"),
    ours: path.join(directory, "ours.eidos"),
    theirs: path.join(directory, "theirs.eidos"),
    result: path.join(directory, "result.eidos"),
    reversedResult: path.join(directory, "reversed-result.eidos"),
  }
}

function withConnections<T>(
  filePaths: ReturnType<typeof paths>,
  operation: (connections: {
    base: EidosFileConnection
    ours: EidosFileConnection
    theirs: EidosFileConnection
    result: EidosFileConnection
  }) => T
): T {
  const base = open(filePaths.base)
  const ours = open(filePaths.ours)
  const theirs = open(filePaths.theirs)
  const result = open(filePaths.result)
  try {
    return operation({
      base: base.connection,
      ours: ours.connection,
      theirs: theirs.connection,
      result: result.connection,
    })
  } finally {
    result.close()
    theirs.close()
    ours.close()
    base.close()
  }
}

function mutate(
  filePath: string,
  operation: (connection: EidosFileConnection) => void
): void {
  const opened = open(filePath)
  try {
    opened.connection.transaction(() => operation(opened.connection))
  } finally {
    opened.close()
  }
}

describe("Eidos system metadata three-way merge", () => {
  const directories: string[] = []

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  function createSnapshots(withTable = false): ReturnType<typeof paths> {
    const directory = mkdtempSync(path.join(tmpdir(), "eidos-system-merge-"))
    directories.push(directory)
    const filePaths = paths(directory)
    const runtime = createEidosFile(filePaths.base, {
      title: "Base",
      createdAt: CREATED_AT,
    })
    if (withTable) {
      runtime.createTable({
        name: "items",
        fields: [{ name: "Name", type: "text", isRecordLabel: true }],
      })
      runtime.connection.transaction(() => {
        for (const table of [
          "eidos__tables",
          "eidos__fields",
          "eidos__views",
        ]) {
          runtime.connection.run(
            `UPDATE ${table} SET created_at=?,updated_at=?`,
            [CREATED_AT, CREATED_AT]
          )
        }
        runtime.connection.run(
          "UPDATE eidos__meta SET created_at=?,updated_at=? WHERE singleton=1",
          [CREATED_AT, CREATED_AT]
        )
      })
    }
    runtime.close()
    copyFileSync(filePaths.base, filePaths.ours)
    copyFileSync(filePaths.base, filePaths.theirs)
    return filePaths
  }

  it("never reports revision divergence and is invariant under role reversal", () => {
    const filePaths = createSnapshots()
    mutate(filePaths.ours, (connection) => {
      connection.run(
        "UPDATE eidos__meta SET title='From Ours',revision=2,updated_at=? WHERE singleton=1",
        [OURS_AT]
      )
    })
    mutate(filePaths.theirs, (connection) => {
      connection.run(
        "UPDATE eidos__meta SET title='From Theirs',revision=5,updated_at=? WHERE singleton=1",
        [THEIRS_AT]
      )
    })
    copyFileSync(filePaths.ours, filePaths.result)
    copyFileSync(filePaths.theirs, filePaths.reversedResult)

    const forward = withConnections(
      filePaths,
      ({ base, ours, theirs, result }) => {
        const outcome = mergeEidosSystemMetadata({
          base,
          ours,
          theirs,
          result,
          oursKey: "commit-a",
          theirsKey: "commit-b",
          operationInstant: MERGE_AT,
        })
        return {
          outcome,
          meta: result.get<{
            title: string
            revision: number | bigint
            updated_at: string
          }>(
            "SELECT title,revision,updated_at FROM eidos__meta WHERE singleton=1"
          ),
        }
      }
    )
    expect(forward.outcome.outcome).toBe("merged")
    expect(forward.meta).toEqual({
      title: "From Theirs",
      revision: 6,
      updated_at: MERGE_AT,
    })
    expect(
      forward.outcome.outcome === "merged" &&
        forward.outcome.automaticResolutions.some(
          (resolution) =>
            resolution.group === "title" && resolution.selectedSide === "theirs"
        )
    ).toBe(true)

    const reversedPaths = {
      ...filePaths,
      ours: filePaths.theirs,
      theirs: filePaths.ours,
      result: filePaths.reversedResult,
    }
    const reversed = withConnections(
      reversedPaths,
      ({ base, ours, theirs, result }) => {
        const outcome = mergeEidosSystemMetadata({
          base,
          ours,
          theirs,
          result,
          oursKey: "commit-b",
          theirsKey: "commit-a",
          operationInstant: MERGE_AT,
        })
        return {
          outcome,
          meta: result.get<{
            title: string
            revision: number | bigint
            updated_at: string
          }>(
            "SELECT title,revision,updated_at FROM eidos__meta WHERE singleton=1"
          ),
        }
      }
    )
    expect(reversed.outcome.outcome).toBe("merged")
    expect(reversed.meta).toEqual(forward.meta)
  })

  it("combines disjoint Table and View groups using one operation instant", () => {
    const filePaths = createSnapshots(true)
    mutate(filePaths.ours, (connection) => {
      connection.run("UPDATE eidos__tables SET settings_json=?,updated_at=?", [
        '{"accent":"blue"}',
        OURS_AT,
      ])
      connection.run("UPDATE eidos__views SET name=?,updated_at=?", [
        "Ours View",
        OURS_AT,
      ])
      connection.run(
        "UPDATE eidos__meta SET revision=revision+1,updated_at=? WHERE singleton=1",
        [OURS_AT]
      )
    })
    mutate(filePaths.theirs, (connection) => {
      connection.run("UPDATE eidos__tables SET position=7,updated_at=?", [
        THEIRS_AT,
      ])
      connection.run("UPDATE eidos__views SET position=9,updated_at=?", [
        THEIRS_AT,
      ])
      connection.run(
        "UPDATE eidos__meta SET revision=revision+1,updated_at=? WHERE singleton=1",
        [THEIRS_AT]
      )
    })
    copyFileSync(filePaths.ours, filePaths.result)

    const merged = withConnections(
      filePaths,
      ({ base, ours, theirs, result }) => {
        const outcome = mergeEidosSystemMetadata({
          base,
          ours,
          theirs,
          result,
          oursKey: "commit-a",
          theirsKey: "commit-b",
          operationInstant: MERGE_AT,
        })
        return {
          outcome,
          table: result.get<{
            position: number
            settings_json: string
            updated_at: string
          }>("SELECT position,settings_json,updated_at FROM eidos__tables"),
          view: result.get<{
            name: string
            position: number
            updated_at: string
          }>("SELECT name,position,updated_at FROM eidos__views"),
        }
      }
    )
    expect(merged.outcome.outcome).toBe("merged")
    expect(merged.table).toEqual({
      position: 7,
      settings_json: '{"accent":"blue"}',
      updated_at: MERGE_AT,
    })
    expect(merged.view).toEqual({
      name: "Ours View",
      position: 9,
      updated_at: MERGE_AT,
    })
  })

  it("reports a Feature domain conflict and leaves the candidate untouched", () => {
    const filePaths = createSnapshots()
    mutate(filePaths.base, (connection) => {
      connection.run(
        "INSERT INTO eidos__features(name,version,required,config_json) VALUES('example','1',0,'{}')"
      )
    })
    copyFileSync(filePaths.base, filePaths.ours)
    copyFileSync(filePaths.base, filePaths.theirs)
    mutate(filePaths.ours, (connection) => {
      connection.run(
        "UPDATE eidos__features SET version='2' WHERE name='example'"
      )
      connection.run("UPDATE eidos__meta SET revision=1,updated_at=?", [
        OURS_AT,
      ])
    })
    mutate(filePaths.theirs, (connection) => {
      connection.run(
        "UPDATE eidos__features SET version='3' WHERE name='example'"
      )
      connection.run("UPDATE eidos__meta SET revision=1,updated_at=?", [
        THEIRS_AT,
      ])
    })
    copyFileSync(filePaths.ours, filePaths.result)

    const result = withConnections(
      filePaths,
      ({ base, ours, theirs, result }) => {
        const before = result.get<{ version: string }>(
          "SELECT version FROM eidos__features WHERE name='example'"
        )
        const outcome = mergeEidosSystemMetadata({
          base,
          ours,
          theirs,
          result,
          oursKey: "commit-a",
          theirsKey: "commit-b",
          operationInstant: MERGE_AT,
        })
        const after = result.get<{ version: string }>(
          "SELECT version FROM eidos__features WHERE name='example'"
        )
        return { outcome, before, after }
      }
    )
    expect(result.outcome).toMatchObject({
      outcome: "conflict",
      conflicts: [{ code: "feature-conflict", objectKind: "feature" }],
    })
    expect(result.after).toEqual(result.before)
  })

  it("rejects a result seed whose system rows no longer equal Ours", () => {
    const filePaths = createSnapshots()
    mutate(filePaths.ours, (connection) => {
      connection.run("UPDATE eidos__meta SET revision=1,updated_at=?", [
        OURS_AT,
      ])
    })
    mutate(filePaths.theirs, (connection) => {
      connection.run("UPDATE eidos__meta SET revision=2,updated_at=?", [
        THEIRS_AT,
      ])
    })
    copyFileSync(filePaths.ours, filePaths.result)
    mutate(filePaths.result, (connection) => {
      connection.run("UPDATE eidos__meta SET title='Already changed'")
    })

    const outcome = withConnections(
      filePaths,
      ({ base, ours, theirs, result }) =>
        mergeEidosSystemMetadata({
          base,
          ours,
          theirs,
          result,
          oursKey: "commit-a",
          theirsKey: "commit-b",
          operationInstant: MERGE_AT,
        })
    )
    expect(outcome).toMatchObject({
      outcome: "invalid-input",
      issues: [{ input: "result", code: "invalid-result-seed" }],
    })
  })
})
