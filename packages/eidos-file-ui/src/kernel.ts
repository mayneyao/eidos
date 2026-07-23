import {
  canonicalizeEidosFileJson,
  eidosFileUriClass,
  type AssetLease,
  type HostSaveResult,
  type HostLimits,
  type HostServiceCapabilities,
  type HostServices,
  type HostSessionState,
  type MutationResult,
  type GroupPage,
  type GroupRequest,
  type ProjectedRow,
  type ProjectionSpec,
  type QueryRowsRequest,
  type RowChange,
  type RowPage,
  type RowQuery,
  type RuntimeCapabilities,
  type RuntimeClient,
  type RuntimeLimits,
  type RuntimeSnapshot,
  type SchemaDescriptor,
  type TableDescriptor,
  type FieldDescriptor,
  type FileEntry,
  type ViewDescriptor,
} from "@eidos.space/eidos-file"

export const EIDOS_UI_PROTOCOL = Object.freeze({
  version: "1.0" as const,
  labels: ["EU-Viewer-1.0"] as const,
  runtimeVersions: ["1.0"] as const,
  hostVersions: ["1.0"] as const,
  trustedRenderers: true,
  isolatedRenderers: false,
})

export type EidosUIKernelPhase =
  | "idle"
  | "opening"
  | "ready"
  | "error"
  | "closed"

export interface EidosUISchemaIndex {
  objects: SchemaDescriptor[]
  tables: Map<string, TableDescriptor>
  fields: Map<string, FieldDescriptor>
  fieldsByTable: Map<string, FieldDescriptor[]>
  views: Map<string, ViewDescriptor>
  viewsByTable: Map<string, ViewDescriptor[]>
}

export interface EidosUIKernelState {
  phase: EidosUIKernelPhase
  hostServiceCapabilities: HostServiceCapabilities | null
  hostState: HostSessionState | null
  sessionId: string | null
  runtimeCapabilities: RuntimeCapabilities | null
  runtimeLimits: RuntimeLimits | null
  snapshot: RuntimeSnapshot | null
  schema: EidosUISchemaIndex | null
  error: unknown
}

export interface OpenEidosUISourceRequest {
  sourceToken: string
  access: "read" | "readwrite"
}

export interface EidosUIKernelOptions {
  /** A product may publish a lower bound than Runtime's negotiated maximum. */
  schemaObjectsMax?: number
  pageSizeMax?: number
  cachePagesMax?: number
  cacheProjectedCellsMax?: number
}

interface CachedRowPage {
  key: string
  page: RowPage
  projectedCells: number
}

interface ActiveRead {
  generation: number
  requestId: string
  cancel: () => void
}

const EMPTY_STATE: EidosUIKernelState = {
  phase: "idle",
  hostServiceCapabilities: null,
  hostState: null,
  sessionId: null,
  runtimeCapabilities: null,
  runtimeLimits: null,
  snapshot: null,
  schema: null,
  error: null,
}

/**
 * Portable Eidos UI 1.0 session kernel. It receives only RuntimeClient and
 * HostServices, owns no SQLite/File-format behavior, and invalidates every
 * generated cache on a revision or Runtime epoch change.
 */
export class EidosUIKernel {
  private state: EidosUIKernelState = EMPTY_STATE
  private runtime: RuntimeClient | null = null
  private hostUnsubscribe: (() => void) | null = null
  private runtimeUnsubscribe: (() => void) | null = null
  private listeners = new Set<() => void>()
  private requestSequence = 0
  private epochGeneration = 0
  private surfaceGenerations = new Map<string, number>()
  private activeReads = new Map<string, ActiveRead>()
  private pageCache: CachedRowPage[] = []
  private leases = new Map<string, AssetLease>()

  constructor(
    readonly host: HostServices,
    readonly options: EidosUIKernelOptions = {}
  ) {}

  getState = (): EidosUIKernelState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async negotiateHost(): Promise<void> {
    this.assertNotClosed()
    const descriptor = await this.host.negotiate(
      { protocol: "eidos-host", versions: ["1.0"] },
      this.context("host-negotiate")
    )
    if (descriptor.version !== "1.0") {
      throw new Error("Host protocol mismatch")
    }
    validateHostServiceCapabilities(descriptor.serviceCapabilities)
    validateHostLimits(descriptor.limits)
    this.setState({
      ...this.state,
      hostServiceCapabilities: descriptor.serviceCapabilities,
    })
  }

