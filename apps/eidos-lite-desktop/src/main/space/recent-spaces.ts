import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import type { RecentSpaceEntry } from "../../shared/contracts"
import type { CanonicalSpace } from "./space-paths"

interface StoredRecentSpace {
  id: string
  name: string
  path: string
  lastOpenedAt: string
}

function storedEntry(value: unknown): StoredRecentSpace | null {
  if (typeof value !== "object" || value === null) return null
  const item = value as Record<string, unknown>
  if (
    typeof item.id !== "string" ||
    typeof item.name !== "string" ||
    typeof item.path !== "string" ||
    typeof item.lastOpenedAt !== "string"
  ) {
    return null
  }
  return {
    id: item.id,
    name: item.name,
    path: item.path,
    lastOpenedAt: item.lastOpenedAt,
  }
}

export class RecentSpacesStore {
  private mutationTail: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async list(): Promise<RecentSpaceEntry[]> {
    const stored = await this.read()
    return Promise.all(
      stored
        .sort((left, right) =>
          right.lastOpenedAt.localeCompare(left.lastOpenedAt)
        )
        .slice(0, 20)
        .map(async (entry) => ({
          ...entry,
          available: await fs
            .stat(entry.path)
            .then((stats) => stats.isDirectory())
            .catch(() => false),
        }))
    )
  }

  record(space: CanonicalSpace): Promise<void> {
    return this.mutate(async (entries) => {
      const next: StoredRecentSpace = {
        id: space.id,
        name: space.name,
        path: space.displayPath,
        lastOpenedAt: new Date().toISOString(),
      }
      return [next, ...entries.filter((entry) => entry.id !== space.id)].slice(
        0,
        20
      )
    })
  }

  remove(id: string): Promise<void> {
    return this.mutate(async (entries) =>
      entries.filter((entry) => entry.id !== id)
    )
  }

  async pathFor(id: string): Promise<string | null> {
    return (await this.read()).find((entry) => entry.id === id)?.path ?? null
  }

  private mutate(
    operation: (entries: StoredRecentSpace[]) => Promise<StoredRecentSpace[]>
  ): Promise<void> {
    const scheduled = this.mutationTail.then(async () => {
      const entries = await operation(await this.read())
      await this.write(entries)
    })
    this.mutationTail = scheduled.then(
      () => undefined,
      () => undefined
    )
    return scheduled
  }

  private async read(): Promise<StoredRecentSpace[]> {
    try {
      const value: unknown = JSON.parse(
        await fs.readFile(this.filePath, "utf8")
      )
      if (!Array.isArray(value)) return []
      return value.flatMap((entry) => {
        const parsed = storedEntry(entry)
        return parsed ? [parsed] : []
      })
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return []
      }
      throw error
    }
  }

  private async write(entries: readonly StoredRecentSpace[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), {
      recursive: true,
      mode: 0o700,
    })
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`
    try {
      await fs.writeFile(temporaryPath, JSON.stringify(entries), {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      })
      await fs.rename(temporaryPath, this.filePath)
      await fs.chmod(this.filePath, 0o600)
    } catch (error) {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
      throw error
    }
  }
}
