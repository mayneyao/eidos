import path from "node:path"
import type {
  EidosFileCsvImportOptions,
  EidosFileColumnStatConfig,
  EidosFileRowPageProjection,
  EidosFileRowQuery,
} from "@eidos.space/eidos-file"
import type { EidosRuntimeEditorDataSource } from "@eidos.space/eidos-file-ui/runtime-editor-data-source"

import type {
  RuntimeCalls,
  RuntimeMethod,
  RuntimeWorkerRequest,
  RuntimeWorkerResponse,
} from "../shared/contracts"
import { EIDOS_LITE_CSV_IMPORT_BYTES_MAX } from "../shared/contracts"
import {
  createEidosLiteFileRuntime,
  openEidosLiteFileRuntime,
  type EidosLiteCsvFileSource,
  type EidosLiteFileRuntime,
} from "./eidos-file-runtime"

interface UtilityParentPort {
  on(event: "message", listener: (event: { data: unknown }) => void): void
  postMessage(message: RuntimeWorkerResponse): void
}

const parentPort = (
  process as typeof process & { parentPort?: UtilityParentPort }
).parentPort

if (!parentPort) throw new Error("Eidos File runtime requires a utility parent")

let openedRuntime: EidosLiteFileRuntime | null = null
let source: EidosRuntimeEditorDataSource | null = null

type RuntimeWorkerError = Extract<RuntimeWorkerResponse, { ok: false }>["error"]

function serializeError(error: unknown): RuntimeWorkerError {
  if (error instanceof Error) {
    const code =
      "code" in error && typeof error.code === "string" ? error.code : undefined
    return {
      name: error.name,
      message: error.message,
      ...(code ? { code } : {}),
      ...(error.stack ? { stack: error.stack } : {}),
    }
  }
  return { name: "Error", message: String(error) }
}

function requireSource(): EidosRuntimeEditorDataSource {
  if (!source) throw new Error("Eidos File runtime is not open")
  return source
}

function requireRuntime(): EidosLiteFileRuntime {
  if (!openedRuntime) throw new Error("Eidos File runtime is not open")
  return openedRuntime
}

function csvInput(
  fileNameValue: unknown,
  bytesValue: unknown
): { name: string; bytes: ArrayBuffer } {
  const name = requireString(fileNameValue, "CSV file name")
  if (name.length > 255 || /[\\/\0]/.test(name)) {
    throw new Error("CSV file name is invalid")
  }
  if (!(bytesValue instanceof ArrayBuffer)) {
    throw new Error("CSV content must be an ArrayBuffer")
  }
  if (bytesValue.byteLength > EIDOS_LITE_CSV_IMPORT_BYTES_MAX) {
    throw new Error("CSV files are limited to 16 MiB")
  }
  return {
    name,
    bytes: bytesValue,
  }
}

function csvOptions(value: unknown): EidosFileCsvImportOptions {
  if (value === undefined) return {}
  return objectValue(value, "CSV options") as EidosFileCsvImportOptions
}

function csvFileSource(value: unknown): EidosLiteCsvFileSource {
  const source = objectValue(value, "CSV source")
  const sourcePath = requireString(source.sourcePath, "CSV source path")
  if (!path.isAbsolute(sourcePath)) {
    throw new Error("CSV source path must be absolute")
  }
  const fileName = requireString(source.fileName, "CSV file name")
  if (fileName.length > 255 || /[\\/\0]/.test(fileName)) {
    throw new Error("CSV file name is invalid")
  }
  const size = requireInteger(source.size, "CSV file size")
  const modifiedAtMs = source.modifiedAtMs
  if (typeof modifiedAtMs !== "number" || !Number.isFinite(modifiedAtMs)) {
    throw new Error("CSV modified time is invalid")
  }
  return { sourcePath, fileName, size, modifiedAtMs }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value)
    throw new Error(`${label} is required`)
  return value
}

function requireInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
  return value
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function methodArgs<M extends RuntimeMethod>(
  args: unknown[]
): RuntimeCalls[M]["args"] {
  return args as RuntimeCalls[M]["args"]
}

