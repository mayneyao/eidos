import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { parentPort, workerData } from "node:worker_threads"

import type {
  BaseCsvImportIssue,
  BaseCsvImportOptions,
  BaseCsvImportPlan,
  BaseCsvImportResult,
  BaseRow,
} from "@eidos.space/base"
import { openBaseFile } from "@eidos.space/base/better-sqlite3"
import {
  BASE_CSV_INFERENCE_ROW_COUNT,
  BASE_CSV_PREVIEW_ROW_COUNT,
  baseCsvRowToBaseRow,
  createBaseCsvImportPlan,
} from "@eidos.space/base/csv"
import { parse } from "csv-parse"

import type {
  BaseCsvFileFingerprint,
  BaseCsvWorkerRequest,
  BaseCsvWorkerProgress,
  BaseCsvWorkerResponse,
} from "./base-csv-worker-protocol"
import { exportBaseCsvToFile } from "./base-csv-export"

const MAX_CSV_BYTES = 512 * 1024 * 1024
const MAX_CSV_ROWS = 1_000_000
const MAX_CSV_COLUMNS = 500
const MAX_CSV_CELL_BYTES = 1024 * 1024
const MAX_CSV_RECORD_BYTES = 8 * 1024 * 1024
const INSERT_BATCH_SIZE = 500

if (!parentPort) throw new Error("Base CSV worker requires a parent port")
const port = parentPort

function reportProgress(progress: BaseCsvWorkerProgress["progress"]): void {
  port.postMessage({
    type: "progress",
    progress,
  } satisfies BaseCsvWorkerProgress)
}

function invalidCsv(message: string): Error {
  const error = new Error(message)
  error.name = "BaseCsvError"
  return error
}

async function requireUnchangedFile(
  filePath: string,
  expected: BaseCsvFileFingerprint
): Promise<void> {
  const current = await stat(filePath)
  if (!current.isFile()) throw invalidCsv("The selected CSV is not a file")
  if (current.size > MAX_CSV_BYTES) {
    throw invalidCsv("CSV files larger than 512 MB are not supported")
  }
  if (current.size !== expected.size || current.mtimeMs !== expected.mtimeMs) {
    throw invalidCsv(
      "The selected CSV changed; choose it again before importing"
    )
  }
}

function checkedRecord(record: unknown): string[] {
  if (!Array.isArray(record)) throw invalidCsv("CSV record must be an array")
  if (record.length > MAX_CSV_COLUMNS) {
    throw invalidCsv(
      `CSV files cannot contain more than ${MAX_CSV_COLUMNS} columns`
    )
  }
  return record.map((value) => {
    const text = String(value ?? "")
    if (Buffer.byteLength(text, "utf8") > MAX_CSV_CELL_BYTES) {
      throw invalidCsv("A CSV cell exceeds the 1 MB limit")
    }
    return text
  })
}

async function visitCsvRows(
  sourcePath: string,
  visit: (
    row: string[],
    rowNumber: number,
    header: string[]
  ) => Promise<void> | void,
  onProgress?: (progress: {
    processedBytes: number
    processedRows: number
  }) => void
): Promise<{
  header: string[]
  rowCount: number
  malformedRows: number
  inconsistentRows: number
}> {
  let malformedRows = 0
  const source = createReadStream(sourcePath)
  const parser = source.pipe(
    parse({
      bom: true,
      columns: false,
      relax_column_count: true,
      relax_quotes: true,
      max_record_size: MAX_CSV_RECORD_BYTES,
      skip_empty_lines: true,
      skip_records_with_error: true,
    })
  )
  parser.on("skip", () => {
    malformedRows += 1
  })

  let header: string[] | null = null
  let rowCount = 0
  let inconsistentRows = 0
  let recordNumber = 0
  let lastProgressAt = 0
  const emitProgress = (force = false) => {
    if (!onProgress) return
    const now = Date.now()
    if (!force && now - lastProgressAt < 100) return
    lastProgressAt = now
    onProgress({
      processedBytes: source.bytesRead,
      processedRows: rowCount,
    })
  }
  for await (const rawRecord of parser) {
    recordNumber += 1
    const record = checkedRecord(rawRecord)
    if (!header) {
      if (record.length === 0) throw invalidCsv("CSV header is missing")
      header = record.map((value) => value.trim())
      continue
    }
    if (record.length !== header.length) {
      inconsistentRows += 1
      continue
    }
    rowCount += 1
    if (rowCount > MAX_CSV_ROWS) {
      throw invalidCsv(
        `CSV files cannot contain more than ${MAX_CSV_ROWS} rows`
      )
    }
    await visit(record, recordNumber, header)
    emitProgress()
  }
  if (!header) throw invalidCsv("CSV file is empty")
  emitProgress(true)
  return { header, rowCount, malformedRows, inconsistentRows }
}

