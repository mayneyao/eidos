import { randomBytes } from "node:crypto"
import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import {
  ConnectionPortEidosFileConnection,
  createEidosFileCsvImportPlan,
  decodeEidosFileValues,
  eidosFileCsvRowToEidosFileRow,
  encodeEidosFileValues,
  EidosFileRuntime,
  EIDOS_FILE_CSV_INFERENCE_ROW_COUNT,
  EIDOS_FILE_CSV_PREVIEW_ROW_COUNT,
  Runtime,
  quoteIdentifier,
  type FileEntry,
  type EidosFileCsvImportIssue,
  type EidosFileCsvImportOptions,
  type EidosFileCsvImportPlan,
  type EidosFileCsvImportResult,
  type EidosFileRow,
  type EidosFileTableInfo,
  type RequestContext,
  type RuntimeEnvironment,
  type RuntimeFactoryContext,
  type RuntimeHostBridge,
} from "@eidos.space/eidos-file"
import {
  NodeSqliteConnectionPort,
  hasSqliteHeader,
} from "@eidos.space/eidos-file/node-sqlite"
import { EidosRuntimeEditorDataSource } from "@eidos.space/eidos-file-ui/runtime-editor-data-source"
import { parse } from "csv-parse"

import {
  EIDOS_LITE_CSV_FILE_BYTES_MAX,
  type EidosLiteCsvOperationProgress,
} from "../shared/contracts"

const MAX_CSV_ROWS = 2_000_000
const MAX_CSV_COLUMNS = 500
const MAX_CSV_CELL_BYTES = 1024 * 1024
const MAX_CSV_RECORD_BYTES = 8 * 1024 * 1024
const INSERT_BATCH_SIZE = 500
const COMPLETED_OPERATION_TTL_MS = 5 * 60_000
const MAX_RETAINED_OPERATIONS = 32
const MAX_RETAINED_CSV_PLANS = 32

export interface EidosLiteCsvFileSource {
  sourcePath: string
  fileName: string
  size: number
  modifiedAtMs: number
}

interface ActiveCsvOperation {
  controller: AbortController
  progress: EidosLiteCsvOperationProgress
}

function invalidCsv(message: string): Error {
  const error = new Error(message)
  error.name = "EidosFileCsvError"
  return error
}

function canceledCsv(): Error {
  const error = new Error("Eidos File CSV operation canceled")
  error.name = "EidosFileCsvCanceledError"
  return error
}

function assertNotCanceled(signal: AbortSignal): void {
  if (signal.aborted) throw canceledCsv()
}

function csvPlanValidationKey(
  source: EidosLiteCsvFileSource,
  options: EidosFileCsvImportOptions
): string {
  const types = [
    ...new Map(
      (options.columns ?? [])
        .filter((column) => column.type !== undefined)
        .map((column) => [column.sourceIndex, column.type] as const)
    ).entries(),
  ].sort(([left], [right]) => left - right)
  return JSON.stringify({
    sourcePath: source.sourcePath,
    fileName: source.fileName,
    size: source.size,
    modifiedAtMs: source.modifiedAtMs,
    types,
  })
}

function resolvedCsvPlanValidationKey(
  source: EidosLiteCsvFileSource,
  plan: EidosFileCsvImportPlan
): string {
  return csvPlanValidationKey(source, {
    columns: plan.columns.flatMap((column) =>
      column.type === "record-label"
        ? []
        : [{ sourceIndex: column.sourceIndex, type: column.type }]
    ),
  })
}

function configureRetainedCsvPlan(
  retained: EidosFileCsvImportPlan,
  options: EidosFileCsvImportOptions
): EidosFileCsvImportPlan {
  const overrides = new Map(
    (options.columns ?? []).map((column) => [column.sourceIndex, column])
  )
  const columns = retained.columns.map((column) => {
    const override = overrides.get(column.sourceIndex)
    const name = override?.name?.trim() ?? column.name
    if (!name) throw invalidCsv("CSV field names cannot be empty")
    return {
      ...column,
      name,
      columnName: name,
      ...(column.type !== "record-label" && override?.type
        ? { type: override.type }
        : {}),
    }
  })
  return {
    ...retained,
    tableName: options.tableName?.trim() || retained.tableName,
    columns,
  }
}