  async openSource(request: OpenEidosUISourceRequest): Promise<void> {
    this.assertNotClosed()
    await this.prepareForNewSession()
    const generation = ++this.epochGeneration
    let openedSessionId: string | null = null
    this.setState({
      ...EMPTY_STATE,
      phase: "opening",
      hostServiceCapabilities: this.state.hostServiceCapabilities,
    })
    try {
      if (!this.state.hostServiceCapabilities) await this.negotiateHost()
      const opened = await this.host.openSource(
        request,
        this.context("host-open")
      )
      openedSessionId = opened.sessionId
      if (generation !== this.epochGeneration) {
        await this.host.close(
          { sessionId: opened.sessionId },
          this.context("host-close-stale")
        )
        return
      }
      this.runtime = opened.runtime
      this.hostUnsubscribe = this.host.subscribe(
        opened.sessionId,
        (hostState) => {
          if (hostState.sessionId !== opened.sessionId) return
          this.onHostState(hostState)
        }
      )
      const bootstrapped = await this.bootstrapRuntime(
        opened.runtime,
        opened.sessionId,
        opened.state,
        generation
      )
      if (!bootstrapped) return
      this.setState({ ...this.state, phase: "ready", error: null })
    } catch (error) {
      if (generation !== this.epochGeneration) return
      await this.releaseSession(false)
      if (openedSessionId) {
        await this.host
          .close(
            { sessionId: openedSessionId },
            this.context("host-close-failed-open")
          )
          .catch(() => undefined)
      }
      this.setState({ ...this.state, phase: "error", error })
      throw error
    }
  }

  async createSource(request: {
    destinationToken: string
    title: string
  }): Promise<void> {
    this.assertNotClosed()
    await this.prepareForNewSession()
    const generation = ++this.epochGeneration
    let createdSessionId: string | null = null
    this.setState({
      ...EMPTY_STATE,
      phase: "opening",
      hostServiceCapabilities: this.state.hostServiceCapabilities,
    })
    try {
      if (!this.state.hostServiceCapabilities) await this.negotiateHost()
      const created = await this.host.createSource(
        request,
        this.context("host-create")
      )
      createdSessionId = created.sessionId
      if (generation !== this.epochGeneration) {
        await this.host.close(
          { sessionId: created.sessionId },
          this.context("host-close-stale")
        )
        return
      }
      this.runtime = created.runtime
      this.hostUnsubscribe = this.host.subscribe(created.sessionId, (state) =>
        this.onHostState(state)
      )
      if (
        await this.bootstrapRuntime(
          created.runtime,
          created.sessionId,
          created.state,
          generation
        )
      ) {
        this.setState({ ...this.state, phase: "ready", error: null })
      }
    } catch (error) {
      if (generation !== this.epochGeneration) return
      await this.releaseSession(false)
      if (createdSessionId) {
        await this.host
          .close(
            { sessionId: createdSessionId },
            this.context("host-close-failed-create")
          )
          .catch(() => undefined)
      }
      this.setState({ ...this.state, phase: "error", error })
      throw error
    }
  }

  async queryRows(
    surfaceId: string,
    request: QueryRowsRequest
  ): Promise<RowPage | null> {
    const runtime = this.requireRuntimeCapability("readRows")
    const snapshot = this.requireSnapshot()
    const limits = this.state.runtimeLimits!
    const maximum = Math.min(
      limits.pageSizeMax,
      this.options.pageSizeMax ?? limits.pageSizeMax
    )
    if (request.limit < 1 || request.limit > maximum) {
      throw new RangeError(
        "Row page limit exceeds the effective UI/Runtime limit"
      )
    }
    const generation = (this.surfaceGenerations.get(surfaceId) ?? 0) + 1
    this.surfaceGenerations.set(surfaceId, generation)
    const previous = this.activeReads.get(surfaceId)
    previous?.cancel()
    if (previous) void runtime.cancel({ requestId: previous.requestId })
    const cancellation = cancellationSignal()
    const requestId = this.nextRequestId(`rows-${surfaceId}`)
    const key = canonicalizeEidosFileJson({
      fileId: snapshot.fileId,
      revision: snapshot.revision,
      tableId: request.tableId,
      query: request.query,
      projection: request.projection,
      cursor: request.cursor ?? null,
      direction: request.direction ?? "forward",
      limit: request.limit,
    })
    const cached = this.pageCache.find((entry) => entry.key === key)
    if (cached) return cached.page
    this.activeReads.set(surfaceId, {
      generation,
      requestId,
      cancel: cancellation.abort,
    })
    try {
      const page = await runtime.queryRows(request, {
        requestId,
        deadlineMilliseconds: limits.foregroundTimeMsMax,
        signal: cancellation.signal,
      })
      if (
        this.surfaceGenerations.get(surfaceId) !== generation ||
        this.epochGeneration < 1
      ) {
        return null
      }
      validateRowPage(page, request, snapshot)
      this.cachePage(key, page)
      return page
    } finally {
      const active = this.activeReads.get(surfaceId)
      if (active?.generation === generation) this.activeReads.delete(surfaceId)
    }
  }

