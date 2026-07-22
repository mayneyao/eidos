import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { createEidosFile } from "./better-sqlite3"
import type {
  EidosFileConnection,
  EidosFileRunResult,
  EidosFileSqlParams,
  EidosFileSqlPrimitive,
} from "./connection"
import { EidosFileRuntime } from "./runtime"

class CountingConnection implements EidosFileConnection {
  readonly reads: string[] = []
  readonly capabilities: EidosFileConnection["capabilities"]

  constructor(private readonly source: EidosFileConnection) {
    this.capabilities = source.capabilities
  }

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
    if (this.source.runMany) this.source.runMany(sql, parameterSets)
    else parameterSets.forEach((params) => this.source.run(sql, params))
  }
  registerFunction(
    name: string,
    operation: (...values: EidosFileSqlPrimitive[]) => EidosFileSqlPrimitive
  ): void {
    this.source.registerFunction(name, operation)
  }
  transaction<T>(operation: () => T): T {
    return this.source.transaction(operation)
  }
  dataVersion(): number {
    return this.source.dataVersion()
  }
  interrupt(): void {
    this.source.interrupt()
  }

  readCount(fragment: string): number {
    return this.reads.filter((sql) => sql.includes(fragment)).length
  }
}

describe("EidosFileRuntime metadata cache", () => {
  const roots: string[] = []
  afterEach(() =>
    roots
      .splice(0)
      .forEach((root) => rmSync(root, { recursive: true, force: true }))
  )

  function setup() {
    const root = mkdtempSync(path.join(tmpdir(), "eidos-file-cache-"))
    roots.push(root)
    const owner = createEidosFile(path.join(root, "records.eidos"), {
      defaultTable: {
        name: "Records",
        fields: [{ name: "Name", columnName: "Name", type: "text" }],
      },
    })
    const tableId = owner.listTables()[0]!.id
    owner.insertImportedRows(tableId, [{ Name: "One" }, { Name: "Two" }])
    const connection = new CountingConnection(owner.connection)
    return {
      owner,
      connection,
      runtime: new EidosFileRuntime(connection),
      tableId,
    }
  }

  it("reuses the normalized schema while SQLite data_version is unchanged", () => {
    const { owner, connection, runtime, tableId } = setup()
    runtime.getRowPage(tableId, 0, 1)
    const tables = connection.readCount("FROM eidos__tables")
    const fields = connection.readCount("FROM eidos__fields")
    runtime.getRowPage(tableId, 1, 1)
    expect(connection.readCount("FROM eidos__tables")).toBe(tables)
    expect(connection.readCount("FROM eidos__fields")).toBe(fields)
    owner.close()
  })

  it("invalidates cached metadata after a Runtime schema mutation", () => {
    const { owner, connection, runtime, tableId } = setup()
    runtime.getRowPage(tableId, 0, 1)
    const before = connection.readCount("FROM eidos__fields")
    runtime.addField(tableId, {
      name: "Status",
      columnName: "Status",
      type: "text",
    })
    runtime.getRowPage(tableId, 0, 1)
    expect(connection.readCount("FROM eidos__fields")).toBeGreaterThan(before)
    owner.close()
  })
})