async function requireUnchangedCsv(
  source: EidosLiteCsvFileSource
): Promise<void> {
  const current = await stat(source.sourcePath)
  if (!current.isFile()) throw invalidCsv("The selected CSV is not a file")
  if (current.size > EIDOS_LITE_CSV_FILE_BYTES_MAX) {
    throw invalidCsv("CSV files larger than 1 GiB are not supported")
  }
  if (current.size !== source.size || current.mtimeMs !== source.modifiedAtMs) {
    throw invalidCsv(
      "The selected CSV changed; choose it again before importing"
    )
  }
}

function checkedCsvRecord(record: unknown): string[] {
  if (!Array.isArray(record)) throw invalidCsv("CSV record must be an array")
  if (record.length > MAX_CSV_COLUMNS) {
    throw invalidCsv(
      `CSV files cannot contain more than ${MAX_CSV_COLUMNS} columns`
    )
  }
  return record.map((value) => {
    const text = String(value ?? "")
    if (Buffer.byteLength(text, "utf8") > MAX_CSV_CELL_BYTES) {
      throw invalidCsv("A CSV cell exceeds the 1 MiB limit")
    }
    return text
  })
}

async function visitCsvRows(
  source: EidosLiteCsvFileSource,
  signal: AbortSignal,
  visit: (
    row: string[],
    rowNumber: number,
    header: string[]
  ) => Promise<void> | void,
  onProgress: (processedBytes: number, processedRows: number) => void
): Promise<{
  header: string[]
  rowCount: number
  malformedRows: number
  inconsistentRows: number
}> {
  assertNotCanceled(signal)
  let malformedRows = 0
  const file = createReadStream(source.sourcePath, { signal })
  const parser = file.pipe(
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
  const cancel = () => {
    const error = canceledCsv()
    file.destroy(error)
    parser.destroy(error)
  }
  signal.addEventListener("abort", cancel, { once: true })
  parser.on("skip", () => {
    malformedRows += 1
  })

  let header: string[] | null = null
  let rowCount = 0
  let inconsistentRows = 0
  let recordNumber = 0
  let lastProgressAt = 0
  const report = (force = false) => {
    const now = Date.now()
    if (!force && now - lastProgressAt < 100) return
    lastProgressAt = now
    onProgress(file.bytesRead, rowCount)
  }
  try {
    for await (const rawRecord of parser) {
      assertNotCanceled(signal)
      recordNumber += 1
      const record = checkedCsvRecord(rawRecord)
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
          `CSV files cannot contain more than ${MAX_CSV_ROWS.toLocaleString()} rows`
        )
      }
      await visit(record, recordNumber, header)
      report()
    }
  } catch (error) {
    if (signal.aborted) throw canceledCsv()
    throw error
  } finally {
    signal.removeEventListener("abort", cancel)
    file.destroy()
    parser.destroy()
  }
  if (!header) throw invalidCsv("CSV file is empty")
  report(true)
  return { header, rowCount, malformedRows, inconsistentRows }
}

function csvIssues(
  malformedRows: number,
  inconsistentRows: number
): EidosFileCsvImportIssue[] {
  const issues: EidosFileCsvImportIssue[] = []
  if (malformedRows > 0) {
    issues.push({
      code: "malformed-row",
      count: malformedRows,
      message: `${malformedRows.toLocaleString()} malformed row${malformedRows === 1 ? " was" : "s were"} skipped`,
    })
  }
  if (inconsistentRows > 0) {
    issues.push({
      code: "inconsistent-column-count",
      count: inconsistentRows,
      message: `${inconsistentRows.toLocaleString()} row${inconsistentRows === 1 ? " has" : "s have"} a different column count and will be skipped`,
    })
  }
  return issues
}

