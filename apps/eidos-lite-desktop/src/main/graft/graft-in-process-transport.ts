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
} from "../../shared/graft-merge-contracts"
import type { GraftSdkCommand } from "../../shared/graft-sdk-contracts"
import type {
  SpaceVersionTextContentDiff,
  SpaceVersionTextContentRequest,
} from "../../shared/contracts"
import type { GraftSdkTransport } from "./graft-sdk-transport"
import {
  loadEidosGraftSdk,
  type EidosGraftRepositorySession,
} from "./graft-sdk-module"
import { readRevisionTextDiff } from "./revision-text-reader"

const { operationMaterializesWorktree, RepositorySession, sdkVersion } =
  loadEidosGraftSdk()

export class GraftInProcessTransport implements GraftSdkTransport {
  private session: EidosGraftRepositorySession | null = null
  private opening: Promise<EidosGraftRepositorySession> | null = null
  private lifecycleGeneration = 0
  target: string | null = null

  async open(root: string): Promise<void> {
    const target = path.resolve(root)
    if (this.opening && this.target === target) {
      await this.opening
      return
    }
    if (
      this.session !== null &&
      this.target === target &&
      (this.session.lifecycle === "open" ||
        this.session.lifecycle === "opening")
    ) {
      this.target = target
      return
    }
    const generation = ++this.lifecycleGeneration
    const current = this.session
    this.session = null
    await current?.close()
    const opening = RepositorySession.open(target)
    this.opening = opening
    this.target = target
    const session = await opening
    if (this.opening === opening) this.opening = null
    if (generation !== this.lifecycleGeneration) {
      await session.close()
      return
    }
    this.session = session
  }

  async reopen(): Promise<void> {
    await this.requireSession().reopen()
  }

  async close(): Promise<void> {
    this.lifecycleGeneration += 1
    const session = this.session
    const opening = this.opening
    this.session = null
    this.opening = null
    this.target = null
    await session?.close()
    const opened = await opening?.catch(() => null)
    await opened?.close()
  }

