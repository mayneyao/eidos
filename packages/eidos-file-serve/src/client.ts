import type {
  EidosFileCsvImportOptions,
  EidosFileCsvImportPlan,
  EidosFileCsvImportResult,
  EidosFileSnapshot,
  RequestContext,
  RuntimeClient,
} from "@eidos.space/eidos-file"
import {
  EidosRuntimeEditorDataSource,
  type EidosFileEditorDataSource,
} from "@eidos.space/eidos-file-ui"

export interface CliHostManifest {
  mode: "cli"
  fileName: string
  access: "read" | "readwrite"
}

export interface EidosFileHttpOpenResult {
  snapshot: EidosFileSnapshot
  migrated: boolean
  recovered: boolean
  storage: "memory"
}

export interface EidosFileHttpExportResult {
  bytes: Uint8Array
  integrity: "ok"
}

interface HttpEnvelope {
  ok: boolean
  value?: unknown
  error?: { code?: string; message: string; retryable?: boolean }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

async function postJson(path: string, body: unknown): Promise<HttpEnvelope> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const envelope = (await response.json()) as HttpEnvelope
  if (!response.ok) {
    throw Object.assign(
      new Error(envelope.error?.message ?? `HTTP ${response.status}`),
      { code: envelope.error?.code ?? "http-error" }
    )
  }
  return envelope
}

function unwrap(envelope: HttpEnvelope): unknown {
  if (!envelope.ok) {
    throw Object.assign(
      new Error(envelope.error?.message ?? "The runtime call failed"),
      {
        code: envelope.error?.code ?? "unknown",
        retryable: envelope.error?.retryable === true,
      }
    )
  }
  return envelope.value
}

function sanitizeContext(context: RequestContext): RequestContext {
  return {
    requestId: context.requestId,
    ...(context.deadlineMilliseconds !== undefined
      ? { deadlineMilliseconds: context.deadlineMilliseconds }
      : {}),
  }
}

/**
 * RuntimeClient over the CLI's embedded QuickJS runtime HTTP bridge. Binary
 * payloads (CSV import/export) ride as base64; every other request/response
 * is already JSON-safe.
 */
export class HttpRuntimeClient implements RuntimeClient {
  async negotiate(
    request: { protocol: "eidos-runtime"; versions: ["1.0"] },
    context: RequestContext
  ) {
    return (await this.call("negotiate", request, context)) as Awaited<
      ReturnType<RuntimeClient["negotiate"]>
    >
  }

  async getSnapshot(
    request: { minimumRevision?: string },
    context: RequestContext
  ) {
    return (await this.call("getSnapshot", request, context)) as Awaited<
      ReturnType<RuntimeClient["getSnapshot"]>
    >
  }

  async getSchemaPage(
    request: Parameters<RuntimeClient["getSchemaPage"]>[0],
    context: RequestContext
  ) {
    return (await this.call("getSchemaPage", request, context)) as Awaited<
      ReturnType<RuntimeClient["getSchemaPage"]>
    >
  }

  async queryRows(
    request: Parameters<RuntimeClient["queryRows"]>[0],
    context: RequestContext
  ) {
    return (await this.call("queryRows", request, context)) as Awaited<
      ReturnType<RuntimeClient["queryRows"]>
    >
  }

  async getRowsById(
    request: Parameters<RuntimeClient["getRowsById"]>[0],
    context: RequestContext
  ) {
    return (await this.call("getRowsById", request, context)) as Awaited<
      ReturnType<RuntimeClient["getRowsById"]>
    >
  }

  async aggregate(
    request: Parameters<RuntimeClient["aggregate"]>[0],
    context: RequestContext
  ) {
    return (await this.call("aggregate", request, context)) as Awaited<
      ReturnType<RuntimeClient["aggregate"]>
    >
  }

