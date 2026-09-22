import {
  canonicalizeEidosFileJson,
  type EidosFileActionRow,
  type EidosFileDataSource,
  type EidosFileRowQuery,
  type EidosFileRowRange,
  type LogicalValue,
} from "@eidos.space/eidos-file"

/** Trusted per-run authority. Guest IDs and read tokens never select a table. */
export class TableActionSession {
  readonly controller = new AbortController()
  readonly undo: string[] = []
  readonly redo: string[] = []
  unchanged = 0
  readonly records = new Map<string, EidosFileActionRow>()
  ids: string[] = []
  approved = false
  private outputFields = new Set<string>()
  private previewValues = new Map<string, string>()
  private inFlight: Promise<unknown> | null = null
  private writing = false
  private disposed = false
  constructor(
    readonly source: EidosFileDataSource,
    readonly tableId: string
  ) {}
  async capture(
    query: EidosFileRowQuery,
    ranges: readonly EidosFileRowRange[] | null
  ) {
    if (!this.source.captureTableActionTarget)
      throw new Error("This host does not support table actions")
    this.ids = await this.source.captureTableActionTarget(
      this.tableId,
      query,
      ranges,
      this.controller.signal
    )
  }
  async read(offset: number, limit: number, fields: string[]) {
    this.controller.signal.throwIfAborted()
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Array.isArray(fields) ||
      fields.some((id) => typeof id !== "string")
    )
      throw new Error("Invalid target page")
    if (!this.source.readTableActionRows)
      throw new Error("Action reads unavailable")
    const rows = await this.source.readTableActionRows(
      this.tableId,
      this.ids.slice(offset, offset + limit),
      fields
    )
    this.controller.signal.throwIfAborted()
    return rows.map((row) => {
      const readToken = crypto.randomUUID()
      if (this.records.size >= 1000)
        this.records.delete(this.records.keys().next().value!)
      this.records.set(readToken, row)
      return { id: row.id, values: row.values, readToken }
    })
  }
  async update(readToken: string, values: Record<string, LogicalValue>) {
    this.controller.signal.throwIfAborted()
    if (!this.approved) throw new Error("Approve the preview before writing")
    if (this.writing)
      throw new Error("Concurrent action writes are not allowed")
    const row = this.records.get(readToken)
    if (!row || !this.source.writeTableActionRow)
      throw new Error("Invalid or expired read token")
    if (!values || typeof values !== "object" || Array.isArray(values))
      throw new Error("Invalid row output")
    if (Object.keys(values).some((id) => !this.outputFields.has(id)))
      throw new Error("Output field was not approved in the preview")
    const preview = this.previewValues.get(row.id)
    if (preview !== undefined && canonicalizeEidosFileJson(values) !== preview)
      throw new Error("Output differs from the approved preview")
    this.writing = true
    try {
      const operation = this.source.writeTableActionRow(
        this.tableId,
        row,
        values,
        this.controller.signal
      )
      this.inFlight = operation
      const result = await operation
      if (result.undoToken) this.undo.push(result.undoToken)
      else this.unchanged++
      this.records.delete(readToken)
    } finally {
      this.writing = false
      this.inFlight = null
    }
  }
  approve(
    rows: Array<{ readToken: string; values: Record<string, LogicalValue> }>
  ) {
    if (canonicalizeEidosFileJson(rows).length > 65536)
      throw new Error("Preview is too large")
    const fields = Object.keys(rows[0]?.values ?? {}).sort()
    if (!fields.length || fields.length > 16)
      throw new Error("Invalid preview output fields")
    const previewValues = new Map<string, string>()
    for (const row of rows) {
      const record = this.records.get(row.readToken)
      if (
        !record ||
        Object.keys(row.values).sort().join() !== fields.join() ||
        fields.some((id) => !(id in record.values))
      )
        throw new Error("Invalid preview output")
      if (previewValues.has(record.id))
        throw new Error("Duplicate preview record")
      previewValues.set(record.id, canonicalizeEidosFileJson(row.values))
    }
    this.previewValues = previewValues
    this.outputFields = new Set(fields)
    this.approved = true
  }
  async settled() {
    await this.inFlight?.catch(() => {})
  }
  dispose() {
    this.disposed = true
    this.cancel()
    void this.settled().then(() => {
      this.source.releaseTableActionUndo?.([...this.undo, ...this.redo])
      this.undo.length = 0
      this.redo.length = 0
    })
  }
  cancel() {
    this.controller.abort()
  }
  async revert(direction: "undo" | "redo" = "undo") {
    if (!this.source.undoTableActionRow) throw new Error("Undo is unavailable")
    if (this.writing || this.disposed)
      throw new Error("Action is busy or closed")
    this.writing = true
    const operation = this.replay(direction)
    this.inFlight = operation
    try {
      await operation
    } finally {
      this.writing = false
      this.inFlight = null
    }
  }
  private async replay(direction: "undo" | "redo") {
    await this.source.getSnapshot()
    const from = direction === "undo" ? this.undo : this.redo
    const to = direction === "undo" ? this.redo : this.undo
    while (from.length && !this.disposed) {
      const result = await this.source.undoTableActionRow!(from.at(-1)!)
      from.pop()
      if (result.undoToken) to.push(result.undoToken)
    }
  }
}
