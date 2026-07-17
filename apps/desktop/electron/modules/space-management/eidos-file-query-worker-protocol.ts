import type {
  EidosFileColumnStatConfig,
  EidosFileColumnStatResult,
  EidosFileRow,
  EidosFileRowGroupCount,
  EidosFileRowPage,
  EidosFileRowPageOptions,
  EidosFileRowQuery,
} from "@eidos.space/eidos-file"

interface EidosFileQueryWorkerRequestEidosFile {
  id: string
  filePath: string
  tableId: string
}

export interface EidosFilePageWorkerRequest extends EidosFileQueryWorkerRequestEidosFile {
  operation: "page"
  options: EidosFileRowPageOptions
}

export interface EidosFileRowWorkerRequest extends EidosFileQueryWorkerRequestEidosFile {
  operation: "row"
  rowId: string
}

export interface EidosFileGroupCountsWorkerRequest extends EidosFileQueryWorkerRequestEidosFile {
  operation: "group-counts"
  columnName: string
  query: EidosFileRowQuery
}

export interface EidosFileColumnStatsWorkerRequest extends EidosFileQueryWorkerRequestEidosFile {
  operation: "column-stats"
  configs: EidosFileColumnStatConfig[]
  query: EidosFileRowQuery
}

export type EidosFileQueryWorkerRequest =
  | EidosFilePageWorkerRequest
  | EidosFileRowWorkerRequest
  | EidosFileGroupCountsWorkerRequest
  | EidosFileColumnStatsWorkerRequest

export type EidosFileQueryWorkerSuccess =
  | {
      id: string
      ok: true
      operation: "page"
      page: EidosFileRowPage
    }
  | {
      id: string
      ok: true
      operation: "row"
      row: EidosFileRow | null
    }
  | {
      id: string
      ok: true
      operation: "group-counts"
      counts: EidosFileRowGroupCount[]
    }
  | {
      id: string
      ok: true
      operation: "column-stats"
      stats: EidosFileColumnStatResult[]
    }

export interface EidosFileQueryWorkerFailure {
  id: string
  ok: false
  name: string
  message: string
}

export type EidosFileQueryWorkerResponse =
  | EidosFileQueryWorkerSuccess
  | EidosFileQueryWorkerFailure
