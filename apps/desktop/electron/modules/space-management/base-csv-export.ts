import { createWriteStream, type WriteStream } from "node:fs"
import { once } from "node:events"

import type {
  BaseCsvExportOptions,
  BaseCsvExportResult,
} from "@eidos.space/base"
import { openBaseFile } from "@eidos.space/base/better-sqlite3"
import {
  baseCsvExportHeader,
  createBaseCsvRowEncoder,
} from "@eidos.space/base/csv"

const EXPORT_PAGE_SIZE = 500

export interface BaseCsvExportProgress {
  processedBytes: number
  processedRows: number
  totalRows: number
  phase: "exporting" | "finalizing"
}

async function writeCsvChunk(
  stream: WriteStream,
  chunk: string
): Promise<void> {
  if (stream.write(chunk, "utf8")) return
  await once(stream, "drain")
}

async function finishCsvStream(stream: WriteStream): Promise<void> {
  stream.end()
  await once(stream, "finish")
}

export async function exportBaseCsvToFile({
  sourcePath,
  targetPath,
  tableId,
  options,
  onProgress,
}: {
  sourcePath: string
  targetPath: string
  tableId: string
  options: BaseCsvExportOptions
  onProgress?: (progress: BaseCsvExportProgress) => void
}): Promise<BaseCsvExportResult> {
  if (options.columns.length === 0) {
    throw new Error("CSV export requires at least one visible field")
  }
  if (options.columns.length > 500) {
    throw new Error("CSV exports cannot contain more than 500 columns")
  }
  const base = openBaseFile(sourcePath)
  const stream = createWriteStream(targetPath, {
    encoding: "utf8",
    flags: "wx",
  })
  let transactionOpen = false
  try {
    const fields = base.listFields(tableId)
    const encodeRow = createBaseCsvRowEncoder(fields, options.columns)
    base.connection.exec("BEGIN")
    transactionOpen = true
    const query = options.query ?? {}
    const totalRows = base.countRows(tableId, query)
    let exportedRowCount = 0
    let cursor: string | undefined

    onProgress?.({
      phase: "exporting",
      processedBytes: 0,
      processedRows: 0,
      totalRows,
    })
    await writeCsvChunk(stream, "\ufeff")
    await writeCsvChunk(stream, baseCsvExportHeader(options.columns))

    while (exportedRowCount < totalRows) {
      const page = base.getRowPage(
        tableId,
        exportedRowCount,
        EXPORT_PAGE_SIZE,
        query,
        totalRows,
        cursor
      )
      if (page.rows.length === 0) break
      await writeCsvChunk(stream, page.rows.map(encodeRow).join(""))
      exportedRowCount += page.rows.length
      cursor = page.nextCursor
      onProgress?.({
        phase: "exporting",
        processedBytes: stream.bytesWritten,
        processedRows: exportedRowCount,
        totalRows,
      })
    }
    if (exportedRowCount !== totalRows) {
      throw new Error(
        `CSV export stopped after ${exportedRowCount} of ${totalRows} rows`
      )
    }

    onProgress?.({
      phase: "finalizing",
      processedBytes: stream.bytesWritten,
      processedRows: exportedRowCount,
      totalRows,
    })
    await finishCsvStream(stream)
    base.connection.exec("COMMIT")
    transactionOpen = false
    return { exportedRowCount }
  } catch (error) {
    stream.destroy()
    throw error
  } finally {
    if (transactionOpen) {
      try {
        base.connection.exec("ROLLBACK")
      } catch {}
    }
    base.close()
  }
}
