import { useEffect, useMemo } from "react"
import type { SpaceBinaryFile } from "@eidos.space/file-space"

const DEFAULT_MAX_CACHED_COVERS = 64
const DEFAULT_MAX_CACHED_BYTES = 64 * 1024 * 1024
const DEFAULT_COVER_TTL_MS = 60_000

type ReadBinary = (path: string) => Promise<SpaceBinaryFile>

interface CachedCover {
  expiresAt: number
  promise: Promise<SpaceBinaryFile>
  settled: boolean
  size: number
}

export interface BaseCoverReaderOptions {
  maxBytes?: number
  maxEntries?: number
  now?: () => number
  ttlMs?: number
}

export interface BaseCoverReader {
  clear: () => void
  read: ReadBinary
}

export function createBaseCoverReader(
  readBinary: ReadBinary,
  options: BaseCoverReaderOptions = {}
): BaseCoverReader {
  const maxBytes = Math.max(1, options.maxBytes ?? DEFAULT_MAX_CACHED_BYTES)
  const maxEntries = Math.max(
    1,
    options.maxEntries ?? DEFAULT_MAX_CACHED_COVERS
  )
  const now = options.now ?? Date.now
  const ttlMs = Math.max(0, options.ttlMs ?? DEFAULT_COVER_TTL_MS)
  const entries = new Map<string, CachedCover>()
  let cachedBytes = 0

  const remove = (path: string, entry: CachedCover) => {
    if (entries.get(path) !== entry) return false
    entries.delete(path)
    if (entry.settled) cachedBytes = Math.max(0, cachedBytes - entry.size)
    return true
  }

  const touch = (path: string, entry: CachedCover) => {
    if (entries.get(path) !== entry) return
    entries.delete(path)
    entries.set(path, entry)
  }

  const trim = () => {
    while (entries.size > maxEntries || cachedBytes > maxBytes) {
      let removed = false
      for (const [path, entry] of entries) {
        if (!entry.settled) continue
        removed = remove(path, entry)
        if (removed) break
      }
      if (!removed) break
    }
  }

  const read: ReadBinary = (path) => {
    const existing = entries.get(path)
    if (existing) {
      if (!existing.settled || existing.expiresAt > now()) {
        touch(path, existing)
        return existing.promise
      }
      remove(path, existing)
    }

    let entry: CachedCover
    const promise = Promise.resolve()
      .then(() => readBinary(path))
      .then(
        (file) => {
          if (entries.get(path) === entry) {
            entry.settled = true
            entry.size = Math.max(file.size, file.content.byteLength)
            entry.expiresAt = now() + ttlMs
            cachedBytes += entry.size
            touch(path, entry)
            trim()
          }
          return file
        },
        (error: unknown) => {
          remove(path, entry)
          throw error
        }
      )
    entry = {
      expiresAt: Number.POSITIVE_INFINITY,
      promise,
      settled: false,
      size: 0,
    }
    entries.set(path, entry)
    trim()
    return promise
  }

  return {
    clear: () => {
      entries.clear()
      cachedBytes = 0
    },
    read,
  }
}

export function useBaseCoverReader(
  readBinary?: ReadBinary
): ReadBinary | undefined {
  const reader = useMemo(
    () => (readBinary ? createBaseCoverReader(readBinary) : undefined),
    [readBinary]
  )

  useEffect(
    () => () => {
      reader?.clear()
    },
    [reader]
  )

  return reader?.read
}
