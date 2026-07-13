import type {
  BaseRowGroupCount,
  BaseRowPage,
  BaseRowPageOptions,
  BaseRowQuery,
} from "@eidos.space/base"

interface BaseQueryWorkerRequestBase {
  id: string
  filePath: string
  tableId: string
}

export interface BasePageWorkerRequest extends BaseQueryWorkerRequestBase {
  operation: "page"
  options: BaseRowPageOptions
}

export interface BaseGroupCountsWorkerRequest extends BaseQueryWorkerRequestBase {
  operation: "group-counts"
  columnName: string
  query: BaseRowQuery
}

export type BaseQueryWorkerRequest =
  | BasePageWorkerRequest
  | BaseGroupCountsWorkerRequest

export type BaseQueryWorkerSuccess =
  | {
      id: string
      ok: true
      operation: "page"
      page: BaseRowPage
    }
  | {
      id: string
      ok: true
      operation: "group-counts"
      counts: BaseRowGroupCount[]
    }

export interface BaseQueryWorkerFailure {
  id: string
  ok: false
  name: string
  message: string
}

export type BaseQueryWorkerResponse =
  | BaseQueryWorkerSuccess
  | BaseQueryWorkerFailure