function issues(malformedRows: number, inconsistentRows: number) {
  const result: BaseCsvImportIssue[] = []
  if (malformedRows > 0) {
    result.push({
      code: "malformed-row",
      count: malformedRows,
      message: `${malformedRows} malformed row${malformedRows === 1 ? " was" : "s were"} skipped`,
    })
  }
  if (inconsistentRows > 0) {
    result.push({
      code: "inconsistent-column-count",
      count: inconsistentRows,
      message: `${inconsistentRows} row${inconsistentRows === 1 ? " has" : "s have"} a different column count and will be skipped`,
    })
  }
  return result
}

async function planCsv(
  sourcePath: string,
  fileName: string,
  options: BaseCsvImportOptions,
  onProgress?: (progress: {
    processedBytes: number
    processedRows: number
  }) => void
): Promise<BaseCsvImportPlan> {
  const inferenceRows: string[][] = []
  const sampleRows: string[][] = []
  let plan: BaseCsvImportPlan | null = null

  const summary = await visitCsvRows(
    sourcePath,
    (row, rowNumber, header) => {
      if (sampleRows.length < BASE_CSV_PREVIEW_ROW_COUNT) sampleRows.push(row)
      if (inferenceRows.length < BASE_CSV_INFERENCE_ROW_COUNT) {
        inferenceRows.push(row)
        if (inferenceRows.length === BASE_CSV_INFERENCE_ROW_COUNT) {
          plan = createBaseCsvImportPlan(
            {
              fileName,
              header,
              inferenceRows,
              rowCount: 0,
              skippedRowCount: 0,
              sampleRows,
              issues: [],
            },
            options
          )
          for (let index = 0; index < inferenceRows.length; index += 1) {
            baseCsvRowToBaseRow(inferenceRows[index], index + 2, plan)
          }
        }
        return
      }
      if (plan) baseCsvRowToBaseRow(row, rowNumber, plan)
    },
    onProgress
  )
  let completedPlan = plan as BaseCsvImportPlan | null
  if (!completedPlan) {
    completedPlan = createBaseCsvImportPlan(
      {
        fileName,
        header: summary.header,
        inferenceRows,
        rowCount: summary.rowCount,
        skippedRowCount: summary.malformedRows + summary.inconsistentRows,
        sampleRows,
        issues: issues(summary.malformedRows, summary.inconsistentRows),
      },
      options
    )
    for (let index = 0; index < inferenceRows.length; index += 1) {
      baseCsvRowToBaseRow(inferenceRows[index], index + 2, completedPlan)
    }
  } else {
    completedPlan.rowCount = summary.rowCount
    completedPlan.skippedRowCount =
      summary.malformedRows + summary.inconsistentRows
    completedPlan.issues = issues(
      summary.malformedRows,
      summary.inconsistentRows
    )
  }
  return completedPlan
}

