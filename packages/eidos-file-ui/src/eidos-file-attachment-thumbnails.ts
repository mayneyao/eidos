import type { FileEntry } from "@eidos.space/eidos-file"

import type { AssetPresenter, EidosFileUIAssetSession } from "./context"
import {
  assertEidosFileAssetLease,
  eidosFileAssetRequestContext,
  eidosFileAssetResolutionAllowed,
  releaseEidosFileAssetLease,
} from "./eidos-file-asset-lease"
import { eidosFileCanvasImageSourceDimensions } from "./eidos-file-url-image-source-cache"

export interface EidosFileAttachmentThumbnailCell {
  cell: [number, number]
}

interface ThumbnailRecord {
  active: boolean
  cells: Set<string>
  decodedBytes: number
  entry: FileEntry
  lastAccess: number
  lease?: Awaited<
    ReturnType<EidosFileUIAssetSession["services"]["resolveAsset"]>
  >
  loadAttempts: number
  source?: CanvasImageSource
  state: "queued" | "loading" | "ready" | "failed"
}

export interface EidosFileAttachmentThumbnailManagerOptions {
  decodedBytesMax?: number
  entriesMax?: number
}

const DEFAULT_CACHE_ENTRIES_MAX = 128
const DEFAULT_CACHE_DECODED_BYTES_MAX = 64 * 1024 * 1024
const UNKNOWN_SOURCE_DECODED_BYTES = 4 * 1024 * 1024
const THUMBNAIL_LOAD_ATTEMPTS_MAX = 2

function cellKey(column: number, row: number): string {
  return `${column}:${row}`
}

function cellFromKey(key: string): EidosFileAttachmentThumbnailCell {
  const [column, row] = key.split(":").map(Number)
  return { cell: [column ?? 0, row ?? 0] }
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
  if (typeof close !== "function") return
  try {
    close.call(source)
  } catch {
    // The decoded source is already unavailable.
  }
}

/**
 * Queues Host thumbnail resolution within the negotiated lease budget, then
 * retains the decoded source for visible Grid cells after releasing the lease.
 * Canonical File URIs never enter the Canvas loader directly.
 */
export class EidosFileAttachmentThumbnailManager {
  private accessClock = 0
  private activeLoads = 0
  private readonly cacheDecodedBytesMax: number
  private readonly cacheEntriesMax: number
  private readonly concurrentLoads: number
  private readonly loadQueue: ThumbnailRecord[] = []
  private readonly records = new Map<string, ThumbnailRecord>()
  private readonly cellEntries = new Map<string, Set<string>>()

