import path from "node:path"
import type {
  CloneOptions,
  CommitChangedPathsOptions,
  DiffOptions,
  DiffPathsOptions,
  HistoryOptions,
  IgnoredPathsOptions,
  InventoryOptions,
  RemoteConfigureOptions,
  RemoteOperationOptions,
  RecordPathMoveOptions,
  RestoreOptions,
  RestorePathsOptions,
  SqliteDiffPathsOptions,
  StagePathsOptions,
  UntrackPathsOptions,
} from "@eidos.space/graft"

import type {
  GraftAbortMergeOptions,
  GraftApplyMergeOptions,
  GraftContinueMergeOptions,
  GraftDiffMergeSqliteOptions,
  GraftListMergeConflictsOptions,
  GraftListMergePathsOptions,
  GraftPlanMergeOptions,
  GraftReadMergeVersionOptions,
  GraftResolveMergeCellOptions,
  GraftResolveMergeRowOptions,
  GraftResolveMergeTableOptions,
  GraftSetMergePolicyOptions,
  GraftSetMergePathResultOptions,
  GraftStageMergeSqliteResultOptions,
  GraftUnresolveMergePathOptions,
  GraftValidateMergePolicyOptions,
  GraftWriteAndStageTextResultOptions,
} from "../shared/graft-merge-contracts"
import type {
  GraftSdkCommand,
  GraftSdkWorkerRequest,
  GraftSdkWorkerResponse,
} from "../shared/graft-sdk-contracts"
import {
  loadEidosGraftSdk,
  type EidosGraftRepositorySession,
} from "../main/graft/graft-sdk-module"
import { readRevisionTextDiff } from "../main/graft/revision-text-reader"

const { operationMaterializesWorktree, RepositorySession, sdkVersion } =
  loadEidosGraftSdk()

interface UtilityParentPort {
  on(event: "message", listener: (event: { data: unknown }) => void): void
  postMessage(message: GraftSdkWorkerResponse): void
}

const parentPort = (
  process as typeof process & { parentPort?: UtilityParentPort }
).parentPort

if (!parentPort) throw new Error("Graft SDK requires a utility parent")

let session: EidosGraftRepositorySession | null = null
let sessionRoot: string | null = null
const operationControllers = new Map<number, AbortController>()

type WorkerError = Extract<GraftSdkWorkerResponse, { ok: false }>["error"]

function serializeError(error: unknown): WorkerError {
  if (error instanceof Error) {
    const code =
      "code" in error && typeof error.code === "string" ? error.code : undefined
    return {
      name: error.name,
      message: error.message,
      ...(code ? { code } : {}),
      ...(error.stack ? { stack: error.stack } : {}),
    }
  }
  return { name: "Error", message: String(error) }
}

function requireSession(): EidosGraftRepositorySession {
  if (!session) throw new Error("Graft repository session is not open")
  return session
}

function requireMergeMethod(
  repository: EidosGraftRepositorySession,
  method: string
): void {
  if (
    typeof (repository as unknown as Record<string, unknown>)[method] ===
    "function"
  ) {
    return
  }
  throw Object.assign(
    new Error(
      "The installed Graft SDK does not provide the merge operation required by this Eidos Lite build."
    ),
    { code: "EIDOS_LITE_GRAFT_MERGE_UNAVAILABLE" }
  )
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`${label} is required`)
  }
  return value
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function unsupportedCommand(command: never): never {
  throw new Error(`Unsupported Graft SDK command: ${String(command)}`)
}

