import type {
  BaseCsvImportOptions,
  BaseCsvImportPlan,
  BaseCsvImportResult,
} from "@eidos.space/base"

export interface BaseCsvFileFingerprint {
  size: number
  mtimeMs: number
}

interface BaseCsvWorkerRequestBase {
  sourcePath: string
  fileName: string
  fingerprint: BaseCsvFileFingerprint
  options: BaseCsvImportOptions
}

export interface BaseCsvPlanWorkerRequest extends BaseCsvWorkerRequestBase {
  operation: "plan"
}

export interface BaseCsvImportWorkerRequest extends BaseCsvWorkerRequestBase {
  operation: "import"
  targetPath: string
}

export type BaseCsvWorkerRequest =
  | BaseCsvPlanWorkerRequest
  | BaseCsvImportWorkerRequest

export type BaseCsvWorkerSuccess =
  | { ok: true; operation: "plan"; plan: BaseCsvImportPlan }
  | { ok: true; operation: "import"; result: BaseCsvImportResult }

export interface BaseCsvWorkerFailure {
  ok: false
  name: string
  message: string
}

export type BaseCsvWorkerResponse = BaseCsvWorkerSuccess | BaseCsvWorkerFailure
