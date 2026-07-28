import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import type {
  EidosSyncFailure,
  EidosSyncQueueTrigger,
} from "../../shared/contracts"

export interface StoredSyncQueueEntry {
  version: 1
  state: "pending" | "running" | "retry-wait" | "paused"
  trigger: EidosSyncQueueTrigger
  attempt: number
  queuedAtMs: number
  nextAttemptAtMs?: number
  lastFailure?: EidosSyncFailure
}

const SAFE_SPACE_ID = /^[A-Za-z0-9_-]{8,128}$/

function isFailure(value: unknown): value is EidosSyncFailure {
  if (typeof value !== "object" || value === null) return false
  const failure = value as Partial<EidosSyncFailure>
  return (
    typeof failure.code === "string" &&
    typeof failure.state === "string" &&
    typeof failure.title === "string" &&
    typeof failure.message === "string" &&
    typeof failure.action === "string" &&
    typeof failure.actionLabel === "string" &&
    typeof failure.retryable === "boolean" &&
    failure.localSafe === true
  )
}

function parseStored(value: unknown): StoredSyncQueueEntry | null {
  if (typeof value !== "object" || value === null) return null
  const entry = value as Partial<StoredSyncQueueEntry>
  if (
    entry.version !== 1 ||
    !["pending", "running", "retry-wait", "paused"].includes(
      String(entry.state)
    ) ||
    !["local-checkpoint", "manual", "crash-recovery"].includes(
      String(entry.trigger)
    ) ||
    !Number.isSafeInteger(entry.attempt) ||
    Number(entry.attempt) < 0 ||
    !Number.isFinite(entry.queuedAtMs) ||
    (entry.nextAttemptAtMs !== undefined &&
      !Number.isFinite(entry.nextAttemptAtMs)) ||
    (entry.lastFailure !== undefined && !isFailure(entry.lastFailure))
  ) {
    return null
  }
  return entry as StoredSyncQueueEntry
}

export class SyncQueueStore {
  private mutationTail: Promise<void> = Promise.resolve()

  constructor(private readonly stateDirectory: string) {}

  async read(spaceId: string): Promise<StoredSyncQueueEntry | null> {
    try {
      const parsed = parseStored(
        JSON.parse(await fs.readFile(this.filePath(spaceId), "utf8"))
      )
      if (!parsed) {
        throw new Error("invalid queue state")
      }
      return parsed
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
      throw new Error("Eidos Lite could not read the pending Sync queue.")
    }
  }

  write(spaceId: string, entry: StoredSyncQueueEntry | null): Promise<void> {
    const scheduled = this.mutationTail.then(() =>
      entry ? this.writeEntry(spaceId, entry) : this.removeEntry(spaceId)
    )
    this.mutationTail = scheduled.then(
      () => undefined,
      () => undefined
    )
    return scheduled
  }

  private filePath(spaceId: string): string {
    if (!SAFE_SPACE_ID.test(spaceId)) {
      throw new Error("Invalid Space identity for Sync queue state")
    }
    return path.join(this.stateDirectory, "spaces", spaceId, "sync-queue.json")
  }

  private async writeEntry(
    spaceId: string,
    entry: StoredSyncQueueEntry
  ): Promise<void> {
    const filePath = this.filePath(spaceId)
    const directory = path.dirname(filePath)
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`
    await fs.mkdir(directory, { recursive: true, mode: 0o700 })
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(entry)}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      })
      await fs.rename(temporaryPath, filePath)
      await fs.chmod(filePath, 0o600)
    } catch (error) {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  private removeEntry(spaceId: string): Promise<void> {
    return fs.rm(this.filePath(spaceId), { force: true })
  }
}