  async mutateRows(request: {
    tableId: string
    changes: RowChange[]
    returning?: ProjectionSpec
  }): Promise<MutationResult> {
    const runtime = this.requireRuntimeCapability("mutateRows")
    this.assertHostMutationAllowed()
    const snapshot = this.requireSnapshot()
    const result = await runtime.mutateRows(
      {
        ...request,
        expectedRevision: snapshot.revision,
      },
      this.context("mutate-rows")
    )
    this.acceptMutationResult(result, snapshot)
    return result
  }

  async groupRows(
    surfaceId: string,
    request: GroupRequest
  ): Promise<GroupPage | null> {
    const runtime = this.requireRuntimeCapability("groupRows")
    const snapshot = this.requireSnapshot()
    const limits = this.state.runtimeLimits!
    if (
      request.groupLimit < 1 ||
      request.groupLimit > limits.groupPageSizeMax ||
      request.rowsPerGroup < 1 ||
      request.rowsPerGroup > limits.pageSizeMax
    ) {
      throw new RangeError("Group request exceeds negotiated Runtime limits")
    }
    const generation = (this.surfaceGenerations.get(surfaceId) ?? 0) + 1
    this.surfaceGenerations.set(surfaceId, generation)
    const previous = this.activeReads.get(surfaceId)
    previous?.cancel()
    if (previous) void runtime.cancel({ requestId: previous.requestId })
    const cancellation = cancellationSignal()
    const requestId = this.nextRequestId(`groups-${surfaceId}`)
    this.activeReads.set(surfaceId, {
      generation,
      requestId,
      cancel: cancellation.abort,
    })
    try {
      const page = await runtime.groupRows(request, {
        requestId,
        deadlineMilliseconds: limits.foregroundTimeMsMax,
        signal: cancellation.signal,
      })
      if (this.surfaceGenerations.get(surfaceId) !== generation) return null
      if (
        page.fileId !== snapshot.fileId ||
        page.tableId !== request.tableId ||
        page.revision !== snapshot.revision ||
        page.columns.length !== request.projection.fields.length ||
        page.columns.some(
          (column, index) => column.fieldId !== request.projection.fields[index]
        ) ||
        page.groups.some((group) =>
          group.rows.some((row) => row.values.length !== page.columns.length)
        )
      ) {
        throw new Error("Runtime group page binding mismatch")
      }
      return page
    } finally {
      const active = this.activeReads.get(surfaceId)
      if (active?.generation === generation) this.activeReads.delete(surfaceId)
    }
  }

  async save(): Promise<HostSaveResult> {
    const sessionId = this.requireSession()
    if (!this.state.hostState?.capabilities.canWriteCurrent) {
      throw new Error("The Host cannot publish to the current source")
    }
    return this.host.save({ sessionId }, this.context("host-save"))
  }

  async requestWritePermission(): Promise<HostSessionState> {
    const sessionId = this.requireSession()
    if (!this.state.hostState?.capabilities.canRequestPermission) {
      throw new Error("The Host cannot request write permission")
    }
    const state = await this.host.requestWritePermission(
      { sessionId },
      this.context("host-permission")
    )
    this.onHostState(state)
    return state
  }

  async resolveAsset(
    entry: FileEntry,
    purpose: "thumbnail" | "preview" | "download"
  ): Promise<AssetLease> {
    const sessionId = this.requireSession()
    const hostState = this.state.hostState
    if (
      !hostState?.capabilities ||
      !this.state.hostServiceCapabilities?.canUseAssets
    ) {
      throw new Error("Asset resolution is unavailable")
    }
    const uriClass = eidosFileUriClass(entry.uri)
    const byteLimit =
      purpose === "download"
        ? hostState.limits.assetBytesMax
        : hostState.limits.assetPreviewBytesMax
    if (
      !uriClass ||
      !hostState.capabilities.assetReadSchemes.includes(uriClass) ||
      this.leases.size >= hostState.limits.concurrentAssetLeasesMax ||
      BigInt(byteLimit) === 0n ||
      BigInt(entry.size) > BigInt(byteLimit)
    ) {
      throw new Error("Asset lease limit reached")
    }
    const lease = await this.host.resolveAsset(
      { sessionId, entryId: entry.id, purpose },
      this.context("asset-resolve")
    )
    if (
      lease.entryId !== entry.id ||
      lease.purpose !== purpose ||
      lease.name !== entry.name ||
      lease.mediaType !== entry.mediaType ||
      lease.size !== entry.size ||
      lease.resourceToken.length === 0 ||
      BigInt(lease.size) > BigInt(byteLimit) ||
      !Number.isFinite(Date.parse(lease.expiresAt)) ||
      Date.parse(lease.expiresAt) <= Date.now() ||
      this.leases.has(lease.leaseId)
    ) {
      await this.host.releaseAsset(
        { sessionId, leaseId: lease.leaseId },
        this.context("asset-release-oversize")
      )
      throw new Error("Host returned an invalid asset lease")
    }
    this.leases.set(lease.leaseId, lease)
    return lease
  }