async function runtimeCall(
  method: Extract<RuntimeWorkerRequest, { type: "call" }>["method"],
  args: unknown[]
): Promise<unknown> {
  const dataSource = requireSource()
  switch (method) {
    case "getSnapshot":
      return dataSource.getSnapshot()
    case "findFileEntry":
      return requireRuntime().findFileEntry(
        requireString(args[0], "File entry ID")
      )
    case "getPage": {
      const tableId = requireString(args[0], "tableId")
      const offset = requireInteger(args[1], "offset")
      const limit = requireInteger(args[2], "limit")
      if (limit < 1 || limit > 1_000) throw new Error("limit must be 1-1000")
      const query = objectValue(args[3], "query") as EidosFileRowQuery
      const totalHint =
        args[4] === undefined ? undefined : requireInteger(args[4], "totalHint")
      const cursor =
        args[5] === undefined ? undefined : requireString(args[5], "cursor")
      const projection =
        args[6] === undefined
          ? undefined
          : (objectValue(
              args[6],
              "projection"
            ) as unknown as EidosFileRowPageProjection)
      return dataSource.getPage(
        tableId,
        offset,
        limit,
        query,
        totalHint,
        cursor,
        projection
      )
    }
    case "getRow":
      return dataSource.getRow(
        requireString(args[0], "tableId"),
        requireString(args[1], "rowId")
      )
    case "getGroupCounts":
      return dataSource.getGroupCounts(
        requireString(args[0], "tableId"),
        requireString(args[1], "fieldId"),
        objectValue(args[2], "query") as EidosFileRowQuery
      )
    case "calculateColumnStats": {
      const configs = args[1]
      if (!Array.isArray(configs)) throw new Error("configs must be an array")
      return dataSource.calculateColumnStats(
        requireString(args[0], "tableId"),
        configs as EidosFileColumnStatConfig[],
        objectValue(args[2], "query") as EidosFileRowQuery
      )
    }
    case "previewFormula":
      return dataSource.previewFormula(...methodArgs<"previewFormula">(args))
    case "previewCsv": {
      const input = csvInput(args[0], args[1])
      return dataSource.previewCsv(input.name, input.bytes, csvOptions(args[2]))
    }
    case "previewCsvFile":
      return requireRuntime().previewCsvFile(
        csvFileSource(args[0]),
        csvOptions(args[1]),
        requireString(args[2], "CSV operation ID")
      )
    case "getCsvOperationProgress":
      return requireRuntime().getCsvOperationProgress(
        requireString(args[0], "CSV operation ID")
      )
    case "cancelCsvOperation":
      return requireRuntime().cancelCsvOperation(
        requireString(args[0], "CSV operation ID")
      )
    case "insertRow":
      return dataSource.insertRow(...methodArgs<"insertRow">(args))
    case "updateRow":
      return dataSource.updateRow(...methodArgs<"updateRow">(args))
    case "deleteRowRanges":
      return dataSource.deleteRowRanges(...methodArgs<"deleteRowRanges">(args))
    case "deleteRows":
      return dataSource.deleteRows(...methodArgs<"deleteRows">(args))
    case "updateField":
      return dataSource.updateField(...methodArgs<"updateField">(args))
    case "addField":
      return dataSource.addField(...methodArgs<"addField">(args))
    case "deleteField":
      return dataSource.deleteField(...methodArgs<"deleteField">(args))
    case "createTable":
      return dataSource.createTable(...methodArgs<"createTable">(args))
    case "updateTable":
      return dataSource.updateTable(...methodArgs<"updateTable">(args))
    case "deleteTable":
      return dataSource.deleteTable(...methodArgs<"deleteTable">(args))
    case "createView":
      return dataSource.createView(...methodArgs<"createView">(args))
    case "duplicateView":
      return dataSource.duplicateView(...methodArgs<"duplicateView">(args))
    case "deleteView":
      return dataSource.deleteView(...methodArgs<"deleteView">(args))
    case "reorderViews":
      return dataSource.reorderViews(...methodArgs<"reorderViews">(args))
    case "updateView":
      return dataSource.updateView(...methodArgs<"updateView">(args))
    case "importCsv": {
      const input = csvInput(args[0], args[1])
      return dataSource.importCsv(input.name, input.bytes, csvOptions(args[2]))
    }
    case "importCsvFile":
      return requireRuntime().importCsvFile(
        csvFileSource(args[0]),
        csvOptions(args[1]),
        requireString(args[2], "CSV operation ID")
      )
  }
}

async function handle(request: RuntimeWorkerRequest): Promise<unknown> {
  switch (request.type) {
    case "create": {
      if (!path.isAbsolute(request.filePath)) {
        throw new Error("Runtime file path must be absolute")
      }
      if (openedRuntime)
        throw new Error("Runtime already has an open Eidos File")
      openedRuntime = await createEidosLiteFileRuntime(
        request.filePath,
        request.title
      )
      source = openedRuntime.source
      return openedRuntime.initialSnapshot
    }
    case "open": {
      if (!path.isAbsolute(request.filePath)) {
        throw new Error("Runtime file path must be absolute")
      }
      if (openedRuntime)
        throw new Error("Runtime already has an open Eidos File")
      openedRuntime = await openEidosLiteFileRuntime(request.filePath)
      source = openedRuntime.source
      return openedRuntime.initialSnapshot
    }
    case "call":
      return runtimeCall(request.method, request.args)
    case "close":
      await openedRuntime?.close()
      openedRuntime = null
      source = null
      return { closed: true }
  }
}

parentPort.on("message", (event) => {
  const request = event.data as RuntimeWorkerRequest
  void handle(request).then(
    (result) => {
      parentPort.postMessage({ requestId: request.requestId, ok: true, result })
      if (request.type === "close") setTimeout(() => process.exit(0), 0)
    },
    (error) => {
      parentPort.postMessage({
        requestId: request.requestId,
        ok: false,
        error: serializeError(error),
      })
    }
  )
})
