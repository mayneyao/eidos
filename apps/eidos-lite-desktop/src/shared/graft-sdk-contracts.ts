import type { SpaceVersionTextContentRequest } from "./contracts"

export interface GraftTransferProgress {
  direction: "upload" | "download"
  transferredBytes: number
  totalBytes?: number
}

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
  | "recordPathMove"
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
  | "getMergePolicy"
  | "validateMergePolicy"
  | "setMergePolicy"
  | "planMerge"
  | "applyMerge"
  | "getMergeStatus"
  | "listMergePaths"
  | "listMergeConflicts"
  | "readMergeVersion"
  | "diffMergeSqlite"
  | "setMergePathResult"
  | "resolveMergeRow"
  | "resolveMergeCell"
  | "resolveMergeTable"
  | "unresolveMergePath"
  | "stageMergeSqliteResult"
  | "prepareSemanticMerge"
  | "recordSemanticMergeConflicts"
  | "acceptSemanticMergeResult"
  | "writeAndStageTextResult"
  | "continueMerge"
  | "abortMerge"
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
      type: "progress"
      progress: GraftTransferProgress
    }
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
