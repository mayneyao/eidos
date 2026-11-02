import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"

import { isOfficialRemoteUrl } from "../graft/graft-client"
import { customSyncOrigin } from "../../shared/sync-encryption"
import { EIDOS_LITE_SERVICE_ENVIRONMENTS } from "../../shared/service-environment"

/** Known official services are safe to detach locally, even from another build environment. */
export function isKnownOfficialSyncRemote(value: string): boolean {
  return Object.values(EIDOS_LITE_SERVICE_ENVIRONMENTS).some((environment) =>
    isOfficialRemoteUrl(value, environment.syncRemoteOrigin)
  )
}

export interface SpaceSyncState {
  version: 3 | 4
  provider?: "custom"
  serverOrigin?: string
  encryptionUuid?: string
  bindingRevision?: string
  remoteUrl: string
  connectedAt: string
  establishedBy: "first-push" | "clone"
  lastCheckedAt: string
}

export class SpaceSyncStateStore {
  private readonly filePath: string

  constructor(
    stateDirectory: string,
    private readonly remoteOrigin: string
  ) {
    this.filePath = path.join(stateDirectory, "sync-state.json")
  }

  read(): Promise<SpaceSyncState | null> {
    return this.readState(false)
  }

  /** Local teardown only; this must never authorize a network Sync operation. */
  readForDisconnect(): Promise<SpaceSyncState | null> {
    return this.readState(true)
  }

  private async readState(
    forDisconnect: boolean
  ): Promise<SpaceSyncState | null> {
    let raw: string
    try {
      raw = await fs.readFile(this.filePath, "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
      throw new Error("Eidos Lite could not read the Space Sync state.")
    }
    try {
      const value = JSON.parse(raw) as Record<string, unknown>
      const remoteUrl =
        typeof value.remoteUrl === "string" ? value.remoteUrl : null
      const custom =
        remoteUrl &&
        value.version === 4 &&
        value.provider === "custom" &&
        customSyncOrigin(remoteUrl) === value.serverOrigin &&
        typeof value.encryptionUuid === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
          value.encryptionUuid
        ) &&
        typeof value.bindingRevision === "string" &&
        /^[0-9a-f-]{36}$/.test(value.bindingRevision)
      if (
        !remoteUrl ||
        (!isOfficialRemoteUrl(remoteUrl, this.remoteOrigin) &&
          !custom &&
          !(
            forDisconnect &&
            [1, 2, 3].some((version) => value.version === version) &&
            isKnownOfficialSyncRemote(remoteUrl)
          ))
      ) {
        throw new Error("invalid sync state")
      }
      if (
        value.version === 1 &&
        typeof value.firstPushedAt === "string" &&
        Number.isFinite(Date.parse(value.firstPushedAt))
      ) {
        return {
          version: 3,
          remoteUrl,
          connectedAt: value.firstPushedAt,
          establishedBy: "first-push",
          lastCheckedAt: value.firstPushedAt,
        }
      }
      if (
        value.version === 2 &&
        typeof value.connectedAt === "string" &&
        Number.isFinite(Date.parse(value.connectedAt)) &&
        ["first-push", "clone"].includes(String(value.establishedBy))
      ) {
        return {
          version: 3,
          remoteUrl,
          connectedAt: value.connectedAt,
          establishedBy: value.establishedBy as SpaceSyncState["establishedBy"],
          lastCheckedAt: value.connectedAt,
        }
      }
      if (
        (value.version !== 3 && value.version !== 4) ||
        typeof value.connectedAt !== "string" ||
        !Number.isFinite(Date.parse(value.connectedAt)) ||
        !["first-push", "clone"].includes(String(value.establishedBy)) ||
        typeof value.lastCheckedAt !== "string" ||
        !Number.isFinite(Date.parse(value.lastCheckedAt))
      ) {
        throw new Error("invalid sync state")
      }
      return value as unknown as SpaceSyncState
    } catch {
      throw new Error(
        "The Space Sync state is invalid. Eidos Lite will not claim this Space is synced."
      )
    }
  }

  async clear(): Promise<void> {
    await fs.rm(this.filePath, { force: true })
  }

  async markFirstPush(
    remoteUrl: string,
    now = new Date(),
    encryptionUuid?: string
  ): Promise<SpaceSyncState> {
    return this.markConnected(remoteUrl, "first-push", now, encryptionUuid)
  }

  async markClone(
    remoteUrl: string,
    now = new Date(),
    encryptionUuid?: string
  ): Promise<SpaceSyncState> {
    return this.markConnected(remoteUrl, "clone", now, encryptionUuid)
  }

  async markChecked(now = new Date()): Promise<SpaceSyncState> {
    const current = await this.read()
    if (!current) {
      throw new Error(
        "Cannot update Sync history before this Space is connected"
      )
    }
    return this.write({
      ...current,
      lastCheckedAt: now.toISOString(),
    })
  }

  private async markConnected(
    remoteUrl: string,
    establishedBy: SpaceSyncState["establishedBy"],
    now: Date,
    encryptionUuid?: string
  ): Promise<SpaceSyncState> {
    const customOrigin = customSyncOrigin(remoteUrl)
    if (
      customOrigin &&
      (!encryptionUuid ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
          encryptionUuid
        ))
    )
      throw new Error("Custom Sync requires a verified encryption UUID")
    if (!isOfficialRemoteUrl(remoteUrl, this.remoteOrigin) && !customOrigin) {
      throw new Error("Cannot store an untrusted Eidos Sync Remote")
    }
    const state: SpaceSyncState = {
      version: customOrigin ? 4 : 3,
      ...(encryptionUuid ? { encryptionUuid } : {}),
      ...(customOrigin
        ? {
            provider: "custom" as const,
            serverOrigin: customOrigin,
            encryptionUuid,
            bindingRevision: randomUUID(),
          }
        : {}),
      remoteUrl,
      connectedAt: now.toISOString(),
      establishedBy,
      lastCheckedAt: now.toISOString(),
    }
    return this.write(state)
  }

  private async write(state: SpaceSyncState): Promise<SpaceSyncState> {
    const directory = path.dirname(this.filePath)
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`
    await fs.mkdir(directory, { recursive: true, mode: 0o700 })
    try {
      const handle = await fs.open(temporaryPath, "wx", 0o600)
      try {
        await handle.writeFile(`${JSON.stringify(state)}\n`)
        await handle.sync()
      } finally {
        await handle.close()
      }
      await fs.rename(temporaryPath, this.filePath)
      await fs.chmod(this.filePath, 0o600)
      if (process.platform !== "win32") {
        const handle = await fs.open(directory, "r")
        try {
          await handle.sync()
        } finally {
          await handle.close()
        }
      }
      return state
    } catch (error) {
      await fs.unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }
}