  async groupRows(
    request: Parameters<RuntimeClient["groupRows"]>[0],
    context: RequestContext
  ) {
    return (await this.call("groupRows", request, context)) as Awaited<
      ReturnType<RuntimeClient["groupRows"]>
    >
  }

  async queryGroupRows(
    request: Parameters<RuntimeClient["queryGroupRows"]>[0],
    context: RequestContext
  ) {
    return (await this.call("queryGroupRows", request, context)) as Awaited<
      ReturnType<RuntimeClient["queryGroupRows"]>
    >
  }

  async previewFormula(
    request: Parameters<RuntimeClient["previewFormula"]>[0],
    context: RequestContext
  ) {
    return (await this.call("previewFormula", request, context)) as Awaited<
      ReturnType<RuntimeClient["previewFormula"]>
    >
  }

  async mutateRows(
    request: Parameters<RuntimeClient["mutateRows"]>[0],
    context: RequestContext
  ) {
    return (await this.call("mutateRows", request, context)) as Awaited<
      ReturnType<RuntimeClient["mutateRows"]>
    >
  }

  async revertMutation(
    request: { undoToken: string; expectedRevision: string },
    context: RequestContext
  ) {
    return (await this.call("revertMutation", request, context)) as Awaited<
      ReturnType<NonNullable<RuntimeClient["revertMutation"]>>
    >
  }

  async mutateView(
    request: Parameters<RuntimeClient["mutateView"]>[0],
    context: RequestContext
  ) {
    return (await this.call("mutateView", request, context)) as Awaited<
      ReturnType<RuntimeClient["mutateView"]>
    >
  }

  async preflightSchema(
    request: Parameters<RuntimeClient["preflightSchema"]>[0],
    context: RequestContext
  ) {
    return (await this.call("preflightSchema", request, context)) as Awaited<
      ReturnType<RuntimeClient["preflightSchema"]>
    >
  }

  async getSchemaPlanDependencies(
    request: { planToken: string; cursor?: string; limit: number },
    context: RequestContext
  ) {
    return (await this.call(
      "getSchemaPlanDependencies",
      request,
      context
    )) as Awaited<ReturnType<RuntimeClient["getSchemaPlanDependencies"]>>
  }

  async mutateSchema(
    request: Parameters<RuntimeClient["mutateSchema"]>[0],
    context: RequestContext
  ) {
    return (await this.call("mutateSchema", request, context)) as Awaited<
      ReturnType<RuntimeClient["mutateSchema"]>
    >
  }

  async validate(
    request: Parameters<RuntimeClient["validate"]>[0],
    context: RequestContext
  ) {
    return (await this.call("validate", request, context)) as Awaited<
      ReturnType<RuntimeClient["validate"]>
    >
  }

  async exportCsv(
    request: Parameters<NonNullable<RuntimeClient["exportCsv"]>>[0],
    context: RequestContext
  ) {
    const value = (await this.call("exportCsv", request, context)) as {
      csv: string
    } & Record<string, unknown>
    return {
      ...value,
      csv: base64ToBytes(value.csv),
    } as Awaited<ReturnType<NonNullable<RuntimeClient["exportCsv"]>>>
  }

  async importCsv(
    request: Parameters<NonNullable<RuntimeClient["importCsv"]>>[0],
    context: RequestContext
  ) {
    const wire = {
      ...request,
      csv: bytesToBase64(new Uint8Array(request.csv)),
    }
    return (await this.call("importCsv", wire, context)) as Awaited<
      ReturnType<NonNullable<RuntimeClient["importCsv"]>>
    >
  }

  async cancel(_request: { requestId: string }): Promise<void> {
    // The CLI runtime executes calls serially; there is nothing to interrupt.
  }

  async close(_context: RequestContext): Promise<void> {
    // Session lifecycle is owned by EidosFileHttpClient.close().
  }

  private async call(
    method: string,
    request: unknown,
    context: RequestContext
  ): Promise<unknown> {
    const envelope = await postJson("/api/runtime/call", {
      method,
      request,
      context: sanitizeContext(context),
    })
    return unwrap(envelope)
  }
}

