import type { UrlImageLease } from "@eidos.space/eidos-file"

import type { AssetPresenter, EidosFileUIAssetSession } from "./context"
import {
  eidosFileAssetRequestContext,
  releaseEidosFileAssetLease,
} from "./eidos-file-asset-lease"

export type EidosFileUrlImageSourceState =
  | "unavailable"
  | "loading"
  | "ready"
  | "failed"

export interface EidosFileUrlImageSourceSnapshot {
  readonly source?: CanvasImageSource
  readonly state: EidosFileUrlImageSourceState
}

interface SourceRecord {
  active: boolean
  decodedBytes: number
  lastAccess: number
  lease?: UrlImageLease
  listeners: Set<() => void>
  snapshot: EidosFileUrlImageSourceSnapshot
  uri: string
}

export interface EidosFileUrlImageSourceCacheOptions {
  decodedBytesMax?: number
  entriesMax?: number
}

const UNAVAILABLE_SNAPSHOT: EidosFileUrlImageSourceSnapshot = {
  state: "unavailable",
}
const LOADING_SNAPSHOT: EidosFileUrlImageSourceSnapshot = { state: "loading" }
const FAILED_SNAPSHOT: EidosFileUrlImageSourceSnapshot = { state: "failed" }
const DEFAULT_CACHE_ENTRIES_MAX = 128
const DEFAULT_CACHE_DECODED_BYTES_MAX = 64 * 1024 * 1024
const UNKNOWN_SOURCE_DECODED_BYTES = 4 * 1024 * 1024

function eligibleHttpsImageUri(uri: string): boolean {
  if (uri.length === 0 || uri.trim() !== uri) return false
  try {
    const parsed = new URL(uri)
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.length > 0 &&
      !parsed.username &&
      !parsed.password
    )
  } catch {
    return false
  }
}

function decimalWithin(value: string, maximum: string): boolean {
  try {
    return BigInt(value) >= 0n && BigInt(value) <= BigInt(maximum)
  } catch {
    return false
  }
}

export function eidosFileCanvasImageSourceDimensions(
  source: CanvasImageSource
): { height: number; width: number } | null {
  const candidate = source as unknown as Record<string, unknown>
  const width =
    typeof candidate.naturalWidth === "number"
      ? candidate.naturalWidth
      : typeof candidate.videoWidth === "number"
        ? candidate.videoWidth
        : candidate.width
  const height =
    typeof candidate.naturalHeight === "number"
      ? candidate.naturalHeight
      : typeof candidate.videoHeight === "number"
        ? candidate.videoHeight
        : candidate.height
  return typeof width === "number" &&
    Number.isFinite(width) &&
    width > 0 &&
    typeof height === "number" &&
    Number.isFinite(height) &&
    height > 0
    ? { height, width }
    : null
}

function decodedImageBytes(source: CanvasImageSource): number {
  const dimensions = eidosFileCanvasImageSourceDimensions(source)
  if (!dimensions) return UNKNOWN_SOURCE_DECODED_BYTES
  const bytes = Math.ceil(dimensions.width) * Math.ceil(dimensions.height) * 4
  return Number.isSafeInteger(bytes) && bytes > 0
    ? bytes
    : UNKNOWN_SOURCE_DECODED_BYTES
}

function disposeImageSource(source: CanvasImageSource | undefined): void {
  if (!source) return
  const close = (source as unknown as { close?: unknown }).close
  if (typeof close === "function") {
    try {
      close.call(source)
    } catch {
      // The decoded source is already unavailable.
    }
  }
}

/**
 * Host-authorized, decoded-image cache shared by image-capable UI surfaces.
 * Canonical URLs are never used as browser image sources.
 */
export class EidosFileUrlImageSourceCache {
  private accessClock = 0
  private activeLoads = 0
  private readonly cacheDecodedBytesMax: number
  private readonly cacheEntriesMax: number
  private readonly concurrentLoads: number
  private readonly loadQueue: SourceRecord[] = []
  private readonly records = new Map<string, SourceRecord>()

  constructor(
    private readonly session: EidosFileUIAssetSession | undefined,
    private readonly presenter: AssetPresenter<unknown> | undefined,
    options: EidosFileUrlImageSourceCacheOptions = {}
  ) {
    this.concurrentLoads = Math.max(
      1,
      Math.min(4, session?.state.limits.concurrentAssetLeasesMax ?? 1)
    )
    this.cacheEntriesMax = Math.max(
      0,
      Math.floor(options.entriesMax ?? DEFAULT_CACHE_ENTRIES_MAX)
    )
    this.cacheDecodedBytesMax = Math.max(
      0,
      Math.floor(options.decodedBytesMax ?? DEFAULT_CACHE_DECODED_BYTES_MAX)
    )
  }

  canResolve(uri: string): boolean {
    return Boolean(
      eligibleHttpsImageUri(uri) &&
      this.session?.serviceCapabilities.canUseAssets &&
      this.session.services.resolveUrlImage &&
      this.session.state.capabilities.assetReadSchemes.includes("https") &&
      this.session.state.limits.concurrentAssetLeasesMax > 0 &&
      !["fatal", "closed"].includes(this.session.state.phase) &&
      this.presenter?.loadImage
    )
  }

  snapshot(uri: string): EidosFileUrlImageSourceSnapshot {
    return this.records.get(uri)?.snapshot ?? UNAVAILABLE_SNAPSHOT
  }

