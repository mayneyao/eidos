import type {
  BaseCsvExportOptions,
  BaseCsvExportResult,
  BaseCsvImportOptions,
  BaseCsvImportPlan,
  BaseCsvImportResult,
} from "@eidos.space/base"

export interface BaseCsvFileFingerprint {
  size: number
  mtimeMs: number
}

interface BaseCsvImportWorkerRequestBase {
  sourcePath: string
  fileName: string
  fingerprint: BaseCsvFileFingerprint
  options: BaseCsvImportOptions
}

export interface BaseCsvPlanWorkerRequest extends BaseCsvImportWorkerRequestBase {
  operation: "plan"
}

export interface BaseCsvImportWorkerRequest extends BaseCsvImportWorkerRequestBase {
  operation: "import"
  targetPath: string
}

export interface BaseCsvExportWorkerRequest {
  operation: "export"
  sourcePath: string
  targetPath: string
  tableId: string
  options: BaseCsvExportOptions
}

export type BaseCsvWorkerRequest =
  | BaseCsvPlanWorkerRequest
  | BaseCsvImportWorkerRequest
  | BaseCsvExportWorkerRequest

export type BaseCsvWorkerSuccess =
  | { ok: true; operation: "plan"; plan: BaseCsvImportPlan }
  | { ok: true; operation: "import"; result: BaseCsvImportResult }
  | { ok: true; operation: "export"; result: BaseCsvExportResult }

export interface BaseCsvWorkerFailure {
  ok: false
  name: string
  message: string
}

export type BaseCsvWorkerResponse = BaseCsvWorkerSuccess | BaseCsvWorkerFailure

export type BaseCsvWorkerPhase =
  | "analyzing"
  | "importing"
  | "exporting"
  | "finalizing"

export interface BaseCsvWorkerProgress {
  type: "progress"
  progress: {
    phase: BaseCsvWorkerPhase
    processedBytes: number
    totalBytes: number
    processedRows: number
    totalRows: number | null
  }
}

export type BaseCsvWorkerMessage = BaseCsvWorkerResponse | BaseCsvWorkerProgress
