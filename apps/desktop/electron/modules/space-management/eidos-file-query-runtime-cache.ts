import type { EidosFileRuntime } from "@eidos.space/eidos-file"
import { openEidosFile } from "@eidos.space/eidos-file/better-sqlite3"
import { statSync } from "node:fs"
import path from "node:path"

const DEFAULT_MAX_OPEN_BASES = 8

export interface EidosFileQueryFileFingerprint {
  device: number
  inode: number
  size: number
  modifiedAt: number
  changedAt: number
}

export type EidosFileQueryRuntimeOpener = (filePath: string) => EidosFileRuntime
export type EidosFileQueryFingerprintReader = (
  filePath: string
) => EidosFileQueryFileFingerprint

interface CachedEidosFileRuntime {
  fingerprint: EidosFileQueryFileFingerprint
  runtime: EidosFileRuntime
}

function readFingerprint(filePath: string): EidosFileQueryFileFingerprint {
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
  left: EidosFileQueryFileFingerprint,
  right: EidosFileQueryFileFingerprint
): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.size === right.size &&
    left.modifiedAt === right.modifiedAt &&
    left.changedAt === right.changedAt
  )
}

export class EidosFileQueryRuntimeCache {
  private readonly entries = new Map<string, CachedEidosFileRuntime>()

  constructor(
    private readonly maxOpenBases = DEFAULT_MAX_OPEN_BASES,
    private readonly openRuntime: EidosFileQueryRuntimeOpener = (filePath) =>
      openEidosFile(filePath, { readonly: true }),
    private readonly fingerprint: EidosFileQueryFingerprintReader = readFingerprint
  ) {
    if (!Number.isSafeInteger(maxOpenBases) || maxOpenBases < 1) {
      throw new Error("Eidos File query cache size must be a positive integer")
    }
  }

  get(filePath: string): EidosFileRuntime {
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
    let openedFingerprint: EidosFileQueryFileFingerprint
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
