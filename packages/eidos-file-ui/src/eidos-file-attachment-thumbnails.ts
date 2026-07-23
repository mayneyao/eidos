import type { FileEntry } from "@eidos.space/eidos-file"

import type { AssetPresenter, EidosFileUIAssetSession } from "./context"
import {
  assertEidosFileAssetLease,
  eidosFileAssetRequestContext,
  eidosFileAssetResolutionAllowed,
  releaseEidosFileAssetLease,
} from "./eidos-file-asset-lease"

export interface EidosFileAttachmentThumbnailCell {
  cell: [number, number]
}

interface ThumbnailRecord {
  active: boolean
  cells: Set<string>
  entry: FileEntry
  expiryTimer?: ReturnType<typeof setTimeout>
  lease?: Awaited<
    ReturnType<EidosFileUIAssetSession["services"]["resolveAsset"]>
  >
  source?: CanvasImageSource
}

function cellKey(column: number, row: number): string {
  return `${column}:${row}`
}

function cellFromKey(key: string): EidosFileAttachmentThumbnailCell {
  const [column, row] = key.split(":").map(Number)
  return { cell: [column ?? 0, row ?? 0] }
}

/**
 * Keeps Host thumbnail leases only for rendered Grid rows. Canonical File URIs
 * never enter the Canvas loader; the injected presenter supplies the source.
 */
export class EidosFileAttachmentThumbnailManager {
  private readonly records = new Map<string, ThumbnailRecord>()
  private readonly cellEntries = new Map<string, Set<string>>()

  constructor(
    private readonly session: EidosFileUIAssetSession | undefined,
    private readonly presenter: AssetPresenter<unknown> | undefined,
    private readonly onCellsReady: (
      cells: EidosFileAttachmentThumbnailCell[]
    ) => void
  ) {}

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
        record = { active: true, cells: new Set(), entry }
        this.records.set(entry.id, record)
        void this.load(record)
      }
      record.cells.add(key)
      if (record.source) sources.push(record.source)
    }
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
    for (const record of this.records.values()) this.dispose(record)
    this.records.clear()
  }

  private replaceCellEntries(key: string, nextIds: Set<string>): void {
    const previous = this.cellEntries.get(key) ?? new Set<string>()
    for (const entryId of previous) {
      if (nextIds.has(entryId)) continue
      const record = this.records.get(entryId)
      record?.cells.delete(key)
      if (record && record.cells.size === 0) {
        this.records.delete(entryId)
        this.dispose(record)
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
        await releaseEidosFileAssetLease(this.session, lease)
        return
      }
      record.source = source
      const remaining = Date.parse(lease.expiresAt) - Date.now()
      record.expiryTimer = setTimeout(
        () => {
          const cells = [...record.cells].map(cellFromKey)
          this.records.delete(record.entry.id)
          this.dispose(record)
          if (cells.length > 0) this.onCellsReady(cells)
        },
        Math.min(remaining, 2_147_483_647)
      )
      this.onCellsReady([...record.cells].map(cellFromKey))
    } catch {
      if (lease) {
        await releaseEidosFileAssetLease(this.session, lease)
      }
      record.lease = undefined
      record.source = undefined
    }
  }

  private dispose(record: ThumbnailRecord): void {
    if (!record.active) return
    record.active = false
    if (record.expiryTimer) clearTimeout(record.expiryTimer)
    if (record.lease && this.session) {
      void releaseEidosFileAssetLease(this.session, record.lease)
    }
    record.lease = undefined
    record.source = undefined
    record.cells.clear()
  }
}