  async releaseAsset(leaseId: string): Promise<void> {
    const sessionId = this.requireSession()
    if (!this.leases.delete(leaseId)) return
    await this.host.releaseAsset(
      { sessionId, leaseId },
      this.context("asset-release")
    )
  }

  async refresh(): Promise<void> {
    const runtime = this.runtime
    const sessionId = this.requireSession()
    const hostState = this.state.hostState
    if (!runtime || !hostState) throw new Error("No Runtime session is open")
    const generation = ++this.epochGeneration
    if (
      await this.bootstrapRuntime(runtime, sessionId, hostState, generation)
    ) {
      this.setState({ ...this.state, phase: "ready", error: null })
    }
  }

  async close(options: { discardDirty?: boolean } = {}): Promise<void> {
    if (this.state.phase === "closed") return
    if (
      this.state.hostState?.phase === "ready-dirty" &&
      options.discardDirty !== true
    ) {
      throw new Error(
        "Dirty session requires explicit save, discard, or cancel"
      )
    }
    ++this.epochGeneration
    await this.releaseSession(true)
    this.setState({ ...EMPTY_STATE, phase: "closed" })
  }

  private async bootstrapRuntime(
    runtime: RuntimeClient,
    sessionId: string,
    hostState: HostSessionState,
    generation: number
  ): Promise<boolean> {
    validateHostState(hostState, sessionId)
    const negotiation = await runtime.negotiate(
      { protocol: "eidos-runtime", versions: ["1.0"] },
      this.context("runtime-negotiate")
    )
    validateRuntimeNegotiation(negotiation.capabilities, negotiation.limits)
    validateRuntimeOptionalMethods(runtime, negotiation.capabilities)
    if (generation !== this.epochGeneration) return false
    const snapshot = await runtime.getSnapshot({}, this.context("snapshot"))
    const schema = await this.loadSchema(
      runtime,
      snapshot,
      negotiation.limits,
      generation
    )
    if (generation !== this.epochGeneration) return false
    if (hostState.fileId && hostState.fileId !== snapshot.fileId) {
      throw new Error("Host/Runtime File ID mismatch")
    }
    this.invalidateGeneratedState()
    this.runtimeUnsubscribe?.()
    this.runtimeUnsubscribe =
      negotiation.capabilities.events && runtime.subscribe
        ? runtime.subscribe((event) => {
            if (event.fileId !== this.state.snapshot?.fileId) return
            if (event.revision !== this.state.snapshot.revision) {
              this.invalidateGeneratedState()
              void this.refresh().catch((error) =>
                this.setState({ ...this.state, phase: "error", error })
              )
            }
          })
        : null
    this.setState({
      phase: "opening",
      hostServiceCapabilities: this.state.hostServiceCapabilities,
      hostState,
      sessionId,
      runtimeCapabilities: negotiation.capabilities,
      runtimeLimits: negotiation.limits,
      snapshot,
      schema,
      error: null,
    })
    return true
  }

  private async loadSchema(
    runtime: RuntimeClient,
    snapshot: RuntimeSnapshot,
    limits: RuntimeLimits,
    generation: number
  ): Promise<EidosUISchemaIndex> {
    const objects: SchemaDescriptor[] = []
    const ids = new Set<string>()
    let cursor: string | undefined
    const objectLimit = this.options.schemaObjectsMax ?? Number.MAX_SAFE_INTEGER
    do {
      const page = await runtime.getSchemaPage(
        {
          revision: snapshot.revision,
          limit: Math.min(100, limits.schemaPageSizeMax),
          ...(cursor === undefined ? {} : { cursor }),
        },
        this.context("schema-page")
      )
      if (generation !== this.epochGeneration)
        throw new Error("Stale UI bootstrap")
      if (
        page.fileId !== snapshot.fileId ||
        page.revision !== snapshot.revision
      ) {
        throw new Error("Schema page snapshot binding mismatch")
      }
      for (const descriptor of page.objects) {
        const identity =
          descriptor.object === "feature"
            ? `feature:${descriptor.name}`
            : `${descriptor.object}:${descriptor.id}`
        if (ids.has(identity))
          throw new Error("Duplicate schema descriptor identity")
        ids.add(identity)
        objects.push(descriptor)
        if (objects.length > objectLimit) {
          throw new Error("Schema exceeds the published UI object limit")
        }
      }
      cursor = page.nextCursor ?? undefined
    } while (cursor !== undefined)
    validateSchemaCounts(snapshot, objects)
    validateSchemaDescriptors(objects)
    return indexSchema(objects)
  }

