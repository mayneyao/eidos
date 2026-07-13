import type { BaseRuntime } from "@eidos.space/base"
import { openBaseFile } from "@eidos.space/base/better-sqlite3"
import { statSync } from "node:fs"
import path from "node:path"

const DEFAULT_MAX_OPEN_BASES = 8

export interface BaseQueryFileFingerprint {
  device: number
  inode: number
  size: number
  modifiedAt: number
  changedAt: number
}

export type BaseQueryRuntimeOpener = (filePath: string) => BaseRuntime
export type BaseQueryFingerprintReader = (
  filePath: string
) => BaseQueryFileFingerprint

interface CachedBaseRuntime {
  fingerprint: BaseQueryFileFingerprint
  runtime: BaseRuntime
}

function readFingerprint(filePath: string): BaseQueryFileFingerprint {
  const file = statSync(filePath)
  return {
    device: file.dev,
    inode: file.ino,
    size: file.size,
    modifiedAt: file.mtimeMs,
    changedAt: file.ctimeMs,
  }
}

function fingerprintsMatch(
  left: BaseQueryFileFingerprint,
  right: BaseQueryFileFingerprint
): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.size === right.size &&
    left.modifiedAt === right.modifiedAt &&
    left.changedAt === right.changedAt
  )
}

export class BaseQueryRuntimeCache {
  private readonly entries = new Map<string, CachedBaseRuntime>()

  constructor(
    private readonly maxOpenBases = DEFAULT_MAX_OPEN_BASES,
    private readonly openRuntime: BaseQueryRuntimeOpener = (filePath) =>
      openBaseFile(filePath, { migrate: true }),
    private readonly fingerprint: BaseQueryFingerprintReader = readFingerprint
  ) {
    if (!Number.isSafeInteger(maxOpenBases) || maxOpenBases < 1) {
      throw new Error("Base query cache size must be a positive integer")
    }
  }

  get(filePath: string): BaseRuntime {
    const canonicalPath = path.resolve(filePath)
    const fingerprint = this.fingerprint(canonicalPath)
    const cached = this.entries.get(canonicalPath)
    if (cached && fingerprintsMatch(cached.fingerprint, fingerprint)) {
      this.entries.delete(canonicalPath)
      this.entries.set(canonicalPath, cached)
      return cached.runtime
    }

    if (cached) {
      this.entries.delete(canonicalPath)
      cached.runtime.close()
    }

    const runtime = this.openRuntime(canonicalPath)
    let openedFingerprint: BaseQueryFileFingerprint
    try {
      openedFingerprint = this.fingerprint(canonicalPath)
    } catch (error) {
      runtime.close()
      throw error
    }
    this.entries.set(canonicalPath, {
      fingerprint: openedFingerprint,
      runtime,
    })
    this.evictOverflow()
    return runtime
  }

  close(filePath?: string): void {
    if (filePath) {
      const canonicalPath = path.resolve(filePath)
      const cached = this.entries.get(canonicalPath)
      if (!cached) return
      this.entries.delete(canonicalPath)
      cached.runtime.close()
      return
    }

    for (const cached of this.entries.values()) cached.runtime.close()
    this.entries.clear()
  }

  private evictOverflow(): void {
    while (this.entries.size > this.maxOpenBases) {
      const oldestPath = this.entries.keys().next().value
      if (typeof oldestPath !== "string") return
      const cached = this.entries.get(oldestPath)
      this.entries.delete(oldestPath)
      cached?.runtime.close()
    }
  }
}
