import { parse } from "csv-parse/sync"

import { BaseError } from "./errors"
import { baseFieldDisplayValues } from "./field-conversion"
import {
  decodeBaseRelationDisplay,
  decodeBaseRelationIds,
} from "./relation-values"
import type { BaseRuntime } from "./runtime"
import type {
  BaseCsvExportColumn,
  BaseFieldInfo,
  BaseCsvFieldType,
  BaseCsvImportColumn,
  BaseCsvImportIssue,
  BaseCsvImportOptions,
  BaseCsvImportPlan,
  BaseCsvImportResult,
  BaseRow,
} from "./types"

export const BASE_CSV_PREVIEW_ROW_COUNT = 5
export const BASE_CSV_INFERENCE_ROW_COUNT = 1_000

function encodeCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function encodeBaseCsvRecord(values: readonly string[]): string {
  return `${values.map(encodeCsvCell).join(",")}\r\n`
}

export function baseCsvExportHeader(
  columns: readonly BaseCsvExportColumn[]
): string {
  return encodeBaseCsvRecord(columns.map((column) => column.name))
}

export function createBaseCsvRowEncoder(
  fields: readonly BaseFieldInfo[],
  columns: readonly BaseCsvExportColumn[]
): (row: BaseRow) => string {
  const fieldsByColumn = new Map(
    fields.map((field) => [field.tableColumnName, field])
  )
  const resolvedFields = columns.map((column) => {
    const field = fieldsByColumn.get(column.columnName)
    if (!field) {
      throw new BaseError(
        "field-not-found",
        `Base field not found: ${column.columnName}`
      )
    }
    return field
  })

  return (row) =>
    encodeBaseCsvRecord(
      resolvedFields.map((field) => {
        if (field.type === "link") {
          const display = decodeBaseRelationDisplay(
            row[`${field.tableColumnName}__display`]
          )
          return (
            display.length > 0
              ? display.map((entry) => entry.title)
              : decodeBaseRelationIds(row[field.tableColumnName])
          ).join(", ")
        }
        return baseFieldDisplayValues(
          field,
          row[field.tableColumnName] ?? null
        ).join(", ")
      })
    )
}

interface ParsedCsv {
  header: string[]
  rows: string[][]
  skippedRowCount: number
  issues: BaseCsvImportIssue[]
}

function invalidCsv(error: unknown): BaseError {
  const candidate = error as { code?: string; lines?: number; message?: string }
  if (candidate.code === "CSV_QUOTE_NOT_CLOSED") {
    return new BaseError(
      "invalid-csv",
      `CSV parsing failed: unclosed quote at line ${candidate.lines ?? "unknown"}`
    )
  }
  if (candidate.code === "CSV_INVALID_CLOSING_QUOTE") {
    return new BaseError(
      "invalid-csv",
      "CSV parsing failed: invalid closing quote"
    )
  }
  return new BaseError(
    "invalid-csv",
    `CSV parsing failed: ${candidate.message ?? String(error)}`
  )
}

function parseCsv(content: string): ParsedCsv {
  if (!content.trim()) {
    throw new BaseError("invalid-csv", "CSV file is empty")
  }
  let records: string[][]
  let malformedRows = 0
  try {
    const parseOptions = {
      bom: true,
      columns: false,
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
      skip_records_with_error: true,
      on_skip: () => {
        malformedRows += 1
      },
    }
    records = parse(content, parseOptions) as string[][]
  } catch (error) {
    throw invalidCsv(error)
  }
  if (records.length === 0 || records[0].length === 0) {
    throw new BaseError("invalid-csv", "CSV header is missing")
  }
  const header = records[0].map((value) => String(value ?? "").trim())
  const rows: string[][] = []
  let inconsistentRows = 0
  for (const record of records.slice(1)) {
    if (record.length !== header.length) {
      inconsistentRows += 1
      continue
    }
    rows.push(record.map((value) => String(value ?? "")))
  }
  const issues: BaseCsvImportIssue[] = []
  if (malformedRows > 0) {
    issues.push({
      code: "malformed-row",
      count: malformedRows,
      message: `${malformedRows} malformed row${malformedRows === 1 ? " was" : "s were"} skipped`,
    })
  }
  if (inconsistentRows > 0) {
    issues.push({
      code: "inconsistent-column-count",
      count: inconsistentRows,
      message: `${inconsistentRows} row${inconsistentRows === 1 ? " has" : "s have"} a different column count and will be skipped`,
    })
  }
  return {
    header,
    rows,
    skippedRowCount: malformedRows + inconsistentRows,
    issues,
  }
}

function uniqueName(name: string, used: Set<string>, fallback: string): string {
  const base = name.trim() || fallback
  let candidate = base
  let suffix = 2
  while (used.has(candidate.toLocaleLowerCase())) {
    candidate = `${base} ${suffix}`
    suffix += 1
  }
  used.add(candidate.toLocaleLowerCase())
  return candidate
}

function columnIdentifier(
  name: string,
  index: number,
  used: Set<string>
): string {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  const stem = /^[a-z]/.test(normalized) ? normalized : `field_${index + 1}`
  let candidate = stem === "title" ? `field_${index + 1}` : stem
  let suffix = 2
  while (used.has(candidate)) {
    candidate = `${stem}_${suffix}`
    suffix += 1
  }
  used.add(candidate)
  return candidate
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
}

function isIsoDateTime(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(
      value
    ) && !Number.isNaN(Date.parse(value))
  )
}

function isUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function inferType(values: string[]): BaseCsvFieldType {
  const populated = values.map((value) => value.trim()).filter(Boolean)
  if (populated.length === 0) return "text"
  if (populated.every((value) => /^(?:true|false)$/i.test(value))) {
    return "checkbox"
  }
  if (
    populated.every((value) => value !== "" && Number.isFinite(Number(value)))
  ) {
    return "number"
  }
  if (populated.every(isIsoDate)) return "date"
  if (populated.every(isIsoDateTime)) return "datetime"
  if (populated.every(isUrl)) return "url"
  return "text"
}

