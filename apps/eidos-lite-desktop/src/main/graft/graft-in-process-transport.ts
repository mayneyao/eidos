import path from "node:path"
import {
  operationMaterializesWorktree,
  RepositorySession,
  sdkVersion,
  type CloneOptions,
  type CommitChangedPathsOptions,
  type DiffOptions,
  type DiffPathsOptions,
  type HistoryOptions,
  type IgnoredPathsOptions,
  type InventoryOptions,
  type RemoteConfigureOptions,
  type RemoteOperationOptions,
  type RestoreOptions,
  type RestorePathsOptions,
  type StagePathsOptions,
  type UntrackPathsOptions,
} from "@eidos.space/graft"

import type { GraftSdkCommand } from "../../shared/graft-sdk-contracts"
import type { GraftSdkTransport } from "./graft-sdk-transport"

export class GraftInProcessTransport implements GraftSdkTransport {
  private session: RepositorySession | null = null
  private opening: Promise<RepositorySession> | null = null
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
    }
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

  private requireSession(): RepositorySession {
    if (!this.session) throw new Error("Graft repository session is not open")
    return this.session
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
}

function abortError(): Error {
  const error = new Error("The Graft operation was cancelled")
  error.name = "AbortError"
  return error
}
