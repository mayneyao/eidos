import type { AssetLease, FileEntry } from "@eidos.space/eidos-file"

import type {
  AssetPresenter,
  EidosFileUIAssetSession,
  EidosFileThumbnailSize,
} from "./context"
import { eidosFileCanvasImageSourceDimensions } from "./eidos-file-url-image-source-cache"
import {
  assertEidosFileAssetLease,
  eidosFileAssetRequestContext,
  eidosFileAssetResolutionAllowed,
  eidosFileHasThumbnail,
  releaseEidosFileAssetLease,
  resolveEidosFileThumbnail,
} from "./eidos-file-asset-lease"

export type EidosFileAttachmentSourceState =
  | "unavailable"
  | "loading"
  | "ready"
  | "failed"

export interface EidosFileAttachmentSourceSnapshot {
  readonly source?: CanvasImageSource
  readonly state: EidosFileAttachmentSourceState
}

interface SourceRecord {
  active: boolean
  started: boolean
  decodedBytes: number
  lastAccess: number
  failedAt?: number
  entry: FileEntry
  key: string
  lease?: AssetLease
  listeners: Set<() => void>
  snapshot: EidosFileAttachmentSourceSnapshot
}

export interface EidosFileAttachmentSourceCacheOptions {
  size?: EidosFileThumbnailSize
  entriesMax?: number
  decodedBytesMax?: number
}

const FAILURE_TTL_MS = 30_000

function decodedBytes(source: CanvasImageSource): number {
  const size = eidosFileCanvasImageSourceDimensions(source)
  return size
    ? Math.ceil(size.width) * Math.ceil(size.height) * 4
    : 4 * 1024 * 1024
}

const UNAVAILABLE_SNAPSHOT: EidosFileAttachmentSourceSnapshot = {
  state: "unavailable",
}
const LOADING_SNAPSHOT: EidosFileAttachmentSourceSnapshot = { state: "loading" }
const FAILED_SNAPSHOT: EidosFileAttachmentSourceSnapshot = { state: "failed" }

function entryKey(entry: FileEntry): string {
  return JSON.stringify([
    entry.id,
    entry.uri,
    entry.name,
    entry.mediaType,
    entry.size,
  ])
}

function disposeImageSource(source: CanvasImageSource | undefined): void {
  if (!source) return
  const close = (source as unknown as { close?: unknown }).close
  if (typeof close !== "function") return
  try {
    close.call(source)
  } catch {
    // The decoded source is already unavailable.
  }
}

/**
 * Decodes Gallery attachment covers through a bounded queue and releases each
 * Host lease before publishing the drawable source. This keeps virtualized
 * cards from holding the entire session lease budget for their mounted life.
 */
export class EidosFileAttachmentSourceCache {
  private accessClock = 0
  private activeLoads = 0
  private readonly entriesMax: number
  private readonly decodedBytesMax: number
  private readonly size: EidosFileThumbnailSize
  private readonly concurrentLoads: number
  private readonly loadQueue: SourceRecord[] = []
  private readonly records = new Map<string, SourceRecord>()

  constructor(
    private readonly session: EidosFileUIAssetSession | undefined,
    private readonly presenter: AssetPresenter<unknown> | undefined,
    options: EidosFileAttachmentSourceCacheOptions = {}
  ) {
    this.size = options.size ?? 512
    this.entriesMax = Math.max(0, options.entriesMax ?? 256)
    this.decodedBytesMax = Math.max(
      0,
      options.decodedBytesMax ?? 64 * 1024 * 1024
    )
    this.concurrentLoads = Math.max(
      1,
      Math.min(4, session?.state.limits.concurrentAssetLeasesMax ?? 1)
    )
  }

  canResolve(entry: FileEntry): boolean {
    return Boolean(
      this.presenter?.loadImage &&
      eidosFileHasThumbnail(entry) &&
      eidosFileAssetResolutionAllowed(this.session, entry, "thumbnail")
    )
  }

  snapshot(entry: FileEntry): EidosFileAttachmentSourceSnapshot {
    return this.records.get(entryKey(entry))?.snapshot ?? UNAVAILABLE_SNAPSHOT
  }

  subscribe(entry: FileEntry, listener: () => void): () => void {
    if (!this.canResolve(entry)) return () => undefined
    const key = entryKey(entry)
    let record = this.records.get(key)
    if (
      record?.listeners.size === 0 &&
      record.failedAt !== undefined &&
      Date.now() - record.failedAt >= FAILURE_TTL_MS
    ) {
      this.evict(record)
      record = undefined
    }
    if (!record) {
      record = {
        active: true,
        started: false,
        decodedBytes: 0,
        lastAccess: 0,
        entry,
        key,
        listeners: new Set(),
        snapshot: LOADING_SNAPSHOT,
      }
      this.records.set(key, record)
      this.loadQueue.push(record)
    }
    this.touch(record)
    record.listeners.add(listener)
    this.drainLoadQueue()
    return () => {
      record?.listeners.delete(listener)
      if (record?.listeners.size === 0) {
        if (record.snapshot.state === "loading" && !record.started)
          this.evict(record)
        else this.pruneCache()
      }
    }
  }

  clear(): void {
    this.loadQueue.length = 0
    for (const record of this.records.values()) {
      const source = record.snapshot.source
      record.snapshot = UNAVAILABLE_SNAPSHOT
      this.notify(record)
      disposeImageSource(source)
      this.dispose(record)
    }
    this.records.clear()
    this.accessClock = 0
  }

