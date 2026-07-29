import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"

import { isOfficialRemoteUrl } from "../graft/graft-client"

export interface SpaceSyncState {
  version: 2
  remoteUrl: string
  connectedAt: string
  establishedBy: "first-push" | "clone"
}

export class SpaceSyncStateStore {
  private readonly filePath: string

  constructor(
    stateDirectory: string,
    private readonly remoteOrigin: string
  ) {
    this.filePath = path.join(stateDirectory, "sync-state.json")
  }

  async read(): Promise<SpaceSyncState | null> {
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
      if (!remoteUrl || !isOfficialRemoteUrl(remoteUrl, this.remoteOrigin)) {
        throw new Error("invalid sync state")
      }
      if (
        value.version === 1 &&
        typeof value.firstPushedAt === "string" &&
        Number.isFinite(Date.parse(value.firstPushedAt))
      ) {
        return {
          version: 2,
          remoteUrl,
          connectedAt: value.firstPushedAt,
          establishedBy: "first-push",
        }
      }
      if (
        value.version !== 2 ||
        typeof value.connectedAt !== "string" ||
        !Number.isFinite(Date.parse(value.connectedAt)) ||
        !["first-push", "clone"].includes(String(value.establishedBy))
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

  async markFirstPush(remoteUrl: string, now = new Date()): Promise<void> {
    await this.markConnected(remoteUrl, "first-push", now)
  }

  async markClone(remoteUrl: string, now = new Date()): Promise<void> {
    await this.markConnected(remoteUrl, "clone", now)
  }

  private async markConnected(
    remoteUrl: string,
    establishedBy: SpaceSyncState["establishedBy"],
    now: Date
  ): Promise<void> {
    if (!isOfficialRemoteUrl(remoteUrl, this.remoteOrigin)) {
      throw new Error("Cannot store an untrusted Eidos Sync Remote")
    }
    const directory = path.dirname(this.filePath)
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`
    const state: SpaceSyncState = {
      version: 2,
      remoteUrl,
      connectedAt: now.toISOString(),
      establishedBy,
    }
    await fs.mkdir(directory, { recursive: true, mode: 0o700 })
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(state)}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      })
      await fs.rename(temporaryPath, this.filePath)
      await fs.chmod(this.filePath, 0o600)
    } catch (error) {
      await fs.unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }
}