  subscribe(uri: string, listener: () => void): () => void {
    if (!this.canResolve(uri)) return () => undefined
    let record = this.records.get(uri)
    if (!record) {
      record = {
        active: true,
        decodedBytes: 0,
        lastAccess: 0,
        listeners: new Set(),
        snapshot: LOADING_SNAPSHOT,
        uri,
      }
      this.records.set(uri, record)
      this.loadQueue.push(record)
    }
    record.listeners.add(listener)
    this.touch(record)
    this.drainLoadQueue()
    return () => {
      record?.listeners.delete(listener)
      if (record?.listeners.size !== 0) return
      if (record.snapshot.state === "ready" && record.snapshot.source) {
        this.pruneCache()
      } else {
        this.evict(record)
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
    this.accessClock += 1
    record.lastAccess = this.accessClock
  }

  private notify(record: SourceRecord): void {
    for (const listener of record.listeners) listener()
  }

  private pruneCache(): void {
    const cached = [...this.records.values()]
      .filter(
        (record) =>
          record.listeners.size === 0 &&
          record.snapshot.state === "ready" &&
          record.snapshot.source !== undefined
      )
      .sort((left, right) => left.lastAccess - right.lastAccess)
    let entries = cached.length
    let decodedBytes = cached.reduce(
      (total, record) => total + record.decodedBytes,
      0
    )
    for (const record of cached) {
      if (
        entries <= this.cacheEntriesMax &&
        decodedBytes <= this.cacheDecodedBytesMax
      ) {
        break
      }
      entries -= 1
      decodedBytes -= record.decodedBytes
      this.evict(record)
    }
  }

  private evict(record: SourceRecord): void {
    if (this.records.get(record.uri) === record) {
      this.records.delete(record.uri)
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
      void this.load(record).finally(() => {
        this.activeLoads -= 1
        this.drainLoadQueue()
      })
    }
  }

  private async load(record: SourceRecord): Promise<void> {
    const resolveUrlImage = this.session?.services.resolveUrlImage
    const loadImage = this.presenter?.loadImage
    if (!this.session || !resolveUrlImage || !loadImage) return
    let lease: UrlImageLease | undefined
    try {
      lease = await resolveUrlImage.call(
        this.session.services,
        {
          sessionId: this.session.state.sessionId,
          uri: record.uri,
          purpose: "thumbnail",
        },
        eidosFileAssetRequestContext("url-image-thumbnail")
      )
      if (
        lease.purpose !== "thumbnail" ||
        !lease.mediaType.toLowerCase().startsWith("image/") ||
        !lease.resourceToken ||
        !decimalWithin(
          lease.size,
          this.session.state.limits.assetPreviewBytesMax
        ) ||
        !Number.isFinite(Date.parse(lease.expiresAt)) ||
        Date.parse(lease.expiresAt) <= Date.now()
      ) {
        throw new Error("Host returned an invalid URL image lease")
      }
      if (!record.active) return
      record.lease = lease
      const source = await loadImage.call(this.presenter, {
        sessionId: this.session.state.sessionId,
        lease,
        altText: "",
      })
      if (!record.active) {
        disposeImageSource(source)
        lease = undefined
        return
      }
      record.lease = undefined
      await releaseEidosFileAssetLease(this.session, lease)
      lease = undefined
      record.decodedBytes = decodedImageBytes(source)
      record.snapshot = { source, state: "ready" }
      this.touch(record)
      this.notify(record)
      if (record.listeners.size === 0) this.pruneCache()
    } catch {
      if (!record.active) return
      record.lease = undefined
      record.snapshot = FAILED_SNAPSHOT
      this.notify(record)
    } finally {
      if (lease) await releaseEidosFileAssetLease(this.session, lease)
    }
  }

  private dispose(record: SourceRecord): void {
    if (!record.active) return
    record.active = false
    if (record.lease && this.session) {
      void releaseEidosFileAssetLease(this.session, record.lease)
    }
    record.lease = undefined
    record.decodedBytes = 0
    disposeImageSource(record.snapshot.source)
    record.snapshot = UNAVAILABLE_SNAPSHOT
    record.listeners.clear()
  }
}

interface SharedCacheBinding {
  cache: EidosFileUrlImageSourceCache
  scope: string
}

const sharedCaches = new WeakMap<
  EidosFileUIAssetSession,
  WeakMap<object, SharedCacheBinding>
>()

function authorizationScope(session: EidosFileUIAssetSession): string {
  return JSON.stringify([
    session.state.sessionId,
    session.state.phase,
    session.serviceCapabilities.canUseAssets,
    session.state.capabilities.assetReadSchemes,
    session.state.limits.assetPreviewBytesMax,
    session.state.limits.concurrentAssetLeasesMax,
  ])
}

export function sharedEidosFileUrlImageSourceCache(
  session: EidosFileUIAssetSession | undefined,
  presenter: AssetPresenter<unknown> | undefined
): EidosFileUrlImageSourceCache | undefined {
  if (!session || !presenter) return undefined
  let byPresenter = sharedCaches.get(session)
  if (!byPresenter) {
    byPresenter = new WeakMap()
    sharedCaches.set(session, byPresenter)
  }
  const scope = authorizationScope(session)
  const existing = byPresenter.get(presenter)
  if (existing?.scope === scope) return existing.cache
  existing?.cache.clear()
  const cache = new EidosFileUrlImageSourceCache(session, presenter)
  byPresenter.set(presenter, { cache, scope })
  return cache
}
