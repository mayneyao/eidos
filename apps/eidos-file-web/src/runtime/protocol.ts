import type {
  EidosFileFieldPlacement,
  EidosFileRow,
  EidosFileRowGroupCount,
  EidosFileRowMutationResult,
  EidosFileRowPage,
  EidosFileRowPageProjection,
  EidosFileRowQuery,
  EidosFileSnapshot,
  CreateEidosFileFieldInput,
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
  | { type: "insert-row"; tableId: string; row: EidosFileRow }
  | {
      type: "update-row"
      tableId: string
      rowId: string
      changes: EidosFileRow
    }
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
  | { type: "update-view"; viewId: string; changes: UpdateEidosFileViewInput }
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
  | EidosFileRow
  | EidosFileRowGroupCount[]
  | EidosFileRowPage
  | EidosFileRowMutationResult
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