/**
 * Editor session client over the CLI HTTP bridge. The server owns the .eidos
 * file; there is no browser file handle and no OPFS recovery copy.
 */
export class EidosFileHttpClient {
  readonly kind = "http" as const
  private editor: EidosRuntimeEditorDataSource | null = null
  private inFlightMutations = 0
  private terminated = false

  async openEditorSource(
    fileName: string,
    recoveryId: string,
    access: "read" | "readwrite" = "readwrite"
  ): Promise<EidosFileHttpOpenResult> {
    void recoveryId
    const envelope = await postJson("/api/runtime/open", { access })
    unwrap(envelope)
    const snapshot = await this.connectEditor(fileName)
    return { snapshot, migrated: false, recovered: false, storage: "memory" }
  }

  async openEditorRecovery(): Promise<never> {
    throw new Error("CLI-hosted sessions have no recovery working copy")
  }

  getSnapshot(...args: Parameters<EidosFileEditorDataSource["getSnapshot"]>) {
    return this.requireEditor().getSnapshot(...args)
  }

  getPage(...args: Parameters<EidosFileEditorDataSource["getPage"]>) {
    return this.requireEditor().getPage(...args)
  }

  getRow(
    ...args: Parameters<NonNullable<EidosFileEditorDataSource["getRow"]>>
  ) {
    return this.requireEditor().getRow(...args)
  }

  getGroupCounts(
    ...args: Parameters<
      NonNullable<EidosFileEditorDataSource["getGroupCounts"]>
    >
  ) {
    return this.requireEditor().getGroupCounts(...args)
  }

  calculateColumnStats(
    ...args: Parameters<EidosFileEditorDataSource["calculateColumnStats"]>
  ) {
    return this.requireEditor().calculateColumnStats(...args)
  }

  previewFormula(
    ...args: Parameters<
      NonNullable<EidosFileEditorDataSource["previewFormula"]>
    >
  ) {
    return this.requireEditor().previewFormula(...args)
  }

  insertRow(...args: Parameters<EidosFileEditorDataSource["insertRow"]>) {
    return this.trackMutation(() => this.requireEditor().insertRow(...args))
  }

  updateRow(...args: Parameters<EidosFileEditorDataSource["updateRow"]>) {
    return this.trackMutation(() => this.requireEditor().updateRow(...args))
  }

  deleteRowRanges(
    ...args: Parameters<EidosFileEditorDataSource["deleteRowRanges"]>
  ) {
    return this.trackMutation(() =>
      this.requireEditor().deleteRowRanges(...args)
    )
  }

  deleteRows(...args: Parameters<EidosFileEditorDataSource["deleteRows"]>) {
    return this.trackMutation(() => this.requireEditor().deleteRows(...args))
  }

  updateField(...args: Parameters<EidosFileEditorDataSource["updateField"]>) {
    return this.trackMutation(() => this.requireEditor().updateField(...args))
  }

  addField(...args: Parameters<EidosFileEditorDataSource["addField"]>) {
    return this.trackMutation(() => this.requireEditor().addField(...args))
  }

  deleteField(...args: Parameters<EidosFileEditorDataSource["deleteField"]>) {
    return this.trackMutation(() => this.requireEditor().deleteField(...args))
  }

  createTable(...args: Parameters<EidosFileEditorDataSource["createTable"]>) {
    return this.trackMutation(() => this.requireEditor().createTable(...args))
  }

  updateTable(...args: Parameters<EidosFileEditorDataSource["updateTable"]>) {
    return this.trackMutation(() => this.requireEditor().updateTable(...args))
  }

  deleteTable(...args: Parameters<EidosFileEditorDataSource["deleteTable"]>) {
    return this.trackMutation(() => this.requireEditor().deleteTable(...args))
  }