async function runCommand(
  command: GraftSdkCommand,
  args: unknown[],
  signal: AbortSignal
): Promise<unknown> {
  if (command === "sdkVersion") return sdkVersion()
  if (command === "operationMaterializesWorktree") {
    return operationMaterializesWorktree(
      requireString(args[0], "operation name")
    )
  }

  const repository = requireSession()
  switch (command) {
    case "init":
      return repository.init({ signal })
    case "status":
      return repository.status({ signal })
    case "statusIncremental":
      return repository.statusIncremental({ signal })
    case "repositoryMetadata":
      return repository.repositoryMetadata({ signal })
    case "listRemotes":
      return repository.listRemotes({ signal })
    case "addAll":
      return repository.addAll({ signal })
    case "stagePaths":
      return repository.stagePaths({
        ...(objectValue(
          args[0],
          "stage paths options"
        ) as unknown as StagePathsOptions),
        signal,
      })
    case "recordPathMove":
      return repository.recordPathMove({
        ...(objectValue(
          args[0],
          "record path move options"
        ) as unknown as RecordPathMoveOptions),
        signal,
      })
    case "commit":
      return repository.commit(requireString(args[0], "commit message"), {
        signal,
      })
    case "diff":
      return repository.diff({
        ...(objectValue(args[0] ?? {}, "diff options") as DiffOptions),
        signal,
      })
    case "diffPaths":
      return repository.diffPaths({
        ...(objectValue(
          args[0],
          "diff paths options"
        ) as unknown as DiffPathsOptions),
        signal,
      })
    case "diffSqlitePaths":
      return repository.diffSqlitePaths({
        ...(objectValue(
          args[0],
          "SQLite diff paths options"
        ) as unknown as SqliteDiffPathsOptions),
        signal,
      })
    case "history":
      return repository.history({
        ...(objectValue(args[0] ?? {}, "history options") as HistoryOptions),
        signal,
      })
    case "historySummaries":
      return repository.historySummaries({
        ...(objectValue(
          args[0] ?? {},
          "history summary options"
        ) as HistoryOptions),
        signal,
      })
    case "commitDetails":
      return repository.commitDetails(requireString(args[0], "revision"), {
        signal,
      })
    case "commitChangedPaths":
      return repository.commitChangedPaths({
        ...(objectValue(
          args[0],
          "commit changed paths options"
        ) as unknown as CommitChangedPathsOptions),
        signal,
      })
    case "isIgnoredPath":
      return repository.isIgnoredPath(requireString(args[0], "path"), {
        signal,
      })
    case "isIgnoredPaths":
      return repository.isIgnoredPaths({
        ...(objectValue(
          args[0],
          "ignored paths options"
        ) as unknown as IgnoredPathsOptions),
        signal,
      })
    case "inventory":
      return repository.inventory({
        ...(objectValue(
          args[0] ?? {},
          "inventory options"
        ) as InventoryOptions),
        signal,
      })
    case "restore":
      return repository.restore({
        ...(objectValue(
          args[0],
          "restore options"
        ) as unknown as RestoreOptions),
        signal,
      })
    case "restorePaths":
      return repository.restorePaths({
        ...(objectValue(
          args[0],
          "restore paths options"
        ) as unknown as RestorePathsOptions),
        signal,
      })
    case "untrackPaths":
      return repository.untrackPaths({
        ...(objectValue(
          args[0],
          "untrack paths options"
        ) as unknown as UntrackPathsOptions),
        signal,
      })
    case "configureRemote":
      return repository.configureRemote({
        ...(objectValue(
          args[0],
          "Remote options"
        ) as unknown as RemoteConfigureOptions),
        signal,
      })
    case "push":
      return repository.push({
        ...(objectValue(
          args[0] ?? {},
          "push options"
        ) as RemoteOperationOptions),
        signal,
      })
    case "fetch":
      return repository.fetch({
        ...(objectValue(
          args[0] ?? {},
          "fetch options"
        ) as RemoteOperationOptions),
        signal,
      })
    case "pull":
      return repository.pull({
        ...(objectValue(
          args[0] ?? {},
          "pull options"
        ) as RemoteOperationOptions),
        signal,
      })
    case "getMergePolicy":
      requireMergeMethod(repository, command)
      return repository.getMergePolicy({ signal })
    case "validateMergePolicy":
      requireMergeMethod(repository, command)
      return repository.validateMergePolicy({
        ...(objectValue(
          args[0],
          "validate merge policy options"
        ) as unknown as GraftValidateMergePolicyOptions),
        signal,
      })
    case "setMergePolicy":
      requireMergeMethod(repository, command)
      return repository.setMergePolicy({
        ...(objectValue(
          args[0],
          "set merge policy options"
        ) as unknown as GraftSetMergePolicyOptions),
        signal,
      })
    case "planMerge":
      requireMergeMethod(repository, command)
      return repository.planMerge({
        ...(objectValue(
          args[0],
          "plan merge options"
        ) as unknown as GraftPlanMergeOptions),
        signal,
      })
    case "applyMerge":
      requireMergeMethod(repository, command)
      return repository.applyMerge({
        ...(objectValue(
          args[0],
          "apply merge options"
        ) as unknown as GraftApplyMergeOptions),
        signal,
      })
    case "getMergeStatus":
      requireMergeMethod(repository, command)
      return repository.getMergeStatus({ signal })
    case "listMergePaths":
      requireMergeMethod(repository, command)
      return repository.listMergePaths({
        ...(objectValue(
          args[0],
          "list merge paths options"
        ) as unknown as GraftListMergePathsOptions),
        signal,
      })
    case "listMergeConflicts":
      requireMergeMethod(repository, command)
      return repository.listMergeConflicts({
        ...(objectValue(
          args[0],
          "list merge conflicts options"
        ) as unknown as GraftListMergeConflictsOptions),
        signal,
      })
    case "readMergeVersion":
      requireMergeMethod(repository, command)
      return repository.readMergeVersion({
        ...(objectValue(
          args[0],
          "read merge version options"
        ) as unknown as GraftReadMergeVersionOptions),
        signal,
      })
    case "diffMergeSqlite":
      requireMergeMethod(repository, command)
      return repository.diffMergeSqlite({
        ...(objectValue(
          args[0],
          "diff merge SQLite options"
        ) as unknown as GraftDiffMergeSqliteOptions),
        signal,
      })
    case "setMergePathResult":
      requireMergeMethod(repository, command)
      return repository.setMergePathResult({
        ...(objectValue(
          args[0],
          "set merge path result options"
        ) as unknown as GraftSetMergePathResultOptions),
        signal,
      })
    case "resolveMergeRow":
      requireMergeMethod(repository, command)
      return repository.resolveMergeRow({
        ...(objectValue(
          args[0],
          "resolve merge row options"
        ) as unknown as GraftResolveMergeRowOptions),
        signal,
      })
    case "resolveMergeCell":
      requireMergeMethod(repository, command)
      return repository.resolveMergeCell({
        ...(objectValue(
          args[0],
          "resolve merge cell options"
        ) as unknown as GraftResolveMergeCellOptions),
        signal,
      })
    case "resolveMergeTable":
      requireMergeMethod(repository, command)
      return repository.resolveMergeTable({
        ...(objectValue(
          args[0],
          "resolve merge table options"
        ) as unknown as GraftResolveMergeTableOptions),
        signal,
      })
    case "unresolveMergePath":
      requireMergeMethod(repository, command)
      return repository.unresolveMergePath({
        ...(objectValue(
          args[0],
          "unresolve merge path options"
        ) as unknown as GraftUnresolveMergePathOptions),
        signal,
      })
    case "stageMergeSqliteResult":
      requireMergeMethod(repository, command)
      return repository.stageMergeSqliteResult({
        ...(objectValue(
          args[0],
          "stage merge SQLite result options"
        ) as unknown as GraftStageMergeSqliteResultOptions),
        signal,
      })
    case "writeAndStageTextResult":
      requireMergeMethod(repository, command)
      return repository.writeAndStageTextResult({
        ...(objectValue(
          args[0],
          "write merge text result options"
        ) as unknown as GraftWriteAndStageTextResultOptions),
        signal,
      })
    case "continueMerge":
      requireMergeMethod(repository, command)
      return repository.continueMerge({
        ...(objectValue(
          args[0],
          "continue merge options"
        ) as unknown as GraftContinueMergeOptions),
        signal,
      })
    case "abortMerge":
      requireMergeMethod(repository, command)
      return repository.abortMerge({
        ...(objectValue(
          args[0],
          "abort merge options"
        ) as unknown as GraftAbortMergeOptions),
        signal,
      })
    case "cloneRepository":
      return repository.cloneRepository({
        ...(objectValue(args[0], "clone options") as unknown as CloneOptions),
        signal,
      })
    case "setHttpBearerToken":
      repository.setHttpBearerToken(
        requireString(args[0], "Remote name"),
        requireString(args[1], "Remote credential")
      )
      return { configured: true }
    case "clearHttpBearerToken":
      repository.clearHttpBearerToken(requireString(args[0], "Remote name"))
      return { cleared: true }
    default:
      return unsupportedCommand(command)
  }
}