  private acceptMutationResult(
    result: MutationResult,
    previous: RuntimeSnapshot
  ): void {
    if (result.fileId !== previous.fileId)
      throw new Error("Mutation File ID mismatch")
    if (
      result.changed &&
      BigInt(result.revision) !== BigInt(previous.revision) + 1n
    ) {
      throw new Error("Mutation revision transition mismatch")
    }
    if (!result.changed && result.revision !== previous.revision) {
      throw new Error("No-op mutation changed revision")
    }
    if (result.changed) {
      this.invalidateGeneratedState()
      this.setState({
        ...this.state,
        snapshot: { ...previous, revision: result.revision },
        hostState: this.state.hostState
          ? {
              ...this.state.hostState,
              phase: "ready-dirty",
              revision: result.revision,
            }
          : null,
      })
    }
  }

  private onHostState(hostState: HostSessionState): void {
    if (hostState.sessionId !== this.state.sessionId) return
    if (hostState.phase === "commit-unknown") {
      this.runtime = null
      this.invalidateGeneratedState()
    }
    this.setState({ ...this.state, hostState })
  }

  private cachePage(key: string, page: RowPage): void {
    const projectedCells = page.rows.length * page.columns.length
    this.pageCache.unshift({ key, page, projectedCells })
    const pagesMax = this.options.cachePagesMax ?? 8
    const cellsMax = this.options.cacheProjectedCellsMax ?? 10_000
    let cells = 0
    this.pageCache = this.pageCache.filter((entry, index) => {
      cells += entry.projectedCells
      return index < pagesMax && cells <= cellsMax
    })
  }

  private invalidateGeneratedState(): void {
    for (const active of this.activeReads.values()) {
      active.cancel()
      void this.runtime?.cancel({ requestId: active.requestId })
    }
    this.activeReads.clear()
    this.pageCache = []
    this.surfaceGenerations.clear()
  }

  private async releaseSession(closeHost: boolean): Promise<void> {
    this.invalidateGeneratedState()
    this.hostUnsubscribe?.()
    this.hostUnsubscribe = null
    this.runtimeUnsubscribe?.()
    this.runtimeUnsubscribe = null
    const sessionId = this.state.sessionId
    if (sessionId) {
      for (const leaseId of Array.from(this.leases.keys())) {
        try {
          await this.host.releaseAsset(
            { sessionId, leaseId },
            this.context("asset-release-close")
          )
        } finally {
          this.leases.delete(leaseId)
        }
      }
      if (closeHost) {
        await this.host.close({ sessionId }, this.context("host-close"))
      }
    }
    this.runtime = null
  }

  private async prepareForNewSession(): Promise<void> {
    if (!this.state.sessionId) return
    if (this.state.hostState?.phase === "ready-dirty") {
      throw new Error(
        "Dirty session requires explicit save or discard before replacement"
      )
    }
    if (
      this.state.hostState?.phase === "publishing" ||
      this.state.hostState?.phase === "commit-unknown"
    ) {
      throw new Error("Host session must settle before replacement")
    }
    await this.releaseSession(true)
  }

  private requireRuntimeCapability(
    capability: keyof RuntimeCapabilities
  ): RuntimeClient {
    if (!this.runtime || !this.state.runtimeCapabilities?.[capability]) {
      throw new Error(`Runtime capability ${capability} is unavailable`)
    }
    return this.runtime
  }

  private requireSnapshot(): RuntimeSnapshot {
    if (!this.state.snapshot) throw new Error("No Runtime snapshot is active")
    return this.state.snapshot
  }

  private requireSession(): string {
    if (!this.state.sessionId) throw new Error("No Host session is active")
    return this.state.sessionId
  }

  private assertHostMutationAllowed(): void {
    const phase = this.state.hostState?.phase
    if (!phase || !["ready-clean", "ready-dirty"].includes(phase)) {
      throw new Error("Host session is not accepting canonical mutations")
    }
  }

  private assertNotClosed(): void {
    if (this.state.phase === "closed")
      throw new Error("Eidos UI kernel is closed")
  }

  private context(prefix: string) {
    return {
      requestId: this.nextRequestId(prefix),
      ...(this.state.runtimeLimits
        ? { deadlineMilliseconds: this.state.runtimeLimits.foregroundTimeMsMax }
        : {}),
    }
  }

  private nextRequestId(prefix: string): string {
    this.requestSequence += 1
    return `${prefix}-${this.requestSequence}`.slice(0, 128)
  }

  private setState(state: EidosUIKernelState): void {
    this.state = state
    for (const listener of this.listeners) listener()
  }
}

