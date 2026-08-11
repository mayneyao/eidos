import type { AssetPresenter, EidosFileUIAssetSession } from "./context"
import type { EidosFileAttachmentThumbnailCell } from "./eidos-file-attachment-thumbnails"
import {
  EidosFileUrlImageSourceCache,
  type EidosFileUrlImageSourceCacheOptions,
} from "./eidos-file-url-image-source-cache"

interface ThumbnailRecord {
  cells: Set<string>
  unsubscribe: () => void
  uri: string
}

function cellKey(column: number, row: number): string {
  return `${column}:${row}`
}

function cellFromKey(key: string): EidosFileAttachmentThumbnailCell {
  const [column, row] = key.split(":").map(Number)
  return { cell: [column ?? 0, row ?? 0] }
}

export class EidosFileUrlImageThumbnailManager {
  private readonly cellUris = new Map<string, string>()
  private readonly ownsSourceCache: boolean
  private readonly records = new Map<string, ThumbnailRecord>()
  private readonly sourceCache: EidosFileUrlImageSourceCache

  constructor(
    session: EidosFileUIAssetSession | undefined,
    presenter: AssetPresenter<unknown> | undefined,
    private readonly onCellsReady: (
      cells: EidosFileAttachmentThumbnailCell[]
    ) => void,
    cacheOptions: EidosFileUrlImageSourceCacheOptions = {},
    sourceCache?: EidosFileUrlImageSourceCache
  ) {
    this.ownsSourceCache = sourceCache === undefined
    this.sourceCache =
      sourceCache ??
      new EidosFileUrlImageSourceCache(session, presenter, cacheOptions)
  }

  prepare(
    uri: string,
    column: number,
    row: number
  ): CanvasImageSource | undefined {
    const key = cellKey(column, row)
    const previousUri = this.cellUris.get(key)
    if (previousUri && previousUri !== uri) this.releaseCell(previousUri, key)
    if (!this.sourceCache.canResolve(uri)) {
      if (previousUri) this.releaseCell(previousUri, key)
      else this.cellUris.delete(key)
      return undefined
    }
    this.cellUris.set(key, uri)
    let record = this.records.get(uri)
    if (!record) {
      record = {
        cells: new Set(),
        unsubscribe: () => undefined,
        uri,
      }
      this.records.set(uri, record)
      record.unsubscribe = this.sourceCache.subscribe(uri, () => {
        if (
          this.records.get(uri) !== record ||
          this.sourceCache.snapshot(uri).state !== "ready"
        ) {
          return
        }
        this.onCellsReady([...record!.cells].map(cellFromKey))
      })
    }
    record.cells.add(key)
    return this.sourceCache.snapshot(uri).source
  }

  retainVisibleRows(firstRow: number, rowCount: number): void {
    const start = Math.max(0, firstRow - 2)
    const end = firstRow + Math.max(0, rowCount) + 2
    for (const [key, uri] of [...this.cellUris]) {
      const row = Number(key.split(":")[1])
      if (!Number.isFinite(row) || row < start || row >= end) {
        this.releaseCell(uri, key)
      }
    }
  }

  clear(): void {
    this.cellUris.clear()
    for (const record of this.records.values()) record.unsubscribe()
    this.records.clear()
    if (this.ownsSourceCache) this.sourceCache.clear()
  }

  private releaseCell(uri: string, key: string): void {
    this.cellUris.delete(key)
    const record = this.records.get(uri)
    record?.cells.delete(key)
    if (record?.cells.size === 0) {
      record.unsubscribe()
      this.records.delete(uri)
    }
  }
}