  reorderTables(
    ...args: Parameters<NonNullable<EidosFileEditorDataSource["reorderTables"]>>
  ) {
    return this.trackMutation(() => this.requireEditor().reorderTables(...args))
  }

  createView(...args: Parameters<EidosFileEditorDataSource["createView"]>) {
    return this.trackMutation(() => this.requireEditor().createView(...args))
  }

  duplicateView(
    ...args: Parameters<EidosFileEditorDataSource["duplicateView"]>
  ) {
    return this.trackMutation(() => this.requireEditor().duplicateView(...args))
  }

  deleteView(...args: Parameters<EidosFileEditorDataSource["deleteView"]>) {
    return this.trackMutation(() => this.requireEditor().deleteView(...args))
  }

  reorderViews(...args: Parameters<EidosFileEditorDataSource["reorderViews"]>) {
    return this.trackMutation(() => this.requireEditor().reorderViews(...args))
  }

  updateView(...args: Parameters<EidosFileEditorDataSource["updateView"]>) {
    return this.trackMutation(() => this.requireEditor().updateView(...args))
  }

  previewCsv(
    fileName: string,
    bytes: ArrayBuffer,
    options: EidosFileCsvImportOptions = {}
  ): Promise<EidosFileCsvImportPlan> {
    return this.requireEditor().previewCsv(fileName, bytes, options)
  }

  importCsv(
    fileName: string,
    bytes: ArrayBuffer,
    options: EidosFileCsvImportOptions = {}
  ): Promise<{
    snapshot: EidosFileSnapshot
    result: EidosFileCsvImportResult
  }> {
    return this.trackMutation(() =>
      this.requireEditor().importCsv(fileName, bytes, options)
    )
  }

  hasInFlightMutations(): boolean {
    return this.inFlightMutations > 0
  }

  async discardRecovery(_recoveryId: string): Promise<{ discarded: true }> {
    return { discarded: true }
  }

  async exportFile(
    _maxBytes = "268435456"
  ): Promise<EidosFileHttpExportResult> {
    const response = await fetch("/api/snapshot")
    if (!response.ok) {
      throw new Error(`Snapshot export failed with HTTP ${response.status}`)
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    return { bytes, integrity: "ok" }
  }

  /** Server-side save. Mutations are already durable; this is a checkpoint. */
  async save(): Promise<void> {
    const envelope = await postJson("/api/save", {})
    unwrap(envelope)
  }

  async close(): Promise<void> {
    if (this.terminated) return
    try {
      await postJson("/api/runtime/close", {})
    } finally {
      this.terminate()
    }
  }

  terminate(): void {
    this.terminated = true
    this.editor = null
  }

  private async connectEditor(path: string): Promise<EidosFileSnapshot> {
    const editor = new EidosRuntimeEditorDataSource(
      new HttpRuntimeClient(),
      path
    )
    this.editor = editor
    return editor.initialize()
  }

  private requireEditor(): EidosRuntimeEditorDataSource {
    if (this.terminated || !this.editor) {
      throw new Error("The Eidos File runtime session is closed")
    }
    return this.editor
  }

  private trackMutation<T>(operation: () => Promise<T>): Promise<T> {
    this.inFlightMutations += 1
    try {
      return operation().finally(() => {
        setTimeout(() => {
          this.inFlightMutations = Math.max(0, this.inFlightMutations - 1)
        }, 0)
      })
    } catch (error) {
      this.inFlightMutations -= 1
      throw error
    }
  }
}

export async function fetchCliHostManifest(): Promise<CliHostManifest | null> {
  try {
    const response = await fetch("/api/manifest")
    if (!response.ok) return null
    const manifest = (await response.json()) as Partial<CliHostManifest>
    if (manifest?.mode !== "cli" || typeof manifest.fileName !== "string") {
      return null
    }
    return manifest as CliHostManifest
  } catch {
    return null
  }
}
