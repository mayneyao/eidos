export type GraftSdkCommand =
  | "sdkVersion"
  | "operationMaterializesWorktree"
  | "init"
  | "status"
  | "addAll"
  | "commit"
  | "diff"
  | "history"
  | "restore"
  | "configureRemote"
  | "push"
  | "fetch"
  | "pull"
  | "cloneRepository"
  | "setHttpBearerToken"
  | "clearHttpBearerToken"

export type GraftSdkWorkerRequest =
  | {
      requestId: number
      type: "open"
      root: string
    }
  | {
      requestId: number
      type: "reopen"
    }
  | {
      requestId: number
      type: "close"
    }
  | {
      requestId: number
      type: "command"
      command: GraftSdkCommand
      args: unknown[]
    }

export type GraftSdkWorkerResponse =
  | {
      requestId: number
      ok: true
      result: unknown
    }
  | {
      requestId: number
      ok: false
      error: {
        name: string
        message: string
        code?: string
        stack?: string
      }
    }
