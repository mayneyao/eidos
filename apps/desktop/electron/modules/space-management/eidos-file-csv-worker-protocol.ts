import type {
  EidosFileCsvExportOptions,
  EidosFileCsvExportResult,
  EidosFileCsvImportOptions,
  EidosFileCsvImportPlan,
  EidosFileCsvImportResult,
} from "@eidos.space/eidos-file"

export interface EidosFileCsvFileFingerprint {
  size: number
  mtimeMs: number
}

interface EidosFileCsvImportWorkerRequestEidosFile {
  sourcePath: string
  fileName: string
  fingerprint: EidosFileCsvFileFingerprint
  options: EidosFileCsvImportOptions
}

export interface EidosFileCsvPlanWorkerRequest extends EidosFileCsvImportWorkerRequestEidosFile {
  operation: "plan"
}

export interface EidosFileCsvImportWorkerRequest extends EidosFileCsvImportWorkerRequestEidosFile {
  operation: "import"
  targetPath: string
}

export interface EidosFileCsvExportWorkerRequest {
  operation: "export"
  sourcePath: string
  targetPath: string
  tableId: string
  options: EidosFileCsvExportOptions
}

export type EidosFileCsvWorkerRequest =
  | EidosFileCsvPlanWorkerRequest
  | EidosFileCsvImportWorkerRequest
  | EidosFileCsvExportWorkerRequest

export type EidosFileCsvWorkerSuccess =
  | { ok: true; operation: "plan"; plan: EidosFileCsvImportPlan }
  | { ok: true; operation: "import"; result: EidosFileCsvImportResult }
  | { ok: true; operation: "export"; result: EidosFileCsvExportResult }

export interface EidosFileCsvWorkerFailure {
  ok: false
  name: string
  message: string
}

export type EidosFileCsvWorkerResponse =
  | EidosFileCsvWorkerSuccess
  | EidosFileCsvWorkerFailure

export type EidosFileCsvWorkerPhase =
  | "analyzing"
  | "importing"
  | "exporting"
  | "finalizing"

export interface EidosFileCsvWorkerProgress {
  type: "progress"
  progress: {
    phase: EidosFileCsvWorkerPhase
    processedBytes: number
    totalBytes: number
    processedRows: number
    totalRows: number | null
  }
}

export type EidosFileCsvWorkerMessage =
  | EidosFileCsvWorkerResponse
  | EidosFileCsvWorkerProgress
