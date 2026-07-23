import { createElement, type ReactNode } from "react"
import type {
  AggregateRequest,
  AssetLease,
  CsvExportRequest,
  CsvImportRequest,
  FormulaPreviewRequest,
  GetSchemaPageRequest,
  GroupRequest,
  GroupRowsRequest,
  HostCommitReconciliationResult,
  HostConflictResult,
  HostError,
  HostRecoveryReport,
  HostRecoveryResult,
  HostSaveCopyResult,
  HostSaveResult,
  HostServices,
  HostSessionState,
  ProjectionSpec,
  QueryRowsRequest,
  RequestContext,
  RowMutation,
  RuntimeClient,
  RuntimeEvent,
  SchemaMutationRequest,
  SchemaPreflightRequest,
  ValidationRequest,
  ViewMutationRequest,
} from "@eidos.space/eidos-file"
import type { AssetPresenter } from "@eidos.space/eidos-file-ui"

type RuntimeOperation = Exclude<
  keyof RuntimeClient,
  "cancel" | "close" | "subscribe"
>
const MUTATION_OPERATIONS = new Set<RuntimeOperation>([
  "mutateRows",
  "revertMutation",
  "mutateView",
  "mutateSchema",
  "importCsv",
])

interface OpenDesktopHostSession {
  sessionId: string
  state: HostSessionState
}

function api() {
  if (typeof window === "undefined" || !window.eidos?.eidosFileHost) {
    throw new Error("Desktop Eidos File Host is unavailable")
  }
  return window.eidos.eidosFileHost
}

class DesktopRuntimeClient implements RuntimeClient {
  declare revertMutation: RuntimeClient["revertMutation"]
  declare exportCsv: RuntimeClient["exportCsv"]
  declare importCsv: RuntimeClient["importCsv"]
  private closed = false

  constructor(
    readonly sessionId: string,
    private readonly onState: (state: HostSessionState) => void
  ) {
    this.revertMutation = (request, context) =>
      this.call("revertMutation", request, context)
    this.exportCsv = (request, context) =>
      this.call("exportCsv", request, context)
    this.importCsv = (request, context) =>
      this.call("importCsv", request, context)
  }

  negotiate(
    request: { protocol: "eidos-runtime"; versions: ["1.0"] },
    context: RequestContext
  ) {
    return this.call("negotiate", request, context)
  }

  getSnapshot(request: { minimumRevision?: string }, context: RequestContext) {
    return this.call("getSnapshot", request, context)
  }

  getSchemaPage(request: GetSchemaPageRequest, context: RequestContext) {
    return this.call("getSchemaPage", request, context)
  }

  queryRows(request: QueryRowsRequest, context: RequestContext) {
    return this.call("queryRows", request, context)
  }

  getRowsById(
    request: { tableId: string; rowIds: string[]; projection: ProjectionSpec },
    context: RequestContext
  ) {
    return this.call("getRowsById", request, context)
  }

  aggregate(request: AggregateRequest, context: RequestContext) {
    return this.call("aggregate", request, context)
  }

  groupRows(request: GroupRequest, context: RequestContext) {
    return this.call("groupRows", request, context)
  }

  queryGroupRows(request: GroupRowsRequest, context: RequestContext) {
    return this.call("queryGroupRows", request, context)
  }

  previewFormula(request: FormulaPreviewRequest, context: RequestContext) {
    return this.call("previewFormula", request, context)
  }

  mutateRows(request: RowMutation, context: RequestContext) {
    return this.call("mutateRows", request, context)
  }

  mutateView(request: ViewMutationRequest, context: RequestContext) {
    return this.call("mutateView", request, context)
  }

  preflightSchema(request: SchemaPreflightRequest, context: RequestContext) {
    return this.call("preflightSchema", request, context)
  }

  getSchemaPlanDependencies(
    request: { planToken: string; cursor?: string; limit: number },
    context: RequestContext
  ) {
    return this.call("getSchemaPlanDependencies", request, context)
  }

  mutateSchema(request: SchemaMutationRequest, context: RequestContext) {
    return this.call("mutateSchema", request, context)
  }

  validate(request: ValidationRequest, context: RequestContext) {
    return this.call("validate", request, context)
  }

  async cancel(request: { requestId: string }): Promise<void> {
    if (!this.closed) {
      await api().cancelRuntime(this.sessionId, request.requestId)
    }
  }

  async close(context: RequestContext): Promise<void> {
    if (this.closed) return
    this.closed = true
    await api().close(
      { sessionId: this.sessionId },
      serializableContext(context)
    )
  }

  subscribe(_listener: (event: RuntimeEvent) => void): () => void {
    return () => undefined
  }

