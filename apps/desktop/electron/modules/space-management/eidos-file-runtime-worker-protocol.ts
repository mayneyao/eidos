import type {
  AdapterStructuredCloneCarrier,
  RuntimeCreateInput,
  RuntimeSnapshot,
} from "@eidos.space/eidos-file"

export interface EidosFileRuntimeWorkerData {
  workingPath: string
  workingId: string
  access: "read" | "readwrite"
  create?: RuntimeCreateInput
}

export type EidosFileRuntimeWorkerControl =
  | { id: string; operation: "export"; maxBytes: string }
  | { id: string; operation: "close" }

export type EidosFileRuntimeWorkerRequest =
  | { transport: AdapterStructuredCloneCarrier }
  | { control: EidosFileRuntimeWorkerControl }

export type EidosFileRuntimeWorkerResponse =
  | { type: "ready"; snapshot: RuntimeSnapshot }
  | { type: "transport"; carrier: AdapterStructuredCloneCarrier }
  | {
      type: "control"
      id: string
      ok: true
      result:
        | { operation: "export"; bytes: Uint8Array; integrity: "ok" }
        | { operation: "close"; closed: true }
    }
  | {
      type: "control"
      id: string
      ok: false
      error: EidosFileRuntimeWorkerError
    }
  | { type: "fatal"; error: EidosFileRuntimeWorkerError }

export interface EidosFileRuntimeWorkerError {
  name: string
  message: string
  stack?: string
  code?: string
  retryable?: boolean
  fatal?: boolean
}
