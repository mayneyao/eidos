import type {
  EidosFileColumnStatConfig,
  EidosFileColumnStatResult,
  EidosFileCsvImportOptions,
  EidosFileCsvImportPlan,
  EidosFileCsvImportResult,
  EidosFileFieldPlacement,
  EidosFileRow,
  EidosFileRowGroupCount,
  EidosFileRowMutationResult,
  EidosFileRowPage,
  EidosFileRowPageProjection,
  EidosFileRowRange,
  EidosFileRowQuery,
  EidosFileRowsDeleteResult,
  EidosFileSnapshot,
  CreateEidosFileFieldInput,
  CreateEidosFileTableInput,
  CreateEidosFileViewInput,
  UpdateEidosFileFieldInput,
  UpdateEidosFileViewInput,
} from "@eidos.space/eidos-file"

export type EidosFileWorkerStorage = "opfs-sahpool" | "memory"

export interface EidosFileWorkerOpenResult {
  snapshot: EidosFileSnapshot
  migrated: boolean
  recovered: boolean
  storage: EidosFileWorkerStorage
}

export interface EidosFileWorkerExportResult {
  bytes: Uint8Array
  integrity: "ok"
}

export interface EidosFileWorkerCsvImportResult {
  snapshot: EidosFileSnapshot
  result: EidosFileCsvImportResult
}

export type EidosFileWorkerAction =
  | {
      type: "open-source"
      fileName: string
      recoveryId: string
      bytes: ArrayBuffer
    }
  | { type: "open-recovery"; fileName: string; recoveryId: string }
  | { type: "discard-recovery"; recoveryId: string }
  | { type: "snapshot" }
  | {
      type: "page"
      tableId: string
      offset: number
      limit: number
      query: EidosFileRowQuery
      totalHint?: number
      cursor?: string
      projection?: EidosFileRowPageProjection
    }
  | { type: "row"; tableId: string; rowId: string }
  | {
      type: "group-counts"
      tableId: string
      columnName: string
      query: EidosFileRowQuery
    }
  | {
      type: "column-stats"
      tableId: string
      configs: EidosFileColumnStatConfig[]
      query: EidosFileRowQuery
    }
  | { type: "insert-row"; tableId: string; row: EidosFileRow }
  | {
      type: "update-row"
      tableId: string
      rowId: string
      changes: EidosFileRow
    }
  | {
      type: "delete-row-ranges"
      tableId: string
      ranges: EidosFileRowRange[]
      query: EidosFileRowQuery
    }
  | { type: "delete-rows"; tableId: string; rowIds: string[] }
  | {
      type: "update-field"
      tableId: string
      columnName: string
      changes: UpdateEidosFileFieldInput
    }
  | {
      type: "add-field"
      tableId: string
      field: CreateEidosFileFieldInput
      placement?: EidosFileFieldPlacement
    }
  | { type: "delete-field"; tableId: string; columnName: string }
  | { type: "create-table"; input: CreateEidosFileTableInput }
  | {
      type: "create-view"
      tableId: string
      input: CreateEidosFileViewInput
    }
  | { type: "duplicate-view"; viewId: string; name?: string }
  | { type: "delete-view"; viewId: string }
  | { type: "reorder-views"; tableId: string; viewIds: string[] }
  | { type: "update-view"; viewId: string; changes: UpdateEidosFileViewInput }
  | {
      type: "csv-preview"
      fileName: string
      bytes: ArrayBuffer
      options: EidosFileCsvImportOptions
    }
  | {
      type: "csv-import"
      fileName: string
      bytes: ArrayBuffer
      options: EidosFileCsvImportOptions
    }
  | { type: "export" }
  | { type: "close" }

export interface EidosFileWorkerRequest {
  id: number
  action: EidosFileWorkerAction
}

export type EidosFileWorkerResult =
  | EidosFileWorkerOpenResult
  | EidosFileWorkerExportResult
  | EidosFileSnapshot
  | EidosFileColumnStatResult[]
  | EidosFileCsvImportPlan
  | EidosFileWorkerCsvImportResult
  | EidosFileRow
  | EidosFileRowGroupCount[]
  | EidosFileRowPage
  | EidosFileRowMutationResult
  | EidosFileRowsDeleteResult
  | null
  | { discarded: true }
  | { closed: true }

export type EidosFileWorkerResponse =
  | { id: number; ok: true; result: EidosFileWorkerResult }
  | {
      id: number
      ok: false
      error: { name: string; message: string; stack?: string }
    }