  private async call<K extends RuntimeOperation>(
    operation: K,
    request: Parameters<NonNullable<RuntimeClient[K]>>[0],
    context: RequestContext
  ): Promise<Awaited<ReturnType<NonNullable<RuntimeClient[K]>>>> {
    if (this.closed) throw runtimeError("closed", "Runtime is closed")
    assertContext(context)
    const cancel = context.signal?.onAbort(() => {
      void api().cancelRuntime(this.sessionId, context.requestId)
    })
    try {
      const result = (await api().invokeRuntime(
        this.sessionId,
        operation,
        request,
        serializableContext(context)
      )) as Awaited<ReturnType<NonNullable<RuntimeClient[K]>>>
      if (MUTATION_OPERATIONS.has(operation)) await this.refreshState()
      return result
    } catch (error) {
      await this.refreshState().catch(() => undefined)
      throw error
    } finally {
      cancel?.()
    }
  }

  private async refreshState(): Promise<void> {
    this.onState(await api().getSessionState(this.sessionId))
  }
}

/** Renderer-side exact HostServices binding over the trusted Electron IPC. */
export class DesktopEidosFileHostServices implements HostServices {
  private readonly states = new Map<string, HostSessionState>()
  private readonly listeners = new Map<
    string,
    Set<(state: HostSessionState) => void>
  >()

  registerSource(spaceId: string, relativePath: string) {
    return api().registerSource(spaceId, relativePath)
  }

  registerDestination(spaceId: string, relativePath: string) {
    return api().registerDestination(spaceId, relativePath)
  }

  registerAssetSource(sessionId: string, relativePath: string) {
    return api().registerAssetSource(sessionId, relativePath)
  }

  revokeSource(sourceToken: string): Promise<void> {
    return api().revokeSource(sourceToken)
  }

  negotiate(
    request: { protocol: "eidos-host"; versions: ["1.0"] },
    context: RequestContext
  ) {
    return api().negotiate(request, serializableContext(context))
  }

  async openSource(
    request: { sourceToken: string; access: "read" | "readwrite" },
    context: RequestContext
  ) {
    const opened = (await api().openSource(
      request,
      serializableContext(context)
    )) as OpenDesktopHostSession
    this.setState(opened.sessionId, opened.state)
    return {
      sessionId: opened.sessionId,
      runtime: this.runtime(opened.sessionId),
      state: opened.state,
    }
  }

  async createSource(
    request: { destinationToken: string; title: string },
    context: RequestContext
  ) {
    const opened = (await api().createSource(
      request,
      serializableContext(context)
    )) as OpenDesktopHostSession
    this.setState(opened.sessionId, opened.state)
    return {
      sessionId: opened.sessionId,
      runtime: this.runtime(opened.sessionId),
      state: opened.state,
    }
  }

  async requestWritePermission(
    _request: { sessionId: string },
    context: RequestContext
  ): Promise<never> {
    assertContext(context)
    throw hostError(
      "unsupported",
      "Desktop Space grants are resolved before open"
    )
  }

  async save(
    request: { sessionId: string },
    context: RequestContext
  ): Promise<HostSaveResult> {
    try {
      const result = await api().save(request, serializableContext(context))
      this.setState(request.sessionId, result.state)
      return result
    } catch (error) {
      await this.refreshState(request.sessionId)
      throw error
    }
  }

  async saveCopy(
    _request: {
      sessionId: string
      destinationToken: string
      adopt: "keep-current" | "adopt-copy"
    },
    context: RequestContext
  ): Promise<HostSaveCopyResult> {
    assertContext(context)
    throw hostError(
      "unsupported",
      "Use the Space duplicate action to save a copy"
    )
  }

  async reconcileCommit(
    request: { sessionId: string },
    context: RequestContext
  ): Promise<HostCommitReconciliationResult> {
    const result = await api().reconcileCommit(
      request,
      serializableContext(context)
    )
    this.setState(request.sessionId, result.state)
    return {
      state: result.state,
      outcome: result.outcome,
      ...(result.runtimeReplaced
        ? { runtime: this.runtime(request.sessionId) }
        : {}),
      ...(result.reconciliation
        ? { reconciliation: result.reconciliation }
        : {}),
    }
  }

  async resolveConflict(
    request: {
      sessionId: string
      strategy: "reload" | "save-copy" | "merge"
      conflictToken: string
      destinationToken?: string
      adopt?: "keep-current" | "adopt-copy"
    },
    context: RequestContext
  ): Promise<HostConflictResult> {
    const result = await api().resolveConflict(
      {
        sessionId: request.sessionId,
        strategy: request.strategy,
        conflictToken: request.conflictToken,
      },
      serializableContext(context)
    )
    this.setState(request.sessionId, result.state)
    return {
      state: result.state,
      ...(result.runtimeReplaced
        ? { runtime: this.runtime(request.sessionId) }
        : {}),
    }
  }

