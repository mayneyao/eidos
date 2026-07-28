import path from "node:path"
import {
  operationMaterializesWorktree,
  RepositorySession,
  sdkVersion,
  type CloneOptions,
  type DiffOptions,
  type HistoryOptions,
  type RemoteConfigureOptions,
  type RemoteOperationOptions,
  type RestoreOptions,
} from "@eidos.space/graft"

import type { GraftSdkCommand } from "../../shared/graft-sdk-contracts"
import type { GraftSdkTransport } from "./graft-sdk-transport"

export class GraftInProcessTransport implements GraftSdkTransport {
  private session: RepositorySession | null = null
  target: string | null = null

  async open(root: string): Promise<void> {
    const target = path.resolve(root)
    if (
      this.session !== null &&
      this.target === target &&
      (this.session.lifecycle === "open" ||
        this.session.lifecycle === "opening")
    ) {
      this.target = target
      return
    }
    await this.session?.close()
    this.session = await RepositorySession.open(target)
    this.target = target
  }

  async reopen(): Promise<void> {
    await this.requireSession().reopen()
  }

  async close(): Promise<void> {
    const session = this.session
    this.session = null
    this.target = null
    await session?.close()
  }

  async command(
    command: GraftSdkCommand,
    args: unknown[] = []
  ): Promise<unknown> {
    if (command === "sdkVersion") return sdkVersion()
    if (command === "operationMaterializesWorktree") {
      return operationMaterializesWorktree(this.string(args[0], "operation"))
    }
    const session = this.requireSession()
    switch (command) {
      case "init":
        return session.init()
      case "status":
        return session.status()
      case "addAll":
        return session.addAll()
      case "commit":
        return session.commit(this.string(args[0], "commit message"))
      case "diff":
        return session.diff(this.object(args[0] ?? {}) as DiffOptions)
      case "history":
        return session.history(this.object(args[0] ?? {}) as HistoryOptions)
      case "restore":
        return session.restore(
          this.object(args[0]) as unknown as RestoreOptions
        )
      case "configureRemote":
        return session.configureRemote(
          this.object(args[0]) as unknown as RemoteConfigureOptions
        )
      case "push":
        return session.push(
          this.object(args[0] ?? {}) as RemoteOperationOptions
        )
      case "fetch":
        return session.fetch(
          this.object(args[0] ?? {}) as RemoteOperationOptions
        )
      case "pull":
        return session.pull(
          this.object(args[0] ?? {}) as RemoteOperationOptions
        )
      case "cloneRepository":
        return session.cloneRepository(
          this.object(args[0]) as unknown as CloneOptions
        )
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