async function planCsvFile(
  source: EidosLiteCsvFileSource,
  options: EidosFileCsvImportOptions,
  signal: AbortSignal,
  onProgress: (processedBytes: number, processedRows: number) => void
): Promise<EidosFileCsvImportPlan> {
  await requireUnchangedCsv(source)
  const inferenceRows: string[][] = []
  const sampleRows: string[][] = []
  let plan: EidosFileCsvImportPlan | null = null
  const summary = await visitCsvRows(
    source,
    signal,
    (row, rowNumber, header) => {
      if (sampleRows.length < EIDOS_FILE_CSV_PREVIEW_ROW_COUNT) {
        sampleRows.push(row)
      }
      if (inferenceRows.length < EIDOS_FILE_CSV_INFERENCE_ROW_COUNT) {
        inferenceRows.push(row)
        if (inferenceRows.length === EIDOS_FILE_CSV_INFERENCE_ROW_COUNT) {
          plan = createEidosFileCsvImportPlan(
            {
              fileName: source.fileName,
              header,
              inferenceRows,
              rowCount: 0,
              skippedRowCount: 0,
              sampleRows,
              issues: [],
            },
            options
          )
          inferenceRows.forEach((inferenceRow, index) =>
            eidosFileCsvRowToEidosFileRow(inferenceRow, index + 2, plan!)
          )
        }
        return
      }
      if (plan) eidosFileCsvRowToEidosFileRow(row, rowNumber, plan)
    },
    onProgress
  )
  let completedPlan = plan as EidosFileCsvImportPlan | null
  if (!completedPlan) {
    completedPlan = createEidosFileCsvImportPlan(
      {
        fileName: source.fileName,
        header: summary.header,
        inferenceRows,
        rowCount: summary.rowCount,
        skippedRowCount: summary.malformedRows + summary.inconsistentRows,
        sampleRows,
        issues: csvIssues(summary.malformedRows, summary.inconsistentRows),
      },
      options
    )
    inferenceRows.forEach((row, index) =>
      eidosFileCsvRowToEidosFileRow(row, index + 2, completedPlan!)
    )
  } else {
    completedPlan.rowCount = summary.rowCount
    completedPlan.skippedRowCount =
      summary.malformedRows + summary.inconsistentRows
    completedPlan.issues = csvIssues(
      summary.malformedRows,
      summary.inconsistentRows
    )
  }
  await requireUnchangedCsv(source)
  return completedPlan
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

async function importCsvFileIntoRuntime(
  targetPath: string,
  source: EidosLiteCsvFileSource,
  plan: EidosFileCsvImportPlan,
  signal: AbortSignal,
  onProgress: (processedBytes: number, processedRows: number) => void,
  onFinalizing: (processedRows: number) => void
): Promise<EidosFileCsvImportResult> {
  await requireUnchangedCsv(source)
  const connection = new NodeSqliteConnectionPort(
    new DatabaseSync(targetPath, {
      allowExtension: false,
      defensive: true,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      timeout: 5_000,
    })
  )
  const runtime = new EidosFileRuntime(
    new ConnectionPortEidosFileConnection(connection)
  )
  let table: EidosFileTableInfo | null = null
  let importedRowCount = 0
  try {
    const validation = connection.transaction("read", () =>
      runtime.validate({ level: "structural" })
    )
    if (!validation.valid) {
      throw invalidCsv(
        validation.errors.map((issue) => issue.message).join("; ") ||
          "The Eidos File could not be validated"
      )
    }
    await connection.transaction("write", async () => {
      assertNotCanceled(signal)
      table = runtime.createTable({
        name: plan.tableName,
        fields: plan.columns.map((column) => ({
          name: column.name,
          columnName: column.columnName,
          type: column.type === "record-label" ? "text" : column.type,
          isRecordLabel: column.type === "record-label",
          ...(column.settings ? { property: column.settings } : {}),
        })),
      })
      let batch: EidosFileRow[] = []
      const summary = await visitCsvRows(
        source,
        signal,
        async (row, rowNumber) => {
          batch.push(eidosFileCsvRowToEidosFileRow(row, rowNumber, plan))
          if (batch.length < INSERT_BATCH_SIZE) return
          runtime.appendImportedRows(table!.id, batch)
          importedRowCount += batch.length
          batch = []
          await nextTurn()
        },
        onProgress
      )
      if (batch.length > 0) {
        runtime.appendImportedRows(table.id, batch)
        importedRowCount += batch.length
      }
      await requireUnchangedCsv(source)
      if (
        summary.rowCount !== plan.rowCount ||
        summary.malformedRows + summary.inconsistentRows !==
          plan.skippedRowCount
      ) {
        throw invalidCsv("The selected CSV changed while it was being imported")
      }
      onFinalizing(importedRowCount)
    })
  } finally {
    connection.close()
  }
  if (!table) throw invalidCsv("CSV destination table was not created")
  return {
    table,
    importedRowCount,
    skippedRowCount: plan.skippedRowCount,
  }
}

class EidosLiteCsvOperations {
  private readonly operations = new Map<string, ActiveCsvOperation>()
  private readonly retainedPlans = new Map<string, EidosFileCsvImportPlan>()

  constructor(
    private readonly targetPath: string,
    private readonly snapshot: () => Promise<
      Awaited<ReturnType<EidosRuntimeEditorDataSource["getSnapshot"]>>
    >
  ) {}

  preview(
    source: EidosLiteCsvFileSource,
    options: EidosFileCsvImportOptions,
    operationId: string
  ): Promise<EidosFileCsvImportPlan> {
    const validationKey = csvPlanValidationKey(source, options)
    return this.run(operationId, "plan", source.size, async (operation) => {
      const plan = await planCsvFile(
        source,
        options,
        operation.controller.signal,
        (bytes, rows) =>
          this.update(operation, {
            processedBytes: bytes,
            processedRows: rows,
          })
      )
      this.retainPlan(source, validationKey, plan)
      return plan
    })
  }

  import(
    source: EidosLiteCsvFileSource,
    options: EidosFileCsvImportOptions,
    operationId: string
  ): Promise<{
    snapshot: Awaited<ReturnType<EidosRuntimeEditorDataSource["getSnapshot"]>>
    result: EidosFileCsvImportResult
  }> {
    const validationKey = csvPlanValidationKey(source, options)
    const retainedPlan = this.retainedPlans.get(validationKey)
    return this.run(
      operationId,
      "import",
      source.size,
      async (operation) => {
        let validatedPlan = retainedPlan
        if (!validatedPlan) {
          validatedPlan = await planCsvFile(
            source,
            options,
            operation.controller.signal,
            (bytes, rows) =>
              this.update(operation, {
                phase: "analyzing",
                processedBytes: bytes,
                processedRows: rows,
                totalRows: null,
              })
          )
          this.retainPlan(source, validationKey, validatedPlan)
        }
        const plan = configureRetainedCsvPlan(validatedPlan, options)
        this.update(operation, {
          phase: "importing",
          processedBytes: 0,
          processedRows: 0,
          totalRows: plan.rowCount,
        })
        const result = await importCsvFileIntoRuntime(
          this.targetPath,
          source,
          plan,
          operation.controller.signal,
          (bytes, rows) =>
            this.update(operation, {
              phase: "importing",
              processedBytes: bytes,
              processedRows: rows,
              totalRows: plan.rowCount,
            }),
          (rows) =>
            this.update(operation, {
              phase: "finalizing",
              processedBytes: source.size,
              processedRows: rows,
              totalRows: plan.rowCount,
            })
        )
        return { snapshot: await this.snapshot(), result }
      },
      retainedPlan
        ? { phase: "importing", totalRows: retainedPlan.rowCount }
        : undefined
    )
  }

  progress(operationId: string): EidosLiteCsvOperationProgress | null {
    this.evictCompleted()
    const operation = this.operations.get(operationId)
    return operation ? { ...operation.progress } : null
  }

  cancel(operationId: string): boolean {
    const operation = this.operations.get(operationId)
    if (!operation || operation.progress.status !== "running") return false
    this.update(operation, { status: "canceling" })
    operation.controller.abort()
    return true
  }

  close(): void {
    for (const operation of this.operations.values()) {
      operation.controller.abort()
    }
    this.operations.clear()
    this.retainedPlans.clear()
  }

  private async run<T>(
    operationId: string,
    kind: "plan" | "import",
    totalBytes: number,
    execute: (operation: ActiveCsvOperation) => Promise<T>,
    initialProgress: Pick<
      Partial<EidosLiteCsvOperationProgress>,
      "phase" | "totalRows"
    > = {}
  ): Promise<T> {
    if (!operationId || this.operations.has(operationId)) {
      throw new Error("CSV operation ID is missing or already active")
    }
    this.evictCompleted()
    while (this.operations.size >= MAX_RETAINED_OPERATIONS) {
      const oldest = this.operations.keys().next().value
      if (typeof oldest !== "string") break
      this.operations.delete(oldest)
    }
    const operation: ActiveCsvOperation = {
      controller: new AbortController(),
      progress: {
        operationId,
        kind,
        status: "running",
        phase: initialProgress.phase ?? "analyzing",
        processedBytes: 0,
        totalBytes,
        processedRows: 0,
        totalRows: initialProgress.totalRows ?? null,
        updatedAt: Date.now(),
      },
    }
    this.operations.set(operationId, operation)
    try {
      const result = await execute(operation)
      this.update(operation, { status: "completed" })
      return result
    } catch (error) {
      if (operation.controller.signal.aborted) {
        this.update(operation, {
          status: "canceled",
          message: "CSV operation canceled",
        })
        throw canceledCsv()
      }
      this.update(operation, {
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  private update(
    operation: ActiveCsvOperation,
    patch: Partial<EidosLiteCsvOperationProgress>
  ): void {
    operation.progress = {
      ...operation.progress,
      ...patch,
      operationId: operation.progress.operationId,
      kind: operation.progress.kind,
      updatedAt: Date.now(),
    }
  }

  private retainPlan(
    source: EidosLiteCsvFileSource,
    validationKey: string,
    plan: EidosFileCsvImportPlan
  ): void {
    const keys = new Set([
      validationKey,
      resolvedCsvPlanValidationKey(source, plan),
    ])
    for (const key of keys) {
      this.retainedPlans.delete(key)
      this.retainedPlans.set(key, plan)
    }
    while (this.retainedPlans.size > MAX_RETAINED_CSV_PLANS) {
      const oldest = this.retainedPlans.keys().next().value
      if (typeof oldest !== "string") break
      this.retainedPlans.delete(oldest)
    }
  }

  private evictCompleted(): void {
    const cutoff = Date.now() - COMPLETED_OPERATION_TTL_MS
    for (const [operationId, operation] of this.operations) {
      if (
        operation.progress.status !== "running" &&
        operation.progress.status !== "canceling" &&
        operation.progress.updatedAt < cutoff
      ) {
        this.operations.delete(operationId)
      }
    }
  }
}

const factoryContext: RuntimeFactoryContext = {
  cancellation: {
    cancelled: () => false,
    onCancel: () => () => undefined,
  },
}

function environment(): RuntimeEnvironment {
  return {
    clock: {
      nowInstant: () => new Date().toISOString(),
      nowMilliseconds: () => performance.now(),
    },
    entropy: {
      randomBytes: (length) => new Uint8Array(randomBytes(length)),
    },
  }
}

function context(requestId: string): RequestContext {
  return { requestId, deadlineMilliseconds: 30_000 }
}

function assertRuntimePath(filePath: string): void {
  if (!path.isAbsolute(filePath)) {
    throw new Error("Runtime file path must be absolute")
  }
  if (path.extname(filePath).toLowerCase() !== ".eidos") {
    throw new Error("Only .eidos files can be opened by Eidos Lite")
  }
}

export interface EidosLiteFileRuntime {
  source: EidosRuntimeEditorDataSource
  initialSnapshot: Awaited<
    ReturnType<EidosRuntimeEditorDataSource["initialize"]>
  >
  findFileEntry(entryId: string): FileEntry | null
  allocateFileEntry(
    request: Parameters<RuntimeHostBridge["allocateFileEntry"]>[0]
  ): Promise<FileEntry>
  previewCsvFile(
    source: EidosLiteCsvFileSource,
    options: EidosFileCsvImportOptions,
    operationId: string
  ): Promise<EidosFileCsvImportPlan>
  importCsvFile(
    source: EidosLiteCsvFileSource,
    options: EidosFileCsvImportOptions,
    operationId: string
  ): Promise<{
    snapshot: Awaited<ReturnType<EidosRuntimeEditorDataSource["getSnapshot"]>>
    result: EidosFileCsvImportResult
  }>
  getCsvOperationProgress(
    operationId: string
  ): EidosLiteCsvOperationProgress | null
  cancelCsvOperation(operationId: string): boolean
  close(): Promise<void>
}

async function bindRuntime(
  connection: NodeSqliteConnectionPort,
  service: Awaited<ReturnType<typeof Runtime.open>>["service"],
  hostBridge: RuntimeHostBridge,
  filePath: string
): Promise<EidosLiteFileRuntime> {
  const source = new EidosRuntimeEditorDataSource(
    service,
    path.basename(filePath)
  )
  const csv = new EidosLiteCsvOperations(filePath, () => source.getSnapshot())
  let closed = false
  try {
    const initialSnapshot = await source.initialize()
    return {
      source,
      initialSnapshot,
      findFileEntry: (entryId) =>
        findEidosFileEntry(connection.database, entryId),
      allocateFileEntry: (request) =>
        hostBridge.allocateFileEntry(
          request,
          context("eidos-lite-asset-allocate")
        ),
      previewCsvFile: (csvSource, options, operationId) =>
        csv.preview(csvSource, options, operationId),
      importCsvFile: (csvSource, options, operationId) =>
        csv.import(csvSource, options, operationId),
      getCsvOperationProgress: (operationId) => csv.progress(operationId),
      cancelCsvOperation: (operationId) => csv.cancel(operationId),
      async close() {
        if (closed) return
        closed = true
        csv.close()
        try {
          await service.close(context("eidos-lite-runtime-close"))
        } finally {
          connection.close()
        }
      },
    }
  } catch (error) {
    try {
      await service.close(context("eidos-lite-runtime-open-failed"))
    } finally {
      connection.close()
    }
    throw error
  }
}

function findEidosFileEntry(
  database: DatabaseSync,
  entryId: string
): FileEntry | null {
  const fields = database
    .prepare(
      `SELECT t.physical_name AS table_name, f.physical_name AS column_name
         FROM eidos__fields f
         JOIN eidos__tables t ON t.id = f.table_id
        WHERE f.type = 'file' AND f.physical_name IS NOT NULL
        ORDER BY f.table_id COLLATE BINARY, f.id COLLATE BINARY`
    )
    .all() as Array<{ table_name: string; column_name: string }>
  let matched: FileEntry | null = null
  for (const field of fields) {
    const column = quoteIdentifier(field.column_name)
    const table = quoteIdentifier(field.table_name)
    const values = database
      .prepare(
        `SELECT ${column} AS value
           FROM ${table}
          WHERE ${column} IS NOT NULL
            AND (json_valid(${column}) = 0 OR EXISTS (
              SELECT 1 FROM json_each(${column}) item
               WHERE json_extract(item.value, '$.id') = ?
            ))`
      )
      .all(entryId) as Array<{ value: unknown }>
    for (const row of values) {
      if (typeof row.value !== "string") {
        throw new Error("Stored File value is not TEXT")
      }
      const entry = decodeEidosFileValues(row.value).find(
        (candidate) => candidate.id === entryId
      )
      if (!entry) continue
      if (
        matched &&
        encodeEidosFileValues([matched]) !== encodeEidosFileValues([entry])
      ) {
        throw new Error("File entry ID resolves to conflicting metadata")
      }
      matched = entry
    }
  }
  return matched
}

export async function createEidosLiteFileRuntime(
  filePath: string,
  title: string
): Promise<EidosLiteFileRuntime> {
  assertRuntimePath(filePath)
  const connection = new NodeSqliteConnectionPort(
    new DatabaseSync(filePath, {
      allowExtension: false,
      defensive: true,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      timeout: 5_000,
    })
  )
  let opened: EidosLiteFileRuntime | null = null
  try {
    const binding = await Runtime.create(
      connection,
      environment(),
      { title },
      factoryContext
    )
    opened = await bindRuntime(
      connection,
      binding.service,
      binding.hostBridge,
      filePath
    )
    opened.initialSnapshot = await opened.source.createTable({
      name: "Table 1",
    })
    return opened
  } catch (error) {
    if (opened) {
      await opened.close().catch(() => undefined)
    } else if (connection.database.isOpen) {
      connection.close()
    }
    throw error
  }
}

export async function openEidosLiteFileRuntime(
  filePath: string
): Promise<EidosLiteFileRuntime> {
  assertRuntimePath(filePath)
  if (!hasSqliteHeader(filePath)) {
    throw new Error(`Not a SQLite file: ${filePath}`)
  }
  const connection = new NodeSqliteConnectionPort(
    new DatabaseSync(filePath, {
      allowExtension: false,
      defensive: true,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      timeout: 5_000,
    })
  )
  try {
    const binding = await Runtime.open(
      connection,
      environment(),
      "readwrite",
      factoryContext
    )
    return await bindRuntime(
      connection,
      binding.service,
      binding.hostBridge,
      filePath
    )
  } catch (error) {
    if (connection.database.isOpen) connection.close()
    throw error
  }
}