function indexSchema(objects: SchemaDescriptor[]): EidosUISchemaIndex {
  const tables = new Map<string, TableDescriptor>()
  const fields = new Map<string, FieldDescriptor>()
  const fieldsByTable = new Map<string, FieldDescriptor[]>()
  const views = new Map<string, ViewDescriptor>()
  const viewsByTable = new Map<string, ViewDescriptor[]>()
  for (const descriptor of objects) {
    if (descriptor.object === "table") tables.set(descriptor.id, descriptor)
    if (descriptor.object === "field") {
      fields.set(descriptor.id, descriptor)
      const entries = fieldsByTable.get(descriptor.tableId) ?? []
      entries.push(descriptor)
      fieldsByTable.set(descriptor.tableId, entries)
    }
    if (descriptor.object === "view") {
      views.set(descriptor.id, descriptor)
      const entries = viewsByTable.get(descriptor.tableId) ?? []
      entries.push(descriptor)
      viewsByTable.set(descriptor.tableId, entries)
    }
  }
  return { objects, tables, fields, fieldsByTable, views, viewsByTable }
}

function validateSchemaCounts(
  snapshot: RuntimeSnapshot,
  objects: SchemaDescriptor[]
): void {
  const actual = {
    tables: BigInt(objects.filter((item) => item.object === "table").length),
    fields: BigInt(objects.filter((item) => item.object === "field").length),
    views: BigInt(objects.filter((item) => item.object === "view").length),
    features: BigInt(
      objects.filter((item) => item.object === "feature").length
    ),
  }
  for (const key of Object.keys(actual) as Array<keyof typeof actual>) {
    if (actual[key] !== BigInt(snapshot.schemaCounts[key])) {
      throw new Error(`Schema ${key} count does not match Runtime snapshot`)
    }
  }
}

function validateSchemaDescriptors(objects: SchemaDescriptor[]): void {
  const rank = { feature: 0, table: 1, field: 2, view: 3 } as const
  for (let index = 1; index < objects.length; index += 1) {
    if (rank[objects[index - 1]!.object] > rank[objects[index]!.object]) {
      throw new Error("Runtime schema descriptor blocks are out of order")
    }
  }
  const features = objects.filter(
    (item): item is Extract<SchemaDescriptor, { object: "feature" }> =>
      item.object === "feature"
  )
  assertSameOrder(
    features,
    [...features].sort((a, b) => utf8Compare(a.name, b.name))
  )
  const tables = objects.filter(
    (item): item is TableDescriptor => item.object === "table"
  )
  assertSameOrder(tables, [...tables].sort(comparePositionAndId))
  const tableOrder = new Map(tables.map((table, index) => [table.id, index]))
  const fields = objects.filter(
    (item): item is FieldDescriptor => item.object === "field"
  )
  const views = objects.filter(
    (item): item is ViewDescriptor => item.object === "view"
  )
  for (const descriptor of [...fields, ...views]) {
    if (!tableOrder.has(descriptor.tableId)) {
      throw new Error("Schema descriptor references a missing Table")
    }
  }
  const ownedOrder = <T extends FieldDescriptor | ViewDescriptor>(
    left: T,
    right: T
  ) =>
    tableOrder.get(left.tableId)! - tableOrder.get(right.tableId)! ||
    comparePositionAndId(left, right)
  assertSameOrder(fields, [...fields].sort(ownedOrder))
  assertSameOrder(views, [...views].sort(ownedOrder))
  const fieldsById = new Map(fields.map((field) => [field.id, field]))
  for (const table of tables) {
    const label = fieldsById.get(table.labelFieldId)
    if (!label || label.tableId !== table.id) {
      throw new Error("Table Record Label Field binding is invalid")
    }
  }
}

function comparePositionAndId(
  left: { position: string; id: string },
  right: { position: string; id: string }
): number {
  let a: bigint
  let b: bigint
  try {
    a = BigInt(left.position)
    b = BigInt(right.position)
  } catch {
    throw new Error("Schema position is not an int64 decimal")
  }
  return a < b ? -1 : a > b ? 1 : utf8Compare(left.id, right.id)
}

function assertSameOrder<T>(actual: T[], expected: T[]): void {
  if (actual.some((entry, index) => entry !== expected[index])) {
    throw new Error("Runtime schema descriptors are out of canonical order")
  }
}

function utf8Compare(left: string, right: string): number {
  const a = new TextEncoder().encode(left)
  const b = new TextEncoder().encode(right)
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!
  }
  return a.length - b.length
}

