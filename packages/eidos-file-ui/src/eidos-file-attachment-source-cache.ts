import type { AssetLease, FileEntry } from "@eidos.space/eidos-file"

import type { AssetPresenter, EidosFileUIAssetSession } from "./context"
import {
  assertEidosFileAssetLease,
  eidosFileAssetRequestContext,
  eidosFileAssetResolutionAllowed,
  releaseEidosFileAssetLease,
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
  entry: FileEntry
  key: string
  lease?: AssetLease
  listeners: Set<() => void>
  snapshot: EidosFileAttachmentSourceSnapshot
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
  private activeLoads = 0
  private readonly concurrentLoads: number
  private readonly loadQueue: SourceRecord[] = []
  private readonly records = new Map<string, SourceRecord>()

  constructor(
    private readonly session: EidosFileUIAssetSession | undefined,
    private readonly presenter: AssetPresenter<unknown> | undefined
  ) {
    this.concurrentLoads = Math.max(
      1,
      Math.min(4, session?.state.limits.concurrentAssetLeasesMax ?? 1)
    )
  }

  canResolve(entry: FileEntry): boolean {
    return Boolean(
      this.presenter?.loadImage &&
      entry.mediaType.toLowerCase().startsWith("image/") &&
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
    if (!record) {
      record = {
        active: true,
        entry,
        key,
        listeners: new Set(),
        snapshot: LOADING_SNAPSHOT,
      }
      this.records.set(key, record)
      this.loadQueue.push(record)
    }
    record.listeners.add(listener)
    this.drainLoadQueue()
    return () => {
      record?.listeners.delete(listener)
      if (record?.listeners.size === 0) this.evict(record)
    }
  }

  clear(): void {
    this.loadQueue.length = 0
    for (const record of this.records.values()) this.dispose(record)
    this.records.clear()
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
      lease = await this.session.services.resolveAsset(
        {
          sessionId: this.session.state.sessionId,
          entryId: record.entry.id,
          purpose: "thumbnail",
        },
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
      record.snapshot = { source, state: "ready" }
      this.notify(record)
    } catch {
      if (!record.active) return
      record.snapshot = FAILED_SNAPSHOT
      this.notify(record)
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

export function sharedEidosFileAttachmentSourceCache(
  session: EidosFileUIAssetSession | undefined,
  presenter: AssetPresenter<unknown> | undefined
): EidosFileAttachmentSourceCache | undefined {
  if (!session || !presenter?.loadImage) return undefined
  let byPresenter = sharedCaches.get(session)
  if (!byPresenter) {
    byPresenter = new WeakMap()
    sharedCaches.set(session, byPresenter)
  }
  const scope = authorizationScope(session)
  const existing = byPresenter.get(presenter)
  if (existing?.scope === scope) return existing.cache
  existing?.cache.clear()
  const cache = new EidosFileAttachmentSourceCache(session, presenter)
  byPresenter.set(presenter, { cache, scope })
  return cache
}
