import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { performance } from "node:perf_hooks"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { EIDOS_LITE_PERFORMANCE_BUDGET_MS } from "../shared/performance-contract"
import {
  createEidosLiteFileRuntime,
  type EidosLiteFileRuntime,
} from "../runtime/eidos-file-runtime"

const performanceEnabled = process.env.EIDOS_LITE_RUN_PERFORMANCE === "1"
const MILLION_ROWS = 1_000_000
const CSV_BATCH_SIZE = 10_000

async function timed<T>(operation: () => Promise<T>): Promise<{
  value: T
  durationMs: number
}> {
  const startedAt = performance.now()
  const value = await operation()
  return { value, durationMs: performance.now() - startedAt }
}

describe.runIf(performanceEnabled)("Eidos Lite million-row CSV import", () => {
  let root: string
  let csvPath: string
  let filePath: string
  let runtime: EidosLiteFileRuntime
  let fixturePreparationMs = 0

  beforeAll(async () => {
    root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-csv-performance-")
    )
    csvPath = path.join(root, "million-rows.csv")
    filePath = path.join(root, "million-rows.eidos")
    const fixtureStartedAt = performance.now()
    const handle = await fs.open(csvPath, "w")
    try {
      await handle.write("name,category,score,status\n")
      for (let start = 0; start < MILLION_ROWS; start += CSV_BATCH_SIZE) {
        const end = Math.min(start + CSV_BATCH_SIZE, MILLION_ROWS)
        const lines = Array.from({ length: end - start }, (_, batchIndex) => {
          const index = start + batchIndex
          return `Record ${index},Category ${index % 20},${index},Status ${index % 4}`
        })
        await handle.write(`${lines.join("\n")}\n`)
      }
    } finally {
      await handle.close()
    }
    fixturePreparationMs = performance.now() - fixtureStartedAt
    runtime = await createEidosLiteFileRuntime(filePath, "CSV performance")
  }, 120_000)

  afterAll(async () => {
    await runtime?.close().catch(() => undefined)
    await fs.rm(root, { recursive: true, force: true })
  })

  it("analyzes, imports, and exposes the final million-row table exactly once", async () => {
    const csvStats = await fs.stat(csvPath)
    const source = {
      sourcePath: csvPath,
      fileName: path.basename(csvPath),
      size: csvStats.size,
      modifiedAtMs: csvStats.mtimeMs,
    }
    const preview = await timed(() =>
      runtime.previewCsvFile(source, {}, "million-preview")
    )
    const imported = await timed(() =>
      runtime.importCsvFile(
        source,
        {
          tableName: preview.value.tableName,
          columns: preview.value.columns.map((column) => ({
            sourceIndex: column.sourceIndex,
            name: column.name,
            ...(column.type === "record-label" ? {} : { type: column.type }),
          })),
        },
        "million-import"
      )
    )
    const importedTable = imported.value.snapshot.tables.find(
      (table) => table.table.id === imported.value.result.table.id
    )
    const finalProgress = runtime.getCsvOperationProgress("million-import")

    console.info(
      JSON.stringify({
        benchmark: "csv-million-import",
        fixturePreparationMs,
        csvBytes: csvStats.size,
        previewMs: preview.durationMs,
        importMs: imported.durationMs,
        analyzedRows: preview.value.rowCount,
        importedRows: imported.value.result.importedRowCount,
      })
    )
    expect(preview.value.rowCount).toBe(MILLION_ROWS)
    expect(imported.value.result.importedRowCount).toBe(MILLION_ROWS)
    expect(importedTable?.rowCount).toBe(MILLION_ROWS)
    expect(finalProgress).toMatchObject({
      kind: "import",
      status: "completed",
      phase: "finalizing",
      processedBytes: csvStats.size,
      processedRows: MILLION_ROWS,
      totalRows: MILLION_ROWS,
    })
    expect(preview.durationMs).toBeLessThanOrEqual(
      EIDOS_LITE_PERFORMANCE_BUDGET_MS.csvAnalyzeMillionRows
    )
    expect(imported.durationMs).toBeLessThanOrEqual(
      EIDOS_LITE_PERFORMANCE_BUDGET_MS.csvImportMillionRows
    )
  }, 120_000)
})