  private touch(record: SourceRecord): void {
    record.lastAccess = ++this.accessClock
  }

  private pruneCache(): void {
    const cached = [...this.records.values()]
      .filter(
        (record) =>
          record.listeners.size === 0 && record.snapshot.state !== "loading"
      )
      .sort((a, b) => a.lastAccess - b.lastAccess)
    let entries = cached.length
    let bytes = cached.reduce((total, record) => total + record.decodedBytes, 0)
    for (const record of cached) {
      if (entries <= this.entriesMax && bytes <= this.decodedBytesMax) break
      entries -= 1
      bytes -= record.decodedBytes
      this.evict(record)
    }
  }

  private notify(record: SourceRecord): void {
    for (const listener of record.listeners) listener()
  }

  private evict(record: SourceRecord): void {
    if (this.records.get(record.key) === record) {
      this.records.delete(record.key)
    }
    this.dispose(record)
  }

  private drainLoadQueue(): void {
    while (
      this.activeLoads < this.concurrentLoads &&
      this.loadQueue.length > 0
    ) {
      const record = this.loadQueue.shift()!
      if (
        !record.active ||
        record.listeners.size === 0 ||
        record.snapshot.state !== "loading"
      ) {
        continue
      }
      this.activeLoads += 1
      record.started = true
      void this.load(record).finally(() => {
        this.activeLoads -= 1
        this.drainLoadQueue()
      })
    }
  }

  private async load(record: SourceRecord): Promise<void> {
    const loadImage = this.presenter?.loadImage
    if (!this.session || !loadImage) return
    let lease: AssetLease | undefined
    try {
      lease = await resolveEidosFileThumbnail(
        this.session,
        record.entry.id,
        this.size,
        eidosFileAssetRequestContext("asset-gallery-thumbnail")
      )
      record.lease = lease
      assertEidosFileAssetLease(this.session, record.entry, "thumbnail", lease)
      if (!record.active) return
      const source = await loadImage.call(this.presenter, {
        sessionId: this.session.state.sessionId,
        lease,
        altText: record.entry.name,
      })
      if (!record.active) {
        disposeImageSource(source)
        return
      }
      await this.releaseLease(record, lease)
      lease = undefined
      if (!record.active) {
        disposeImageSource(source)
        return
      }
      record.decodedBytes = decodedBytes(source)
      record.snapshot = { source, state: "ready" }
      this.touch(record)
      this.notify(record)
      this.pruneCache()
    } catch {
      if (!record.active) return
      record.snapshot = FAILED_SNAPSHOT
      record.failedAt = Date.now()
      this.notify(record)
      this.pruneCache()
    } finally {
      if (lease) await this.releaseLease(record, lease)
    }
  }

  private releaseLease(record: SourceRecord, lease: AssetLease): Promise<void> {
    if (record.lease?.leaseId !== lease.leaseId || !this.session) {
      return Promise.resolve()
    }
    record.lease = undefined
    return releaseEidosFileAssetLease(this.session, lease)
  }

  private dispose(record: SourceRecord): void {
    if (!record.active) return
    record.active = false
    if (record.lease && this.session) {
      void this.releaseLease(record, record.lease)
    }
    disposeImageSource(record.snapshot.source)
    record.snapshot = UNAVAILABLE_SNAPSHOT
    record.listeners.clear()
  }
}

interface SharedCacheBinding {
  cache: EidosFileAttachmentSourceCache
  scope: string
}

const sharedCaches = new WeakMap<
  EidosFileUIAssetSession,
  WeakMap<object, Map<EidosFileThumbnailSize, SharedCacheBinding>>
>()

function authorizationScope(session: EidosFileUIAssetSession): string {
  return JSON.stringify([
    session.state.sessionId,
    ["fatal", "closed"].includes(session.state.phase)
      ? session.state.phase
      : "available",
    session.serviceCapabilities.canUseAssets,
    session.state.capabilities.assetReadSchemes,
    session.state.limits.assetPreviewBytesMax,
    session.localAssetThumbnailBytesMax,
    session.state.limits.concurrentAssetLeasesMax,
  ])
}

export function sharedEidosFileAttachmentSourceCache(
  session: EidosFileUIAssetSession | undefined,
  presenter: AssetPresenter<unknown> | undefined,
  size: EidosFileThumbnailSize = 512
): EidosFileAttachmentSourceCache | undefined {
  if (!session || !presenter?.loadImage) return undefined
  let byPresenter = sharedCaches.get(session)
  if (!byPresenter) {
    byPresenter = new WeakMap()
    sharedCaches.set(session, byPresenter)
  }
  const scope = authorizationScope(session)
  let bySize = byPresenter.get(presenter)
  if (!bySize) {
    bySize = new Map()
    byPresenter.set(presenter, bySize)
  }
  const existing = bySize.get(size)
  if (existing?.scope === scope) return existing.cache
  for (const [cachedSize, binding] of bySize) {
    if (binding.scope !== scope) {
      binding.cache.clear()
      bySize.delete(cachedSize)
    }
  }
  const cache = new EidosFileAttachmentSourceCache(session, presenter, {
    size,
    decodedBytesMax: size === 128 ? 16 * 1024 * 1024 : 64 * 1024 * 1024,
  })
  bySize.set(size, { cache, scope })
  return cache
}