  async command(
    command: GraftSdkCommand,
    args: unknown[] = [],
    options: { signal?: AbortSignal } = {}
  ): Promise<unknown> {
    if (options.signal?.aborted) throw abortError()
    if (command === "sdkVersion") return sdkVersion()
    if (command === "operationMaterializesWorktree") {
      return operationMaterializesWorktree(this.string(args[0], "operation"))
    }
    const session = this.requireSession()
    const signal = options.signal
    switch (command) {
      case "init":
        return session.init({ signal })
      case "status":
        return session.status({ signal })
      case "statusIncremental":
        return session.statusIncremental({ signal })
      case "repositoryMetadata":
        return session.repositoryMetadata({ signal })
      case "listRemotes":
        return session.listRemotes({ signal })
      case "addAll":
        return session.addAll({ signal })
      case "stagePaths":
        return session.stagePaths({
          ...(this.object(args[0]) as unknown as StagePathsOptions),
          signal,
        })
      case "recordPathMove":
        return session.recordPathMove({
          ...(this.object(args[0]) as unknown as RecordPathMoveOptions),
          signal,
        })
      case "commit":
        return session.commit(this.string(args[0], "commit message"), {
          signal,
        })
      case "diff":
        return session.diff({
          ...(this.object(args[0] ?? {}) as DiffOptions),
          signal,
        })
      case "diffPaths":
        return session.diffPaths({
          ...(this.object(args[0]) as unknown as DiffPathsOptions),
          signal,
        })
      case "diffSqlitePaths":
        return session.diffSqlitePaths({
          ...(this.object(args[0]) as unknown as SqliteDiffPathsOptions),
          signal,
        })
      case "history":
        return session.history({
          ...(this.object(args[0] ?? {}) as HistoryOptions),
          signal,
        })
      case "historySummaries":
        return session.historySummaries({
          ...(this.object(args[0] ?? {}) as HistoryOptions),
          signal,
        })
      case "commitDetails":
        return session.commitDetails(this.string(args[0], "revision"), {
          signal,
        })
      case "commitChangedPaths":
        return session.commitChangedPaths({
          ...(this.object(args[0]) as unknown as CommitChangedPathsOptions),
          signal,
        })
      case "isIgnoredPath":
        return session.isIgnoredPath(this.string(args[0], "path"), { signal })
      case "isIgnoredPaths":
        return session.isIgnoredPaths({
          ...(this.object(args[0]) as unknown as IgnoredPathsOptions),
          signal,
        })
      case "inventory":
        return session.inventory({
          ...(this.object(args[0] ?? {}) as InventoryOptions),
          signal,
        })
      case "restore":
        return session.restore({
          ...(this.object(args[0]) as unknown as RestoreOptions),
          signal,
        })
      case "restorePaths":
        return session.restorePaths({
          ...(this.object(args[0]) as unknown as RestorePathsOptions),
          signal,
        })
      case "untrackPaths":
        return session.untrackPaths({
          ...(this.object(args[0]) as unknown as UntrackPathsOptions),
          signal,
        })
      case "configureRemote":
        return session.configureRemote({
          ...(this.object(args[0]) as unknown as RemoteConfigureOptions),
          signal,
        })
      case "push":
        return session.push({
          ...(this.object(args[0] ?? {}) as RemoteOperationOptions),
          signal,
        })
      case "fetch":
        return session.fetch({
          ...(this.object(args[0] ?? {}) as RemoteOperationOptions),
          signal,
        })
      case "pull":
        return session.pull({
          ...(this.object(args[0] ?? {}) as RemoteOperationOptions),
          signal,
        })
      case "getMergePolicy":
        this.requireMergeMethod(session, command)
        return session.getMergePolicy({ signal })
      case "validateMergePolicy":
        this.requireMergeMethod(session, command)
        return session.validateMergePolicy({
          ...(this.object(
            args[0]
          ) as unknown as GraftValidateMergePolicyOptions),
          signal,
        })
      case "setMergePolicy":
        this.requireMergeMethod(session, command)
        return session.setMergePolicy({
          ...(this.object(args[0]) as unknown as GraftSetMergePolicyOptions),
          signal,
        })
      case "planMerge":
        this.requireMergeMethod(session, command)
        return session.planMerge({
          ...(this.object(args[0]) as unknown as GraftPlanMergeOptions),
          signal,
        })
      case "applyMerge":
        this.requireMergeMethod(session, command)
        return session.applyMerge({
          ...(this.object(args[0]) as unknown as GraftApplyMergeOptions),
          signal,
        })
      case "getMergeStatus":
        this.requireMergeMethod(session, command)
        return session.getMergeStatus({ signal })
      case "listMergePaths":
        this.requireMergeMethod(session, command)
        return session.listMergePaths({
          ...(this.object(args[0]) as unknown as GraftListMergePathsOptions),
          signal,
        })
      case "listMergeConflicts":
        this.requireMergeMethod(session, command)
        return session.listMergeConflicts({
          ...(this.object(
            args[0]
          ) as unknown as GraftListMergeConflictsOptions),
          signal,
        })
      case "readMergeVersion":
        this.requireMergeMethod(session, command)
        return session.readMergeVersion({
          ...(this.object(args[0]) as unknown as GraftReadMergeVersionOptions),
          signal,
        })
      case "diffMergeSqlite":
        this.requireMergeMethod(session, command)
        return session.diffMergeSqlite({
          ...(this.object(args[0]) as unknown as GraftDiffMergeSqliteOptions),
          signal,
        })
      case "setMergePathResult":
        this.requireMergeMethod(session, command)
        return session.setMergePathResult({
          ...(this.object(
            args[0]
          ) as unknown as GraftSetMergePathResultOptions),
          signal,
        })
      case "resolveMergeRow":
        this.requireMergeMethod(session, command)
        return session.resolveMergeRow({
          ...(this.object(args[0]) as unknown as GraftResolveMergeRowOptions),
          signal,
        })
      case "resolveMergeCell":
        this.requireMergeMethod(session, command)
        return session.resolveMergeCell({
          ...(this.object(args[0]) as unknown as GraftResolveMergeCellOptions),
          signal,
        })
      case "resolveMergeTable":
        this.requireMergeMethod(session, command)
        return session.resolveMergeTable({
          ...(this.object(args[0]) as unknown as GraftResolveMergeTableOptions),
          signal,
        })
      case "unresolveMergePath":
        this.requireMergeMethod(session, command)
        return session.unresolveMergePath({
          ...(this.object(
            args[0]
          ) as unknown as GraftUnresolveMergePathOptions),
          signal,
        })
      case "stageMergeSqliteResult":
        this.requireMergeMethod(session, command)
        return session.stageMergeSqliteResult({
          ...(this.object(
            args[0]
          ) as unknown as GraftStageMergeSqliteResultOptions),
          signal,
        })
      case "writeAndStageTextResult":
        this.requireMergeMethod(session, command)
        return session.writeAndStageTextResult({
          ...(this.object(
            args[0]
          ) as unknown as GraftWriteAndStageTextResultOptions),
          signal,
        })
      case "continueMerge":
        this.requireMergeMethod(session, command)
        return session.continueMerge({
          ...(this.object(args[0]) as unknown as GraftContinueMergeOptions),
          signal,
        })
      case "abortMerge":
        this.requireMergeMethod(session, command)
        return session.abortMerge({
          ...(this.object(args[0]) as unknown as GraftAbortMergeOptions),
          signal,
        })
      case "cloneRepository":
        return session.cloneRepository({
          ...(this.object(args[0]) as unknown as CloneOptions),
          signal,
        })
      case "setHttpBearerToken":
        session.setHttpBearerToken(
          this.string(args[0], "Remote name"),
          this.string(args[1], "Remote credential")
        )
        return { configured: true }
      case "clearHttpBearerToken":
        session.clearHttpBearerToken(this.string(args[0], "Remote name"))
        return { cleared: true }
      default:
        return this.unsupportedCommand(command)
    }
  }

  async revisionTextDiff(
    request: SpaceVersionTextContentRequest
  ): Promise<SpaceVersionTextContentDiff> {
    return readRevisionTextDiff(this.requireSession(), request)
  }

  async clone(
    targetDirectory: string,
    remoteUrl: string,
    token?: string
  ): Promise<unknown> {
    const transport = new GraftInProcessTransport()
    await transport.open(targetDirectory)
    try {
      return await transport.command("cloneRepository", [
        {
          remoteUrl,
          branch: "main",
          ...(token ? { bearerToken: token } : {}),
        },
      ])
    } finally {
      await transport.close()
    }
  }

  private requireSession(): EidosGraftRepositorySession {
    if (!this.session) throw new Error("Graft repository session is not open")
    return this.session
  }

  private requireMergeMethod(
    session: EidosGraftRepositorySession,
    method: string
  ): void {
    if (
      typeof (session as unknown as Record<string, unknown>)[method] ===
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

  private object(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Graft SDK options must be an object")
    }
    return value as Record<string, unknown>
  }

  private string(value: unknown, label: string): string {
    if (typeof value !== "string" || !value) {
      throw new Error(`${label} is required`)
    }
    return value
  }

  private unsupportedCommand(command: never): never {
    throw new Error(`Unsupported Graft SDK command: ${String(command)}`)
  }
}

function abortError(): Error {
  const error = new Error("The Graft operation was cancelled")
  error.name = "AbortError"
  return error
}
