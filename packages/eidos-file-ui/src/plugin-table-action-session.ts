import {
  canonicalizeEidosFileJson,
  type EidosFileActionRow,
  type EidosFileDataSource,
  type EidosFileRowQuery,
  type EidosFileRowRange,
  type LogicalValue,
} from "@eidos.space/eidos-file"

export const TABLE_ACTION_OUTPUT_SAMPLE_LIMIT = 4 * 1024 * 1024

/** Trusted per-run authority. Guest IDs and read tokens never select a table. */
export class TableActionSession {
  readonly controller = new AbortController()
  readonly undo: string[] = []
  readonly redo: string[] = []
  unchanged = 0
  readonly records = new Map<string, EidosFileActionRow>()
  ids: string[] = []
  outputsDeclared = false
  private outputFields = new Set<string>()
  private sampleValues = new Map<string, string>()
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
  async readRows(offset: number, limit: number, fields: string[]) {
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
    if (!this.outputsDeclared) throw new Error("Declare outputs before writing")
    if (this.writing)
      throw new Error("Concurrent action writes are not allowed")
    const row = this.records.get(readToken)
    if (!row || !this.source.writeTableActionRow)
      throw new Error("Invalid or expired read token")
    if (!values || typeof values !== "object" || Array.isArray(values))
      throw new Error("Invalid row output")
    if (Object.keys(values).some((id) => !this.outputFields.has(id)))
      throw new Error("Output field was not declared")
    const sample = this.sampleValues.get(row.id)
    if (sample !== undefined && canonicalizeEidosFileJson(values) !== sample)
      throw new Error("Output differs from the declared sample")
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
  declareOutputs(
    rows: Array<{ readToken: string; values: Record<string, LogicalValue> }>
  ) {
    if (
      new TextEncoder().encode(canonicalizeEidosFileJson(rows)).byteLength >
      TABLE_ACTION_OUTPUT_SAMPLE_LIMIT
    )
      throw new Error("Output samples are too large")
    const fields = Object.keys(rows[0]?.values ?? {}).sort()
    if (!fields.length || fields.length > 16)
      throw new Error("Invalid output sample fields")
    const sampleValues = new Map<string, string>()
    for (const row of rows) {
      const record = this.records.get(row.readToken)
      if (
        !record ||
        Object.keys(row.values).sort().join() !== fields.join() ||
        fields.some((id) => !(id in record.values))
      )
        throw new Error("Invalid output sample")
      if (sampleValues.has(record.id))
        throw new Error("Duplicate output sample record")
      sampleValues.set(record.id, canonicalizeEidosFileJson(row.values))
    }
    this.sampleValues = sampleValues
    this.outputFields = new Set(fields)
    this.outputsDeclared = true
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
