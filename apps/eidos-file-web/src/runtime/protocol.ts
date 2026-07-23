import type {
  AdapterStructuredCloneCarrier,
  RuntimeSnapshot,
} from "@eidos.space/eidos-file"

export interface EidosFileWorkerTransportMessage {
  transport: AdapterStructuredCloneCarrier
}

export type EidosFileWorkerStorage = "opfs-sahpool" | "memory"

export interface EidosFileWorkerOpenResult {
  snapshot: RuntimeSnapshot
  migrated: boolean
  recovered: boolean
  storage: EidosFileWorkerStorage
}

export interface EidosFileWorkerExportResult {
  bytes: Uint8Array
  integrity: "ok"
}

/** Host-only Worker control messages. Logical operations use Adapter Transport. */
export type EidosFileWorkerAction =
  | {
      type: "create-source"
      fileName: string
      recoveryId: string
      title: string
    }
  | {
      type: "open-source"
      fileName: string
      recoveryId: string
      bytes: ArrayBuffer
      access?: "read" | "readwrite"
    }
  | {
      type: "open-recovery"
      fileName: string
      recoveryId: string
      access?: "read" | "readwrite"
    }
  | { type: "discard-recovery"; recoveryId: string }
  | { type: "export"; maxBytes: string }
  | { type: "close" }

export interface EidosFileWorkerRequest {
  id: number
  action: EidosFileWorkerAction
}

export type EidosFileWorkerResult =
  | EidosFileWorkerOpenResult
  | EidosFileWorkerExportResult
  | { discarded: true }
  | { closed: true }

export type EidosFileWorkerResponse =
  | { id: number; ok: true; result: EidosFileWorkerResult }
  | {
      id: number
      ok: false
      error: {
        name: string
        message: string
        stack?: string
        code?: string
        retryable?: boolean
        fatal?: boolean
      }
    }