function validateRuntimeNegotiation(
  capabilities: RuntimeCapabilities,
  limits: RuntimeLimits
): void {
  const capabilityKeys: Array<keyof RuntimeCapabilities> = [
    "readRows",
    "schemaPaging",
    "cursorPaging",
    "aggregate",
    "groupRows",
    "formulaPreview",
    "mutateRows",
    "mutationUndo",
    "mutateView",
    "schemaPreflight",
    "mutateSchema",
    "validate",
    "events",
    "csvExport",
    "csvImport",
  ]
  for (const key of capabilityKeys) {
    if (typeof capabilities[key] !== "boolean")
      throw new Error("Invalid Runtime capability descriptor")
  }
  const limitKeys: Array<keyof RuntimeLimits> = [
    "requestBytesMax",
    "responseBytesMax",
    "schemaPageSizeMax",
    "pageSizeMax",
    "projectionFieldsMax",
    "rowsByIdMax",
    "mutationRowsMax",
    "mutationCellsMax",
    "mutationBytesMax",
    "aggregateItemsMax",
    "groupPageSizeMax",
    "formulaPreviewRowsMax",
    "filterDepthMax",
    "filterNodesMax",
    "sortFieldsMax",
    "groupFieldsMax",
    "searchBytesMax",
    "listElementsMax",
    "logicalValueBytesMax",
    "jsonCellBytesMax",
    "formulaBytesMax",
    "formulaNodesMax",
    "formulaDepthMax",
    "diagnosticsMax",
    "foregroundTimeMsMax",
    "csvBytesMax",
    "schemaPlanEntriesMax",
    "schemaPlanBytesMax",
    "undoEntriesMax",
    "undoBytesMax",
  ]
  for (const key of limitKeys) {
    const value = limits[key]
    if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
      throw new Error("Invalid Runtime limit descriptor")
    }
  }
  for (const required of [
    "readRows",
    "schemaPaging",
    "cursorPaging",
    "aggregate",
    "groupRows",
    "validate",
  ] as const) {
    if (!capabilities[required]) {
      throw new Error(`EU-Viewer-1.0 requires Runtime capability ${required}`)
    }
  }
  if (
    (capabilities.cursorPaging ||
      capabilities.aggregate ||
      capabilities.groupRows ||
      capabilities.csvExport) &&
    !capabilities.readRows
  )
    throw new Error("Contradictory Runtime capability descriptor")
  if (capabilities.groupRows && !capabilities.cursorPaging) {
    throw new Error("groupRows requires cursorPaging")
  }
  if (
    (capabilities.mutationUndo || capabilities.csvImport) &&
    !capabilities.mutateRows
  ) {
    throw new Error("Mutation capability dependency is missing")
  }
  if (capabilities.mutateSchema && !capabilities.schemaPreflight) {
    throw new Error("mutateSchema requires schemaPreflight")
  }
}

function validateRuntimeOptionalMethods(
  runtime: RuntimeClient,
  capabilities: RuntimeCapabilities
): void {
  const bindings: Array<
    [
      keyof Pick<
        RuntimeCapabilities,
        "mutationUndo" | "events" | "csvExport" | "csvImport"
      >,
      "revertMutation" | "subscribe" | "exportCsv" | "importCsv",
    ]
  > = [
    ["mutationUndo", "revertMutation"],
    ["events", "subscribe"],
    ["csvExport", "exportCsv"],
    ["csvImport", "importCsv"],
  ]
  for (const [capability, method] of bindings) {
    if ((typeof runtime[method] === "function") !== capabilities[capability]) {
      throw new Error(
        `Runtime optional method ${method} does not match capability`
      )
    }
  }
}

function validateHostServiceCapabilities(
  capabilities: HostServiceCapabilities
): void {
  const keys: Array<keyof HostServiceCapabilities> = [
    "canOpenSource",
    "canCreateSource",
    "canRequestPermission",
    "canSaveCopy",
    "canReconcileCommit",
    "canResolveConflict",
    "canRecover",
    "canUseAssets",
  ]
  for (const key of keys) {
    if (typeof capabilities[key] !== "boolean") {
      throw new Error("Invalid Host capability descriptor")
    }
  }
  if (capabilities.canOpenSource !== true)
    throw new Error("EA-Host-1.0 must open sources")
}

function validateHostLimits(limits: HostLimits): void {
  for (const key of [
    "sourceBytesMax",
    "candidateBytesMax",
    "recoveryBytesMax",
    "assetBytesMax",
    "assetPreviewBytesMax",
  ] as const) {
    if (!/^(?:0|[1-9][0-9]*)$/.test(limits[key])) {
      throw new Error(`Invalid Host limit ${key}`)
    }
  }
  for (const key of [
    "recoveryEntriesMax",
    "recoveryRetentionSecondsMax",
    "concurrentAssetLeasesMax",
    "concurrentSessionsMax",
  ] as const) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 0) {
      throw new Error(`Invalid Host limit ${key}`)
    }
  }
  if (limits.concurrentSessionsMax < 1) {
    throw new Error("Host concurrentSessionsMax must be positive")
  }
}

