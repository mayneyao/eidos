import type { SpaceVersionTextContentRequest } from "./contracts"

export type GraftSdkCommand =
  | "sdkVersion"
  | "operationMaterializesWorktree"
  | "init"
  | "status"
  | "statusIncremental"
  | "repositoryMetadata"
  | "listRemotes"
  | "addAll"
  | "stagePaths"
  | "commit"
  | "diff"
  | "diffPaths"
  | "diffSqlitePaths"
  | "history"
  | "historySummaries"
  | "commitDetails"
  | "commitChangedPaths"
  | "isIgnoredPath"
  | "isIgnoredPaths"
  | "inventory"
  | "restore"
  | "restorePaths"
  | "untrackPaths"
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
  | ({
      requestId: number
      type: "revisionTextDiff"
    } & SpaceVersionTextContentRequest)
  | {
      requestId: number
      type: "command"
      command: GraftSdkCommand
      args: unknown[]
    }
  | {
      requestId: number
      type: "cancel"
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