function defaultTableName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "").trim()
  return withoutExtension || "Imported table"
}

function buildColumns(
  header: string[],
  rows: string[][]
): BaseCsvImportColumn[] {
  const usedNames = new Set<string>()
  const usedColumns = new Set<string>(["title"])
  return header.map((sourceName, sourceIndex) => {
    const name = uniqueName(sourceName, usedNames, `Column ${sourceIndex + 1}`)
    if (sourceIndex === 0) {
      return {
        sourceIndex,
        sourceName,
        name,
        columnName: "title",
        type: "title",
      }
    }
    return {
      sourceIndex,
      sourceName,
      name,
      columnName: columnIdentifier(name, sourceIndex, usedColumns),
      type: inferType(
        rows
          .slice(0, BASE_CSV_INFERENCE_ROW_COUNT)
          .map((row) => row[sourceIndex] ?? "")
      ),
    }
  })
}

export function planBaseCsvImport(
  file: { name: string; content: string },
  options: BaseCsvImportOptions = {}
): BaseCsvImportPlan {
  const { plan, parsed } = buildImportPlan(file, options)
  parsed.rows.forEach((row, rowIndex) =>
    baseCsvRowToBaseRow(row, rowIndex + 2, plan)
  )
  return plan
}

export function prepareBaseCsvImport(
  file: { name: string; content: string },
  options: BaseCsvImportOptions = {}
): { plan: BaseCsvImportPlan; rows: BaseRow[] } {
  const { plan, parsed } = buildImportPlan(file, options)
  return {
    plan,
    rows: parsed.rows.map((row, rowIndex) =>
      baseCsvRowToBaseRow(row, rowIndex + 2, plan)
    ),
  }
}

export function importBaseCsv(
  base: BaseRuntime,
  file: { name: string; content: string },
  options: BaseCsvImportOptions = {}
): BaseCsvImportResult {
  const { plan, rows } = prepareBaseCsvImport(file, options)
  return base.connection.transaction(() => {
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
    if (rows.length > 0) base.insertImportedRows(table.id, rows)
    return {
      table,
      importedRowCount: rows.length,
      skippedRowCount: plan.skippedRowCount,
    }
  })
}

function buildImportPlan(
  file: { name: string; content: string },
  options: BaseCsvImportOptions
): { plan: BaseCsvImportPlan; parsed: ParsedCsv } {
  const parsed = parseCsv(file.content)
  const plan = createBaseCsvImportPlan(
    {
      fileName: file.name,
      header: parsed.header,
      inferenceRows: parsed.rows,
      rowCount: parsed.rows.length,
      skippedRowCount: parsed.skippedRowCount,
      sampleRows: parsed.rows.slice(0, BASE_CSV_PREVIEW_ROW_COUNT),
      issues: parsed.issues,
    },
    options
  )
  return { plan, parsed }
}

export interface BaseCsvImportPlanSource {
  fileName: string
  header: string[]
  inferenceRows: string[][]
  rowCount: number
  skippedRowCount: number
  sampleRows: string[][]
  issues: BaseCsvImportIssue[]
}

export function createBaseCsvImportPlan(
  source: BaseCsvImportPlanSource,
  options: BaseCsvImportOptions = {}
): BaseCsvImportPlan {
  const columns = buildColumns(source.header, source.inferenceRows)
  const overrides = new Map(
    (options.columns ?? []).map((override) => [override.sourceIndex, override])
  )
  for (const column of columns) {
    const override = overrides.get(column.sourceIndex)
    if (!override) continue
    if (override.name !== undefined) {
      const name = override.name.trim()
      if (!name) {
        throw new BaseError("invalid-csv", "CSV field names cannot be empty")
      }
      column.name = name
    }
    if (column.type !== "title" && override.type) column.type = override.type
  }
  const tableName =
    options.tableName?.trim() || defaultTableName(source.fileName)
  return {
    fileName: source.fileName,
    tableName,
    rowCount: source.rowCount,
    skippedRowCount: source.skippedRowCount,
    columns,
    sampleRows: source.sampleRows,
    issues: source.issues,
  }
}

function convertValue(
  value: string,
  type: BaseCsvImportColumn["type"],
  rowNumber: number,
  fieldName: string
): BaseRow[string] {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (type === "number") {
    const number = Number(trimmed)
    if (!Number.isFinite(number)) {
      throw new BaseError(
        "invalid-csv",
        `CSV row ${rowNumber}, field “${fieldName}” is not a number`
      )
    }
    return number
  }
  if (type === "checkbox") {
    if (!/^(?:true|false)$/i.test(trimmed)) {
      throw new BaseError(
        "invalid-csv",
        `CSV row ${rowNumber}, field “${fieldName}” is not true or false`
      )
    }
    return /^true$/i.test(trimmed) ? 1 : 0
  }
  return value
}

export function baseCsvRowToBaseRow(
  row: string[],
  rowNumber: number,
  plan: BaseCsvImportPlan
): BaseRow {
  return Object.fromEntries(
    plan.columns.map((column) => [
      column.columnName,
      convertValue(
        row[column.sourceIndex] ?? "",
        column.type,
        rowNumber,
        column.name
      ),
    ])
  )
}

export function parseBaseCsvRows(
  file: { name: string; content: string },
  plan: BaseCsvImportPlan
): BaseRow[] {
  return parseCsv(file.content).rows.map((row, rowIndex) =>
    baseCsvRowToBaseRow(row, rowIndex + 2, plan)
  )
}
