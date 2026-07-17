import type {
  BaseFieldPlacement,
  BaseRow,
  BaseRowMutationResult,
  BaseRowPage,
  BaseRowQuery,
  BaseSnapshot,
  CreateBaseFieldInput,
  UpdateBaseFieldInput,
} from "@eidos.space/base"

export type BaseWorkerStorage = "opfs-sahpool" | "memory"

export interface BaseWorkerOpenResult {
  snapshot: BaseSnapshot
  migrated: boolean
  recovered: boolean
  storage: BaseWorkerStorage
}

export interface BaseWorkerExportResult {
  bytes: Uint8Array
  integrity: "ok"
}

export type BaseWorkerAction =
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
      query: BaseRowQuery
      totalHint?: number
    }
  | { type: "insert-row"; tableId: string; row: BaseRow }
  | {
      type: "update-row"
      tableId: string
      rowId: string
      changes: BaseRow
    }
  | {
      type: "update-field"
      tableId: string
      columnName: string
      changes: UpdateBaseFieldInput
    }
  | {
      type: "add-field"
      tableId: string
      field: CreateBaseFieldInput
      placement?: BaseFieldPlacement
    }
  | { type: "export" }
  | { type: "close" }

export interface BaseWorkerRequest {
  id: number
  action: BaseWorkerAction
}

export type BaseWorkerResult =
  | BaseWorkerOpenResult
  | BaseWorkerExportResult
  | BaseSnapshot
  | BaseRowPage
  | BaseRowMutationResult
  | { discarded: true }
  | { closed: true }

export type BaseWorkerResponse =
  | { id: number; ok: true; result: BaseWorkerResult }
  | {
      id: number
      ok: false
      error: { name: string; message: string; stack?: string }
    }