async function handle(request: GraftSdkWorkerRequest): Promise<unknown> {
  switch (request.type) {
    case "open": {
      if (!path.isAbsolute(request.root)) {
        throw new Error("Graft repository root must be absolute")
      }
      const target = path.resolve(request.root)
      if (session) {
        if (
          sessionRoot === target &&
          (session.lifecycle === "open" || session.lifecycle === "opening")
        ) {
          return { target, lifecycle: session.lifecycle }
        }
        await session.close()
      }
      session = await RepositorySession.open(target)
      sessionRoot = target
      return { target, lifecycle: session.lifecycle }
    }
    case "reopen": {
      const repository = requireSession()
      return {
        target: repository.target,
        lifecycle: await repository.reopen(),
      }
    }
    case "close": {
      const repository = session
      session = null
      sessionRoot = null
      await repository?.close()
      return { closed: true }
    }
    case "revisionTextDiff": {
      const repository = requireSession()
      return readRevisionTextDiff(repository, request)
    }
    case "command":
      return runCommand(
        request.command,
        request.args,
        operationControllers.get(request.requestId)?.signal ??
          new AbortController().signal
      )
    case "cancel":
      operationControllers.get(request.requestId)?.abort()
      return { cancelled: true }
  }
}

parentPort.on("message", (event) => {
  const request = event.data as GraftSdkWorkerRequest
  if (request.type === "cancel") {
    operationControllers.get(request.requestId)?.abort()
    return
  }
  if (request.type === "command") {
    operationControllers.set(request.requestId, new AbortController())
  }
  void handle(request).then(
    (result) => {
      parentPort.postMessage({ requestId: request.requestId, ok: true, result })
      operationControllers.delete(request.requestId)
      if (request.type === "close") setTimeout(() => process.exit(0), 0)
    },
    (error) => {
      operationControllers.delete(request.requestId)
      parentPort.postMessage({
        requestId: request.requestId,
        ok: false,
        error: serializeError(error),
      })
    }
  )
})