function validateHostState(state: HostSessionState, sessionId: string): void {
  if (state.sessionId !== sessionId) throw new Error("Host session ID mismatch")
  validateHostLimits(state.limits)
  if (
    typeof state.capabilities.canWriteCurrent !== "boolean" ||
    typeof state.capabilities.canSaveCopy !== "boolean" ||
    typeof state.capabilities.canRequestPermission !== "boolean" ||
    typeof state.capabilities.hasRecovery !== "boolean" ||
    !Array.isArray(state.capabilities.assetReadSchemes) ||
    !Array.isArray(state.capabilities.assetWriteSchemes) ||
    !["strong", "cooperative", "none"].includes(
      state.capabilities.casGuarantee
    ) ||
    typeof state.capabilities.atomicReplace !== "boolean" ||
    !["durable", "best-effort"].includes(state.capabilities.durability)
  ) {
    throw new Error("Invalid Host session capability descriptor")
  }
  for (const schemes of [
    state.capabilities.assetReadSchemes,
    state.capabilities.assetWriteSchemes,
  ]) {
    if (
      new Set(schemes).size !== schemes.length ||
      schemes.some((scheme) => !["relative", "data", "https"].includes(scheme))
    ) {
      throw new Error("Invalid Host asset scheme descriptor")
    }
  }
}

function validateRowPage(
  page: RowPage,
  request: QueryRowsRequest,
  snapshot: RuntimeSnapshot
): void {
  if (
    page.fileId !== snapshot.fileId ||
    page.tableId !== request.tableId ||
    page.revision !== snapshot.revision ||
    page.columns.length !== request.projection.fields.length
  )
    throw new Error("Runtime row page binding mismatch")
  if (
    page.columns.some(
      (column, index) => column.fieldId !== request.projection.fields[index]
    ) ||
    page.rows.some((row) => row.values.length !== page.columns.length)
  )
    throw new Error("Runtime row page is not columnar")
}

function cancellationSignal(): {
  signal: {
    readonly aborted: boolean
    onAbort(callback: () => void): () => void
  }
  abort(): void
} {
  let aborted = false
  const listeners = new Set<() => void>()
  return {
    signal: {
      get aborted() {
        return aborted
      },
      onAbort(callback) {
        listeners.add(callback)
        return () => listeners.delete(callback)
      },
    },
    abort() {
      if (aborted) return
      aborted = true
      for (const listener of listeners) listener()
      listeners.clear()
    },
  }
}

/** Values are rendered without turning placeholders into canonical data. */
export function eidosUIPresentValue(
  value: ProjectedRow["values"][number]
): string {
  if (value === null) return "—"
  if (typeof value === "boolean") return value ? "✓" : ""
  if (typeof value === "number" || typeof value === "string")
    return String(value)
  if (Array.isArray(value)) return value.map(eidosUIPresentValue).join(", ")
  return String(value.name ?? "—")
}

export function eidosUIVisibleFields(
  table: TableDescriptor,
  fields: FieldDescriptor[],
  view?: ViewDescriptor
): FieldDescriptor[] {
  const layout = view?.layout ?? {}
  const hidden = new Set(
    Array.isArray(layout.hiddenFields)
      ? layout.hiddenFields.filter(
          (item): item is string => typeof item === "string"
        )
      : []
  )
  const order = Array.isArray(layout.fieldOrder)
    ? layout.fieldOrder.filter(
        (item): item is string => typeof item === "string"
      )
    : []
  const byId = new Map(fields.map((field) => [field.id, field]))
  const ordered = order.flatMap((id) => {
    const field = byId.get(id)
    return field && !hidden.has(id) ? [field] : []
  })
  const included = new Set(ordered.map((field) => field.id))
  const remaining = fields
    .filter((field) => !hidden.has(field.id) && !included.has(field.id))
    .sort((left, right) =>
      BigInt(left.position) < BigInt(right.position)
        ? -1
        : BigInt(left.position) > BigInt(right.position)
          ? 1
          : left.id.localeCompare(right.id)
    )
  const result = [...ordered, ...remaining]
  if (!result.some((field) => field.id === table.labelFieldId)) {
    const label = byId.get(table.labelFieldId)
    if (label) result.unshift(label)
  }
  return result
}

export function eidosUIViewQuery(
  view?: ViewDescriptor,
  search = "",
  searchFields: string[] = []
): RowQuery {
  const query: RowQuery = view?.query ? { ...view.query } : {}
  if (search !== "" && searchFields.length > 0) {
    query.search = { text: search, fields: searchFields }
  }
  return query
}
