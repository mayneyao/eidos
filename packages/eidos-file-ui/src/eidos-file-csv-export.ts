import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import {
  decodeEidosFileJsonArray,
  decodeEidosFileMultiSelectValues,
  decodeEidosFileRelationDisplay,
  decodeEidosFileRelationIds,
  decodeEidosFileValues,
  encodeEidosFileCsvRecord,
} from "@eidos.space/eidos-file"

import type { EidosFileEditorDataSource } from "./data-source"
import { eidosFileFieldDisplayName } from "./eidos-file-field-visibility"
import { orderedEidosFileFields } from "./eidos-file-view-layout"
import { eidosFileViewRowQuery } from "./eidos-file-view-query"

const DEFAULT_CSV_PAGE_SIZE = 500

export interface EidosFileViewCsvExport {
  bytes: Uint8Array
  rowCount: number
}

export interface ExportEidosFileViewCsvOptions {
  source: EidosFileEditorDataSource
  table: EidosFileTableSnapshot
  view?: EidosFileViewInfo
  search?: string
  pageSize?: number
}

function arrayText(values: readonly string[]): string {
  return values.join(", ")
}

function csvCellText(row: EidosFileRow, field: EidosFileFieldInfo): string {
  const value = row[field.tableColumnName]
  if (value === null || value === undefined) return ""
  const primitive = typeof value === "boolean" ? (value ? 1 : 0) : value
  if (field.type === "relation") {
    const display = decodeEidosFileRelationDisplay(
      row[`${field.tableColumnName}__display`]
    )
    return display.length > 0
      ? arrayText(display.map((entry) => entry.title))
      : arrayText(decodeEidosFileRelationIds(primitive))
  }
  if (field.type === "file") {
    return arrayText(
      decodeEidosFileValues(primitive).map((entry) => entry.name)
    )
  }
  if (field.type === "multi-select") {
    return arrayText(decodeEidosFileMultiSelectValues(primitive))
  }
  if (field.storageCodec === "json_array") {
    return arrayText(
      decodeEidosFileJsonArray(primitive).flatMap((entry) =>
        entry === null ? [] : [String(entry)]
      )
    )
  }
  if (field.type === "checkbox") {
    return value === true || value === 1 || value === "1" ? "true" : "false"
  }
  return primitive instanceof Uint8Array ? "" : String(primitive)
}

/** Builds a UTF-8 CSV for the current view through the public paged data source. */
export async function exportEidosFileViewCsv({
  source,
  table,
  view,
  search = "",
  pageSize = DEFAULT_CSV_PAGE_SIZE,
}: ExportEidosFileViewCsvOptions): Promise<EidosFileViewCsvExport> {
  const fields = orderedEidosFileFields(table.fields, view)
  if (fields.length === 0) {
    throw new Error("The current Eidos File view has no visible fields")
  }
  const limit = Math.max(1, Math.trunc(pageSize))
  const query = eidosFileViewRowQuery(view, search)
  const chunks = [
    "\uFEFF",
    encodeEidosFileCsvRecord(fields.map(eidosFileFieldDisplayName)),
  ]
  let offset = 0
  let totalHint: number | undefined
  let cursor: string | undefined

  while (totalHint === undefined || offset < totalHint) {
    const page = await source.getPage(
      table.table.id,
      offset,
      limit,
      query,
      totalHint,
      cursor,
      {
        columns: fields.map((field) => field.tableColumnName),
        fieldLimit: fields.length,
        includeRecordLabel: false,
        includeRelationDisplays: true,
      }
    )
    totalHint = page.total
    cursor = page.nextCursor
    for (const row of page.rows) {
      chunks.push(
        encodeEidosFileCsvRecord(fields.map((field) => csvCellText(row, field)))
      )
    }
    offset += page.rows.length
    if (page.rows.length === 0) break
  }

  return {
    bytes: new TextEncoder().encode(chunks.join("")),
    rowCount: offset,
  }
}
