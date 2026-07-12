export interface GraftWorkerInitData {
  repositoryPath: string
  extensionPath: string
}

export interface GraftWorkerInitRequest {
  type: "init"
  data: GraftWorkerInitData
}

export interface GraftWorkerExecuteRequest {
  type: "execute"
  id: number
  pragma: string
  argument?: string
  maxBufferBytes: number
}

export interface GraftWorkerCloseRequest {
  type: "close"
}

export type GraftWorkerRequest =
  | GraftWorkerInitRequest
  | GraftWorkerExecuteRequest
  | GraftWorkerCloseRequest

export interface GraftWorkerResultResponse {
  type: "result"
  id: number
  value: unknown
}

export interface GraftWorkerErrorResponse {
  type: "error"
  id: number
  name: string
  message: string
}

export interface GraftWorkerClosedResponse {
  type: "closed"
}

export type GraftWorkerResponse =
  | GraftWorkerResultResponse
  | GraftWorkerErrorResponse
  | GraftWorkerClosedResponse