  constructor(
    private readonly session: EidosFileUIAssetSession | undefined,
    private readonly presenter: AssetPresenter<unknown> | undefined,
    private readonly onCellsReady: (
      cells: EidosFileAttachmentThumbnailCell[]
    ) => void,
    options: EidosFileAttachmentThumbnailManagerOptions = {}
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

  prepare(
    entries: readonly FileEntry[],
    column: number,
    row: number
  ): readonly CanvasImageSource[] {
    const key = cellKey(column, row)
    const eligible = entries.filter(
      (entry) =>
        entry.mediaType.toLowerCase().startsWith("image/") &&
        this.presenter?.loadImage !== undefined &&
        eidosFileAssetResolutionAllowed(this.session, entry, "thumbnail")
    )
    const nextIds = new Set(eligible.map((entry) => entry.id))
    this.replaceCellEntries(key, nextIds)

    const sources: CanvasImageSource[] = []
    for (const entry of eligible) {
      let record = this.records.get(entry.id)
      if (!record) {
        record = {
          active: true,
          cells: new Set(),
          decodedBytes: 0,
          entry,
          lastAccess: 0,
          loadAttempts: 0,
          state: "queued",
        }
        this.records.set(entry.id, record)
        this.loadQueue.push(record)
      }
      record.cells.add(key)
      this.touch(record)
      if (record.source) sources.push(record.source)
    }
    this.drainLoadQueue()
    return sources
  }

  retainVisibleRows(firstRow: number, rowCount: number): void {
    const start = Math.max(0, firstRow - 2)
    const end = firstRow + Math.max(0, rowCount) + 2
    for (const key of [...this.cellEntries.keys()]) {
      const row = Number(key.split(":")[1])
      if (!Number.isFinite(row) || row < start || row >= end) {
        this.replaceCellEntries(key, new Set())
      }
    }
  }

  clear(): void {
    this.cellEntries.clear()
    this.loadQueue.length = 0
    for (const record of this.records.values()) this.dispose(record)
    this.records.clear()
    this.accessClock = 0
  }

  private touch(record: ThumbnailRecord): void {
    this.accessClock += 1
    record.lastAccess = this.accessClock
  }

  private pruneCache(): void {
    const cached = [...this.records.values()]
      .filter(
        (record) =>
          record.cells.size === 0 &&
          record.state === "ready" &&
          record.source !== undefined
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
      if (this.records.get(record.entry.id) === record) {
        this.records.delete(record.entry.id)
      }
      this.dispose(record)
    }
  }

  private drainLoadQueue(): void {
    while (
      this.activeLoads < this.concurrentLoads &&
      this.loadQueue.length > 0
    ) {
      const record = this.loadQueue.shift()!
      if (
        !record.active ||
        record.cells.size === 0 ||
        record.state !== "queued"
      ) {
        continue
      }
      record.state = "loading"
      record.loadAttempts += 1
      this.activeLoads += 1
      void this.load(record).finally(() => {
        this.activeLoads -= 1
        this.drainLoadQueue()
      })
    }
  }

  private replaceCellEntries(key: string, nextIds: Set<string>): void {
    const previous = this.cellEntries.get(key) ?? new Set<string>()
    for (const entryId of previous) {
      if (nextIds.has(entryId)) continue
      const record = this.records.get(entryId)
      record?.cells.delete(key)
      if (record && record.cells.size === 0) {
        if (record.state === "ready" && record.source) {
          this.pruneCache()
        } else {
          this.records.delete(entryId)
          this.dispose(record)
        }
      }
    }
    if (nextIds.size > 0) this.cellEntries.set(key, nextIds)
    else this.cellEntries.delete(key)
  }

  private async load(record: ThumbnailRecord): Promise<void> {
    if (!this.session || !this.presenter?.loadImage) return
    let lease: ThumbnailRecord["lease"]
    try {
      lease = await this.session.services.resolveAsset(
        {
          sessionId: this.session.state.sessionId,
          entryId: record.entry.id,
          purpose: "thumbnail",
        },
        eidosFileAssetRequestContext("asset-grid-thumbnail")
      )
      assertEidosFileAssetLease(this.session, record.entry, "thumbnail", lease)
      if (!record.active) {
        await releaseEidosFileAssetLease(this.session, lease)
        return
      }
      record.lease = lease
      const source = await this.presenter.loadImage({
        sessionId: this.session.state.sessionId,
        lease,
        altText: record.entry.name,
      })
      if (!record.active) {
        disposeImageSource(source)
        await releaseEidosFileAssetLease(this.session, lease)
        return
      }
      record.source = source
      record.decodedBytes = decodedImageBytes(source)
      record.state = "ready"
      record.lease = undefined
      await releaseEidosFileAssetLease(this.session, lease)
      this.touch(record)
      this.onCellsReady([...record.cells].map(cellFromKey))
    } catch {
      if (lease) {
        await releaseEidosFileAssetLease(this.session, lease)
      }
      record.lease = undefined
      record.source = undefined
      record.decodedBytes = 0
      if (
        record.active &&
        record.cells.size > 0 &&
        record.loadAttempts < THUMBNAIL_LOAD_ATTEMPTS_MAX
      ) {
        record.state = "queued"
        this.loadQueue.push(record)
      } else {
        record.state = "failed"
      }
    }
  }

  private dispose(record: ThumbnailRecord): void {
    if (!record.active) return
    record.active = false
    if (record.lease && this.session) {
      void releaseEidosFileAssetLease(this.session, record.lease)
    }
    record.lease = undefined
    record.decodedBytes = 0
    disposeImageSource(record.source)
    record.source = undefined
    record.cells.clear()
  }
}
