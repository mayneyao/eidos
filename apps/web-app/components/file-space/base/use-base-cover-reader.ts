import { useEffect, useMemo } from "react"
import type { SpaceBinaryFile } from "@eidos.space/file-space"

const DEFAULT_MAX_CACHED_COVERS = 64
const DEFAULT_MAX_CACHED_BYTES = 64 * 1024 * 1024
const DEFAULT_MAX_CONCURRENT_READS = 6
const DEFAULT_COVER_TTL_MS = 60_000

type ReadBinary = (path: string) => Promise<SpaceBinaryFile>

export interface BaseCoverLease {
  release: () => void
  source: string
}

interface CachedCover {
  expiresAt: number
  promise: Promise<string>
  references: number
  settled: boolean
  size: number
  source: string | null
}

export interface BaseCoverReaderOptions {
  maxBytes?: number
  maxConcurrentReads?: number
  maxEntries?: number
  now?: () => number
  ttlMs?: number
}

export interface BaseCoverReader {
  acquire: (path: string, signal?: AbortSignal) => Promise<BaseCoverLease>
  dispose: () => void
}

export type BaseCoverAcquire = BaseCoverReader["acquire"]

interface PendingCoverRead {
  isCurrent: () => boolean
  path: string
  reject: (error: unknown) => void
  resolve: (file: SpaceBinaryFile) => void
}

function coverAbortError(): DOMException {
  return new DOMException("Base cover read was canceled", "AbortError")
}

function imageMimeType(path: string): string {
  const extension = path.split("?")[0]?.split(".").at(-1)?.toLowerCase()
  if (extension === "png") return "image/png"
  if (extension === "gif") return "image/gif"
  if (extension === "webp") return "image/webp"
  if (extension === "svg") return "image/svg+xml"
  if (extension === "avif") return "image/avif"
  return "image/jpeg"
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
  const maxConcurrentReads = Math.max(
    1,
    Math.trunc(options.maxConcurrentReads ?? DEFAULT_MAX_CONCURRENT_READS)
  )
  const now = options.now ?? Date.now
  const ttlMs = Math.max(0, options.ttlMs ?? DEFAULT_COVER_TTL_MS)
  const entries = new Map<string, CachedCover>()
  const pendingReads = new Map<string, PendingCoverRead>()
  let activeReads = 0
  let cachedBytes = 0
  let disposed = false
  let drainScheduled = false

  const drainReads = () => {
    while (activeReads < maxConcurrentReads && pendingReads.size > 0) {
      const next = pendingReads.entries().next().value
      if (!next) return
      const [path, task] = next
      pendingReads.delete(path)
      if (!task.isCurrent()) {
        task.reject(coverAbortError())
        continue
      }
      activeReads += 1
      let read: Promise<SpaceBinaryFile>
      try {
        read = readBinary(task.path)
      } catch (error) {
        activeReads = Math.max(0, activeReads - 1)
        task.reject(error)
        continue
      }
      void read.then(task.resolve, task.reject).finally(() => {
        activeReads = Math.max(0, activeReads - 1)
        drainReads()
      })
    }
  }

  const scheduleDrain = () => {
    if (drainScheduled) return
    drainScheduled = true
    queueMicrotask(() => {
      drainScheduled = false
      drainReads()
    })
  }

  const readWithLimit = (
    path: string,
    isCurrent: () => boolean
  ): Promise<SpaceBinaryFile> =>
    new Promise((resolve, reject) => {
      pendingReads.set(path, { isCurrent, path, reject, resolve })
      scheduleDrain()
    })

  const cancelPendingRead = (path: string) => {
    const task = pendingReads.get(path)
    if (!task) return
    pendingReads.delete(path)
    task.reject(coverAbortError())
  }

  const remove = (path: string, entry: CachedCover) => {
    if (entries.get(path) !== entry || entry.references > 0) return false
    entries.delete(path)
    if (!entry.settled) cancelPendingRead(path)
    if (entry.settled) cachedBytes = Math.max(0, cachedBytes - entry.size)
    if (entry.source) URL.revokeObjectURL(entry.source)
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
        if (!entry.settled || entry.references > 0) continue
        removed = remove(path, entry)
        if (removed) break
      }
      if (!removed) break
    }
  }

  const lease = (
    path: string,
    entry: CachedCover,
    signal?: AbortSignal
  ): Promise<BaseCoverLease> => {
    let released = false
    const release = () => {
      if (released) return
      released = true
      entry.references = Math.max(0, entry.references - 1)
      if (
        entry.references === 0 &&
        (!entry.settled || disposed || entry.expiresAt <= now())
      ) {
        remove(path, entry)
      }
      trim()
    }

    if (signal?.aborted) {
      release()
      return Promise.reject(coverAbortError())
    }

    return new Promise((resolve, reject) => {
      let completed = false
      const finish = (operation: () => void) => {
        if (completed) return
        completed = true
        signal?.removeEventListener("abort", onAbort)
        operation()
      }
      const onAbort = () =>
        finish(() => {
          release()
          reject(coverAbortError())
        })
      signal?.addEventListener("abort", onAbort, { once: true })
      void entry.promise.then(
        (source) =>
          finish(() => {
            resolve({ source, release })
          }),
        (error: unknown) =>
          finish(() => {
            release()
            reject(error)
          })
      )
    })
  }

  const acquire = (
    path: string,
    signal?: AbortSignal
  ): Promise<BaseCoverLease> => {
    if (disposed) {
      return Promise.reject(new Error("Base cover reader is disposed"))
    }
    if (signal?.aborted) return Promise.reject(coverAbortError())
    const existing = entries.get(path)
    if (existing) {
      if (
        !existing.settled ||
        existing.references > 0 ||
        existing.expiresAt > now()
      ) {
        existing.references += 1
        touch(path, existing)
        return lease(path, existing, signal)
      }
      remove(path, existing)
    }

    let entry: CachedCover
    const promise = readWithLimit(
      path,
      () => !disposed && entries.get(path) === entry
    ).then(
      (file) => {
        const content = new Uint8Array(file.content)
        const source = URL.createObjectURL(
          new Blob([content.buffer], { type: imageMimeType(path) })
        )
        if (entries.get(path) === entry) {
          entry.settled = true
          entry.size = Math.max(file.size, file.content.byteLength)
          entry.source = source
          entry.expiresAt = now() + ttlMs
          cachedBytes += entry.size
          touch(path, entry)
          if (disposed && entry.references === 0) remove(path, entry)
          trim()
        } else {
          URL.revokeObjectURL(source)
        }
        return source
      },
      (error: unknown) => {
        if (entries.get(path) === entry) entries.delete(path)
        throw error
      }
    )
    entry = {
      expiresAt: Number.POSITIVE_INFINITY,
      promise,
      references: 1,
      settled: false,
      size: 0,
      source: null,
    }
    entries.set(path, entry)
    trim()
    return lease(path, entry, signal)
  }

  return {
    acquire,
    dispose: () => {
      disposed = true
      for (const [path, entry] of entries) remove(path, entry)
    },
  }
}

export function useBaseCoverReader(
  readBinary?: ReadBinary
): BaseCoverReader["acquire"] | undefined {
  const reader = useMemo(
    () => (readBinary ? createBaseCoverReader(readBinary) : undefined),
    [readBinary]
  )

  useEffect(
    () => () => {
      reader?.dispose()
    },
    [reader]
  )

  return reader?.acquire
}