async function importCsv(
  request: BaseCsvWorkerRequest & { operation: "import" }
) {
  const plan = await planCsv(
    request.sourcePath,
    request.fileName,
    request.options,
    ({ processedBytes, processedRows }) =>
      reportProgress({
        phase: "analyzing",
        processedBytes,
        totalBytes: request.fingerprint.size,
        processedRows,
        totalRows: null,
      })
  )
  await requireUnchangedFile(request.sourcePath, request.fingerprint)
  const base = openBaseFile(request.targetPath, { migrate: true })
  try {
    base.connection.exec("BEGIN IMMEDIATE")
    try {
      const table = base.createTable({
        name: plan.tableName,
        fields: plan.columns.flatMap((column) =>
          column.type === "title"
            ? []
            : [
                {
                  name: column.name,
                  columnName: column.columnName,
                  type: column.type,
                },
              ]
        ),
      })
      base.updateField(table.id, "title", { name: plan.columns[0].name })
      let batch: BaseRow[] = []
      let importedRowCount = 0
      reportProgress({
        phase: "importing",
        processedBytes: 0,
        totalBytes: request.fingerprint.size,
        processedRows: 0,
        totalRows: plan.rowCount,
      })
      const summary = await visitCsvRows(
        request.sourcePath,
        async (row, rowNumber) => {
          batch.push(baseCsvRowToBaseRow(row, rowNumber, plan))
          if (batch.length < INSERT_BATCH_SIZE) return
          base.insertImportedRows(table.id, batch)
          importedRowCount += batch.length
          batch = []
        },
        ({ processedBytes, processedRows }) =>
          reportProgress({
            phase: "importing",
            processedBytes,
            totalBytes: request.fingerprint.size,
            processedRows,
            totalRows: plan.rowCount,
          })
      )
      if (batch.length > 0) {
        base.insertImportedRows(table.id, batch)
        importedRowCount += batch.length
      }
      await requireUnchangedFile(request.sourcePath, request.fingerprint)
      if (
        summary.rowCount !== plan.rowCount ||
        summary.malformedRows + summary.inconsistentRows !==
          plan.skippedRowCount
      ) {
        throw invalidCsv("The selected CSV changed while it was being imported")
      }
      reportProgress({
        phase: "finalizing",
        processedBytes: request.fingerprint.size,
        totalBytes: request.fingerprint.size,
        processedRows: importedRowCount,
        totalRows: plan.rowCount,
      })
      base.connection.exec("COMMIT")
      return {
        table,
        importedRowCount,
        skippedRowCount: plan.skippedRowCount,
      } satisfies BaseCsvImportResult
    } catch (error) {
      try {
        base.connection.exec("ROLLBACK")
      } catch {}
      throw error
    }
  } finally {
    base.close()
  }
}

async function exportCsv(
  request: BaseCsvWorkerRequest & { operation: "export" }
) {
  return exportBaseCsvToFile({
    sourcePath: request.sourcePath,
    targetPath: request.targetPath,
    tableId: request.tableId,
    options: request.options,
    onProgress: (progress) =>
      reportProgress({
        ...progress,
        totalBytes: 0,
      }),
  })
}

async function run(
  request: BaseCsvWorkerRequest
): Promise<BaseCsvWorkerResponse> {
  try {
    if (request.operation === "export") {
      return {
        ok: true,
        operation: "export",
        result: await exportCsv(request),
      }
    }
    await requireUnchangedFile(request.sourcePath, request.fingerprint)
    if (request.operation === "plan") {
      const plan = await planCsv(
        request.sourcePath,
        request.fileName,
        request.options,
        ({ processedBytes, processedRows }) =>
          reportProgress({
            phase: "analyzing",
            processedBytes,
            totalBytes: request.fingerprint.size,
            processedRows,
            totalRows: null,
          })
      )
      await requireUnchangedFile(request.sourcePath, request.fingerprint)
      return {
        ok: true,
        operation: "plan",
        plan,
      }
    }
    return {
      ok: true,
      operation: "import",
      result: await importCsv(request),
    }
  } catch (error) {
    return {
      ok: false,
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

void run(workerData as BaseCsvWorkerRequest).then((response) => {
  port.postMessage(response)
  port.close()
})