  listRecovery(
    request: { sessionId: string },
    context: RequestContext
  ): Promise<HostRecoveryReport> {
    return api().listRecovery(request, serializableContext(context))
  }

  async restoreRecovery(
    _request: { sessionId: string; recoveryToken: string },
    context: RequestContext
  ): Promise<HostRecoveryResult> {
    assertContext(context)
    throw hostError("unsupported", "Desktop recovery is unavailable")
  }

  async discardRecovery(
    _request: { sessionId: string; recoveryToken: string },
    context: RequestContext
  ): Promise<HostRecoveryResult> {
    assertContext(context)
    throw hostError("unsupported", "Desktop recovery is unavailable")
  }

  async acquireAsset(
    request: { sessionId: string; sourceToken: string },
    context: RequestContext
  ) {
    return api().acquireAsset(request, serializableContext(context))
  }

  async resolveAsset(
    request: {
      sessionId: string
      entryId: string
      purpose: "thumbnail" | "preview" | "download"
    },
    context: RequestContext
  ): Promise<AssetLease> {
    return api().resolveAsset(request, serializableContext(context))
  }

  async releaseAsset(
    request: { sessionId: string; leaseId: string },
    context: RequestContext
  ): Promise<void> {
    await api().releaseAsset(request, serializableContext(context))
  }

  async close(
    request: { sessionId: string },
    context: RequestContext
  ): Promise<void> {
    await api().close(request, serializableContext(context))
    const state = this.states.get(request.sessionId)
    if (state) this.setState(request.sessionId, { ...state, phase: "closed" })
    this.states.delete(request.sessionId)
    this.listeners.delete(request.sessionId)
  }

  subscribe(
    sessionId: string,
    listener: (state: HostSessionState) => void
  ): () => void {
    if (!this.states.has(sessionId)) {
      throw hostError("closed", "Host session is closed")
    }
    const listeners = this.listeners.get(sessionId) ?? new Set()
    listeners.add(listener)
    this.listeners.set(sessionId, listeners)
    return () => listeners.delete(listener)
  }

  getState(sessionId: string): HostSessionState {
    const state = this.states.get(sessionId)
    if (!state) throw hostError("closed", "Host session is closed")
    return state
  }

  private setState(sessionId: string, state: HostSessionState): void {
    this.states.set(sessionId, state)
    for (const listener of this.listeners.get(sessionId) ?? []) listener(state)
  }

  private runtime(sessionId: string): DesktopRuntimeClient {
    return new DesktopRuntimeClient(sessionId, (state) =>
      this.setState(sessionId, state)
    )
  }

  private async refreshState(sessionId: string): Promise<void> {
    this.setState(sessionId, await api().getSessionState(sessionId))
  }
}

export const desktopEidosFileHost = new DesktopEidosFileHostServices()

function loadDesktopAssetImage(
  resourceToken: string,
  altText: string
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.alt = altText
    image.decoding = "async"
    image.draggable = false
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Asset image could not be decoded"))
    image.src = resourceToken
  })
}

/** Electron presentation binding; reusable UI never interprets the token. */
export const desktopEidosFileAssetPresenter: AssetPresenter<ReactNode> = {
  renderImage: ({ lease, altText }) =>
    createElement("img", {
      src: lease.resourceToken,
      alt: altText,
      draggable: false,
      decoding: "async",
    }),
  loadImage: ({ lease, altText }) =>
    loadDesktopAssetImage(lease.resourceToken, altText),
  activate: async ({ sessionId, lease, action }, context) => {
    await api().activateAsset(
      { sessionId, leaseId: lease.leaseId, action },
      serializableContext(context)
    )
  },
}

function serializableContext(context: RequestContext) {
  assertContext(context)
  return {
    requestId: context.requestId,
    ...(context.deadlineMilliseconds === undefined
      ? {}
      : { deadlineMilliseconds: context.deadlineMilliseconds }),
  }
}

function assertContext(context: RequestContext): void {
  if (!context || typeof context.requestId !== "string" || !context.requestId) {
    throw runtimeError("invalid-request", "Request context is invalid")
  }
  if (context.signal?.aborted) {
    throw runtimeError("cancelled", "Request was cancelled")
  }
}

function runtimeError(code: string, message: string): Error {
  return Object.assign(new Error(message), {
    name: "EidosRuntimeError",
    code,
    retryable: false,
  })
}

function hostError(code: HostError["code"], message: string): Error {
  return Object.assign(new Error(message), {
    name: "EidosHostError",
    code,
    retryable: false,
  })
}
