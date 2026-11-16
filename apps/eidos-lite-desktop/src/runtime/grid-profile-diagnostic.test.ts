import fs from "node:fs"
import { createHash } from "node:crypto"
import { performance } from "node:perf_hooks"
import { expect, it, vi } from "vitest"
import { decodeEidosFileValues } from "@eidos.space/eidos-file"
import { NodeSqliteConnectionPort } from "@eidos.space/eidos-file/node-sqlite"
import { openEidosLiteFileRuntime } from "./eidos-file-runtime"

// Opt-in observations, never a timing gate. Protect Desktop inputs with the
// OS write-denial profile as well as this physically read-only Runtime.
const catalog = process.env.EIDOS_GRID_PROFILE_CATALOG
const report = process.env.EIDOS_GRID_PROFILE_REPORT

it.skipIf(!catalog || !report)(
  "records readonly page and asset lookup timings without opening a SpaceSession",
  async () => {
    let stage = "open"
    const sqlTrace: Array<{
      stage: string
      method: string
      sql: string
      ms: number
    }> = []
    const originalQuery = NodeSqliteConnectionPort.prototype.query
    const originalGet = NodeSqliteConnectionPort.prototype.get
    const querySpy = vi
      .spyOn(NodeSqliteConnectionPort.prototype, "query")
      .mockImplementation(
        function (this: NodeSqliteConnectionPort, sql, bindings) {
          const started = performance.now()
          const result = originalQuery.call(this, sql, bindings)
          sqlTrace.push({
            stage,
            method: "query",
            sql,
            ms: performance.now() - started,
          })
          return result
        }
      )
    const getSpy = vi
      .spyOn(NodeSqliteConnectionPort.prototype, "get")
      .mockImplementation(
        function (this: NodeSqliteConnectionPort, sql, bindings) {
          const started = performance.now()
          const result = originalGet.call(this, sql, bindings)
          sqlTrace.push({
            stage,
            method: "get",
            sql,
            ms: performance.now() - started,
          })
          return result
        }
      )
    const started = performance.now()
    const opened = await openEidosLiteFileRuntime(catalog!, { readOnly: true })
    const openedMs = performance.now() - started
    try {
      const table = opened.initialSnapshot.tables[0]!
      const view = table.views.find((value) => value.name === "All Files")!
      const query = { sorts: view.sorts }
      const offset = Math.floor((table.rowCount - 1) / 100) * 100
      let start = performance.now()
      stage = "page-with-total-hint"
      const page = await opened.source.getPage(
        table.table.id,
        offset,
        100,
        query,
        table.rowCount
      )
      const firstPageMs = performance.now() - start
      const file = table.fields.find((field) => field.type === "file")!
      const entries = page.rows.flatMap((row) => {
        const value = row[file.tableColumnName]
        return typeof value === "string" ? decodeEidosFileValues(value) : []
      })
      const results = []
      for (const entry of entries.slice(0, 4)) {
        stage = "asset-lookup"
        start = performance.now()
        const found = await opened.findFileEntry(entry.id)
        const lookupMs = performance.now() - start
        expect(found).toEqual(entry)
        stage = "following-page-with-total-hint"
        start = performance.now()
        const following = await opened.source.getPage(
          table.table.id,
          offset,
          100,
          query,
          table.rowCount
        )
        results.push({
          entryIdSha256: createHash("sha256").update(entry.id).digest("hex"),
          mediaType: entry.mediaType,
          lookupMs,
          followingPageMs: performance.now() - start,
          followingDigest: createHash("sha256")
            .update(JSON.stringify(following.rows))
            .digest("hex"),
        })
      }
      fs.writeFileSync(
        report!,
        JSON.stringify(
          {
            notice:
              "Saved-view diagnostic; not the user live query or native IPC",
            openedMs,
            query,
            total: table.rowCount,
            offset,
            rows: page.rows.length,
            firstPageMs,
            digest: createHash("sha256")
              .update(JSON.stringify(page.rows))
              .digest("hex"),
            results,
            sqlTrace,
          },
          null,
          2
        ) + "\n"
      )
    } finally {
      await opened.close()
      querySpy.mockRestore()
      getSpy.mockRestore()
    }
  },
  120_000
)
