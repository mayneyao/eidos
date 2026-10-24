export interface HistoryRow {
  path: string
  count: number
  lastOpenedAt: number
}
export class HistoryLedger {
  private rows = new Map<string, HistoryRow>()
  private ids = new Set<string>()
  private revision = 0
  private savedRevision = 0
  private saving: Promise<void> | undefined
  savedAt: number | null = null
  error: string | null = null
  constructor(private write: (rows: HistoryRow[]) => Promise<void>) {}
  record(event: { id: string; path: string; openedAt: number }) {
    if (this.ids.has(event.id)) return
    this.ids.add(event.id)
    if (this.ids.size > 4096) this.ids.delete(this.ids.values().next().value!)
    const row = this.rows.get(event.path)
    this.rows.set(event.path, {
      path: event.path,
      count: (row?.count ?? 0) + 1,
      lastOpenedAt: Math.max(row?.lastOpenedAt ?? 0, event.openedAt),
    })
    this.revision++
  }
  snapshot() {
    return [...this.rows.values()].map((row) => ({ ...row }))
  }
  get pending() {
    return this.revision - this.savedRevision
  }
  async flush(): Promise<void> {
    if (this.saving) {
      await this.saving
      return this.flush()
    }
    if (!this.pending) return
    const revision = this.revision
    const rows = this.snapshot()
    this.saving = this.write(rows)
      .then(() => {
        this.savedRevision = revision
        this.savedAt = Date.now()
        this.error = null
      })
      .catch((error: unknown) => {
        this.error = error instanceof Error ? error.message : String(error)
        throw error
      })
    try {
      await this.saving
    } finally {
      this.saving = undefined
    }
  }
}
export function mergeRows(groups: HistoryRow[][]): HistoryRow[] {
  const rows = new Map<string, HistoryRow>()
  for (const group of groups)
    for (const row of group) {
      const previous = rows.get(row.path)
      rows.set(row.path, {
        path: row.path,
        count: (previous?.count ?? 0) + row.count,
        lastOpenedAt: Math.max(previous?.lastOpenedAt ?? 0, row.lastOpenedAt),
      })
    }
  return [...rows.values()].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
}
export function readRows(value: unknown): HistoryRow[] {
  if (!Array.isArray(value)) throw new Error("Invalid saved history")
  return value.map((row: unknown) => {
    if (
      !row ||
      typeof row !== "object" ||
      !("path" in row) ||
      typeof row.path !== "string" ||
      !("count" in row) ||
      !Number.isSafeInteger(row.count) ||
      Number(row.count) < 1 ||
      !("lastOpenedAt" in row) ||
      typeof row.lastOpenedAt !== "number" ||
      !Number.isFinite(row.lastOpenedAt)
    )
      throw new Error("Invalid saved history")
    return {
      path: row.path,
      count: Number(row.count),
      lastOpenedAt: row.lastOpenedAt,
    }
  })
}
