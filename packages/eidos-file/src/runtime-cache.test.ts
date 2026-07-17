import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import type {
  EidosFileConnection,
  EidosFileRunResult,
  EidosFileSqlParams,
} from "./connection"
import { createEidosFile, openEidosFile } from "./better-sqlite3"
import { EidosFileRuntime } from "./runtime"

class CountingConnection implements EidosFileConnection {
  readonly reads: string[] = []

  constructor(private readonly source: EidosFileConnection) {}

  exec(sql: string): void {
    this.source.exec(sql)
  }

  query<T extends object>(sql: string, params?: EidosFileSqlParams): T[] {
    this.reads.push(sql)
    return this.source.query<T>(sql, params)
  }

  get<T extends object>(
    sql: string,
    params?: EidosFileSqlParams
  ): T | undefined {
    this.reads.push(sql)
    return this.source.get<T>(sql, params)
  }

  run(sql: string, params?: EidosFileSqlParams): EidosFileRunResult {
    return this.source.run(sql, params)
  }

  runMany(sql: string, parameterSets: readonly EidosFileSqlParams[]): void {
    if (this.source.runMany) {
      this.source.runMany(sql, parameterSets)
      return
    }
    for (const params of parameterSets) this.source.run(sql, params)
  }

  transaction<T>(operation: () => T): T {
    return this.source.transaction(operation)
  }

  readCount(pattern: string): number {
    return this.reads.filter((sql) => sql.includes(pattern)).length
  }
}

describe("EidosFileRuntime row read schema cache", () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  function createRuntime() {
    const root = mkdtempSync(path.join(tmpdir(), "eidos-file-runtime-cache-"))
    roots.push(root)
    const eidosFile = createEidosFile(path.join(root, "records.eidos"), {
      defaultTable: { id: "records", name: "Records" },
    })
    eidosFile.insertImportedRows(
      "records",
      Array.from({ length: 3 }, (_, index) => ({ title: `Record ${index}` }))
    )
    const connection = new CountingConnection(eidosFile.connection)
    return {
      eidosFile,
      connection,
      runtime: new EidosFileRuntime(connection),
      filePath: path.join(root, "records.eidos"),
    }
  }

  it("reuses table and field metadata across contiguous card pages", () => {
    const { eidosFile, connection, runtime } = createRuntime()

    const first = runtime.getRowPage("records", 0, 2, {}, 3)
    runtime.getRowPage("records", 2, 2, {}, 3, first.nextCursor)

    expect(connection.readCount("PRAGMA data_version")).toBe(2)
    expect(connection.readCount("FROM eidos__tables")).toBe(1)
    expect(connection.readCount("FROM eidos__columns")).toBe(1)
    eidosFile.close()
  })

  it("invalidates cached metadata after runtime and external schema writes", () => {
    const { eidosFile, connection, runtime, filePath } = createRuntime()
    runtime.getRowPage("records", 0, 2, {}, 3)

    runtime.addField("records", {
      name: "Status",
      columnName: "status",
      type: "text",
    })
    const readsAfterRuntimeWrite = connection.readCount("FROM eidos__columns")
    runtime.getRowPage("records", 0, 2, {}, 3)
    expect(connection.readCount("FROM eidos__columns")).toBe(
      readsAfterRuntimeWrite + 1
    )

    const external = openEidosFile(filePath)
    external.addField("records", {
      name: "Owner",
      columnName: "owner",
      type: "text",
    })
    external.close()

    const readsAfterExternalWrite = connection.readCount("FROM eidos__columns")
    const page = runtime.getRowPage("records", 0, 2, {}, 3)
    expect(connection.readCount("FROM eidos__columns")).toBe(
      readsAfterExternalWrite + 1
    )
    expect(page.rows[0]).toHaveProperty("owner", null)
    eidosFile.close()
  })
})
