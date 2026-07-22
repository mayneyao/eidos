import type { ConnectionPort, SqlValue } from "./adapter-contract"
import type { EidosFileSqlPrimitive } from "./connection"
import { canonicalizeEidosFileJson } from "./canonical-json"
import {
  planCanonicalFieldConversion,
  type CanonicalConversionPlan,
} from "./canonical-conversion"
import { ConnectionPortEidosFileConnection } from "./connection-port"
import { EidosFileError, type EidosFileErrorCode } from "./errors"
import { smallestDependencyCycle } from "./dependency-graph"
import {
  compileEidosFileFormulaFields,
  rewriteEidosFileFormulaFieldReferences,
} from "./formula"
import {
  assertEidosFileDisplayName,
  assertEidosFileUuid,
  EidosUuidV7Generator,
} from "./identifiers"
import { assertEidosFileValues } from "./file-values"
import {
  eidosFileLookupAggregateSupportsTarget,
  eidosFileLookupDisplayType,
  eidosFileLookupValueType,
} from "./lookup"
import type {
  CreateEidosFileFieldInput,
  EidosFileFieldInfo,
  EidosFileFilterOperator,
  EidosFileFilterValue,
  EidosFileFilterGroup,
  EidosFileLookupAggregate,
  EidosFileLogicalRow,
} from "./types"
import { EidosFileRuntime } from "./runtime"
import type {
  AggregateItem,
  AggregateRequest,
  AggregateResponse,
  AtomicType,
  ColumnDescriptor,
  ColumnStatistics,
  CommitReconciliation,
  CreatedSchemaObject,
  FieldDescriptor,
  FileEntry,
  FilterNode,
  FormulaDefinition,
  FormulaPreviewRequest,
  FormulaPreviewResult,
  FormulaResultType,
  GetSchemaPageRequest,
  GroupPage,
  GroupRequest,
  GroupRowPage,
  GroupRowsRequest,
  JsonObject,
  JsonValue,
  LogicalValue,
  LookupDefinition,
  MutationResult,
  NewField,
  ProjectedRow,
  ProjectionSpec,
  QueryRowsRequest,
  RelationDefinition,
  RequestContext,
  RowBatch,
  RowMutation,
  RowPage,
  RowQuery,
  RuntimeBinding,
  RuntimeCapabilities,
  RuntimeClient,
  RuntimeCreateInput,
  RuntimeDiagnostic,
  RuntimeEnvironment,
  RuntimeError,
  RuntimeErrorCode,
  RuntimeFactoryContext,
  RuntimeHostBridge,
  RuntimeLimits,
  RuntimeSnapshot,
  SavedViewQuery,
  SchemaChange,
  SchemaDescriptor,
  SchemaLeafChange,
  SchemaMutationRequest,
  SchemaMutationResult,
  SchemaPreflightRequest,
  SchemaPreflightResult,
  SchemaDependencyPage,
  StoredFieldType,
  TypeRef,
  ValidationReport,
  ValidationRequest,
  ViewMutationRequest,
  ViewMutationResult,
} from "./runtime-contract"
import { initializeEidosFileSchema } from "./schema"
import {
  isCanonicalEidosFileDate,
  isCanonicalEidosFileInstant,
} from "./temporal"
import { cancellationPortFromSignal } from "./protocol-types"
import { validateEidosFile } from "./validation"

export const EIDOS_RUNTIME_LIMITS: RuntimeLimits = Object.freeze({
  requestBytesMax: 8 * 1024 * 1024,
  responseBytesMax: 16 * 1024 * 1024,
  schemaPageSizeMax: 1_000,
  pageSizeMax: 1_000,
  projectionFieldsMax: 256,
  rowsByIdMax: 1_000,
  mutationRowsMax: 500,
  mutationCellsMax: 25_000,
  mutationBytesMax: 8 * 1024 * 1024,
  aggregateItemsMax: 128,
  groupPageSizeMax: 256,
  formulaPreviewRowsMax: 100,
  filterDepthMax: 8,
  filterNodesMax: 100,
  sortFieldsMax: 32,
  groupFieldsMax: 8,
  searchBytesMax: 4_096,
  listElementsMax: 10_000,
  logicalValueBytesMax: 1_048_576,
  jsonCellBytesMax: 1_048_576,
  formulaBytesMax: 4_096,
  formulaNodesMax: 10_000,
  formulaDepthMax: 256,
  diagnosticsMax: 1_000,
  foregroundTimeMsMax: 30_000,
  csvBytesMax: 16 * 1024 * 1024,
  schemaPlanEntriesMax: 64,
  schemaPlanBytesMax: 8 * 1024 * 1024,
  undoEntriesMax: 1,
  undoBytesMax: 1,
})

const READONLY_CAPABILITIES: RuntimeCapabilities = Object.freeze({
  readRows: true,
  schemaPaging: true,
  cursorPaging: true,
  aggregate: true,
  groupRows: true,
  formulaPreview: true,
  mutateRows: false,
  mutationUndo: false,
  mutateView: false,
  schemaPreflight: false,
  mutateSchema: false,
  validate: true,
  events: false,
  csvExport: false,
  csvImport: false,
})

function runtimeCapabilities(writable: boolean): RuntimeCapabilities {
  return {
    ...READONLY_CAPABILITIES,
    mutateRows: writable,
    mutateView: writable,
    schemaPreflight: writable,
    mutateSchema: writable,
  }
}

export class Runtime {
  static async open(
    connection: ConnectionPort,
    environment: RuntimeEnvironment,
    mode: "read" | "readwrite",
    context: RuntimeFactoryContext
  ): Promise<RuntimeBinding> {
    assertFactoryContext(context, environment)
    assertConnectionCapabilities(connection)
    if (mode === "readwrite" && !connection.capabilities().snapshot) {
      throw runtimeError(
        "adapter-error",
        "Adapter snapshot capability is required"
      )
    }
    const bridge = new ConnectionPortEidosFileConnection(connection)
    const validation = connection.transaction("read", () =>
      validateEidosFile(bridge, {
        level: mode === "readwrite" ? "structural" : "identity",
      })
    )
    if (!validation.valid) {
      throw runtimeError(
        "corrupt-file",
        validation.errors.map((issue) => issue.message).join("; ") ||
          "Eidos File validation failed"
      )
    }
    return createRuntimeBinding(connection, environment, mode)
  }

  static async create(
    connection: ConnectionPort,
    environment: RuntimeEnvironment,
    createInput: RuntimeCreateInput,
    context: RuntimeFactoryContext
  ): Promise<RuntimeBinding> {
    assertFactoryContext(context, environment)
    assertConnectionCapabilities(connection)
    assertEidosFileDisplayName(createInput.title, "File title")
    if (
      createInput.createdAt !== undefined &&
      !isCanonicalEidosFileInstant(createInput.createdAt)
    ) {
      throw runtimeError(
        "invalid-request",
        "createdAt must be a canonical millisecond UTC instant",
        { path: "/createdAt" }
      )
    }
    if (createInput.fileId !== undefined) {
      try {
        assertEidosFileUuid(createInput.fileId, "File ID")
      } catch {
        throw runtimeError("invalid-request", "fileId must be UUIDv7", {
          path: "/fileId",
        })
      }
    }
    const generator = uuidGenerator(environment)
    const createdAt = createInput.createdAt ?? checkedNowInstant(environment)
    const fileId = createInput.fileId ?? generator.next()
    const bridge = new ConnectionPortEidosFileConnection(connection)
    connection.transaction("write", () => {
      const objects = connection.query(
        "SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'"
      )
      if (objects.rows.length !== 0) {
        throw runtimeError(
          "invalid-request",
          "Runtime.create requires an empty database"
        )
      }
      initializeEidosFileSchema(
        bridge,
        { fileId, title: createInput.title, createdAt },
        false
      )
      const validation = validateEidosFile(bridge, { level: "structural" })
      if (!validation.valid) {
        throw runtimeError(
          "corrupt-file",
          validation.errors.map((issue) => issue.message).join("; ")
        )
      }
    })
    return createRuntimeBinding(connection, environment, "readwrite", generator)
  }
}

function createRuntimeBinding(
  connection: ConnectionPort,
  environment: RuntimeEnvironment,
  mode: "read" | "readwrite",
  generator = uuidGenerator(environment)
): RuntimeBinding {
  const compatibility = new ConnectionPortEidosFileConnection(connection)
  const core = new EidosFileRuntime(compatibility, false, {
    nowInstant: () => checkedNowInstant(environment),
    allocateId: () => generator.next(),
  })
  const service = new EidosRuntimeService(
    connection,
    core,
    environment,
    mode === "readwrite",
    generator
  )
  return {
    service,
    hostBridge: service.hostBridge,
  }
}

interface RequestControl {
  cancelled: boolean
  unsubscribe: () => void
}

interface RetainedSchemaPlan {
  token: string
  change: SchemaChange
  actionsHash: string
  baseRevision: string
  classification: SchemaPreflightResult["classification"]
  dependencies: SchemaPreflightResult["dependencies"]
  warnings: RuntimeDiagnostic[]
  affectedRows: string
  valueChanges: SchemaPreflightResult["valueChanges"]
  createdAtSequence: number
  expiresAtMonotonic: number
  expiresAt: string
}

export class EidosRuntimeService implements RuntimeClient {
  readonly hostBridge: RuntimeHostBridge
  private readonly capabilitiesValue: RuntimeCapabilities
  private readonly epoch: string
  private readonly cursorSecret: Uint8Array
  private readonly requestControls = new Map<string, RequestControl>()
  private readonly schemaPlans = new Map<string, RetainedSchemaPlan>()
  private schemaPlanSequence = 0
  private queue: Promise<void> = Promise.resolve()
  private state: "open" | "closing" | "closed" | "fatal" = "open"

  constructor(
    private readonly connection: ConnectionPort,
    private readonly core: EidosFileRuntime,
    private readonly environment: RuntimeEnvironment,
    private readonly writable: boolean,
    private readonly generator: EidosUuidV7Generator
  ) {
    this.capabilitiesValue = runtimeCapabilities(writable)
    this.epoch = generator.next()
    this.cursorSecret = environment.entropy.randomBytes(16).slice()
    if (this.cursorSecret.byteLength !== 16) {
      throw runtimeError(
        "adapter-error",
        "EntropyPort returned an invalid cursor authentication key"
      )
    }
    this.hostBridge = {
      allocateFileEntry: (request, context) =>
        this.invoke(
          context,
          () => this.allocateFileEntry(request),
          false,
          request
        ),
      createPublicationSnapshot: (request, context) =>
        this.invoke(
          context,
          async () => {
            const maximum = parseRevision(request.maxBytes, "maxBytes")
            if (maximum < 0n) {
              throw runtimeError(
                "invalid-request",
                "maxBytes must be non-negative"
              )
            }
            return this.connection.transaction("read", async () => {
              const identity = this.connection.get(
                "SELECT file_id, revision FROM eidos__meta WHERE singleton=1"
              )
              if (!identity.row) {
                throw runtimeError(
                  "corrupt-file",
                  "Missing Eidos File identity"
                )
              }
              const fileId = taggedText(identity.row[0])
              const revision = taggedInteger(identity.row[1])
              const snapshot = await this.connection.snapshot({
                cancellation: cancellationPortFromSignal(context.signal),
                ...(context.deadlineMilliseconds === undefined
                  ? {}
                  : { deadlineMilliseconds: context.deadlineMilliseconds }),
                maxBytes: request.maxBytes,
              })
              return {
                fileId,
                revision,
                bytes: snapshot.bytes,
                release: snapshot.release,
              }
            })
          },
          false,
          request,
          false
        ),
    }
  }

  negotiate(
    request: { protocol: "eidos-runtime"; versions: ["1.0"] },
    context: RequestContext
  ) {
    return this.invoke(
      context,
      () => {
        if (
          request.protocol !== "eidos-runtime" ||
          !Array.isArray(request.versions) ||
          request.versions.length !== 1 ||
          request.versions[0] !== "1.0"
        ) {
          throw runtimeError("unsupported", "Eidos Runtime 1.0 is required")
        }
        return {
          version: "1.0" as const,
          capabilities: { ...this.capabilitiesValue },
          limits: { ...EIDOS_RUNTIME_LIMITS },
        }
      },
      false,
      request
    )
  }

  getSnapshot(
    request: { minimumRevision?: string },
    context: RequestContext
  ): Promise<RuntimeSnapshot> {
    return this.invoke(
      context,
      () => this.snapshotAtMinimumRevision(request.minimumRevision, context),
      false,
      request
    )
  }

  private async snapshotAtMinimumRevision(
    minimumRevision: string | undefined,
    context: RequestContext
  ): Promise<RuntimeSnapshot> {
    const target =
      minimumRevision === undefined
        ? null
        : parseRevision(minimumRevision, "minimumRevision")
    const startedAt = this.environment.clock.nowMilliseconds()
    const budget = Math.min(
      context.deadlineMilliseconds ?? EIDOS_RUNTIME_LIMITS.foregroundTimeMsMax,
      EIDOS_RUNTIME_LIMITS.foregroundTimeMsMax
    )
    let current = this.read(() => this.snapshot())
    while (target !== null && BigInt(current.revision) < target) {
      const control = this.requestControls.get(context.requestId)
      if (control?.cancelled || context.signal?.aborted) {
        throw runtimeError("cancelled", "Snapshot wait was cancelled", {
          retryable: true,
          currentRevision: current.revision,
        })
      }
      if (this.state !== "open") {
        throw runtimeError("closed", "Runtime closed during snapshot wait")
      }
      const elapsed = this.environment.clock.nowMilliseconds() - startedAt
      if (!Number.isFinite(elapsed) || elapsed < 0) {
        throw runtimeError("fatal", "Monotonic clock moved backward")
      }
      if (elapsed >= budget) {
        throw runtimeError(
          "deadline-exceeded",
          "minimumRevision was not reached before the deadline",
          { retryable: true, currentRevision: current.revision }
        )
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 10))
      this.connection.dataVersion()
      current = this.read(() => this.snapshot())
    }
    return current
  }

  getSchemaPage(request: GetSchemaPageRequest, context: RequestContext) {
    return this.invoke(
      context,
      async () =>
        this.read(async () => {
          assertLimit(
            request.limit,
            EIDOS_RUNTIME_LIMITS.schemaPageSizeMax,
            "limit"
          )
          const snapshot = this.snapshot()
          assertCurrentRevision(request.revision, snapshot.revision)
          let offset = 0
          if (request.cursor !== undefined) {
            const payload = this.decodeCursor(request.cursor, "schema")
            if (
              payload.fileId !== snapshot.fileId ||
              payload.revision !== request.revision ||
              typeof payload.offset !== "number" ||
              !Number.isSafeInteger(payload.offset) ||
              payload.offset < 0
            ) {
              throw runtimeError("invalid-query", "Invalid schema cursor")
            }
            offset = payload.offset
          }
          const objects = this.schemaDescriptors()
          const page = objects.slice(offset, offset + request.limit)
          if (offset > objects.length) {
            throw runtimeError("invalid-query", "Schema cursor is past the end")
          }
          const responseFor = (prefix: typeof page) => {
            const nextOffset = offset + prefix.length
            return {
              fileId: snapshot.fileId,
              revision: snapshot.revision,
              objects: prefix,
              nextCursor:
                nextOffset < objects.length
                  ? this.encodeCursor("schema", {
                      fileId: snapshot.fileId,
                      revision: snapshot.revision,
                      offset: nextOffset,
                    })
                  : null,
            }
          }
          while (
            page.length > 0 &&
            jcsByteLength(responseFor(page)) >
              EIDOS_RUNTIME_LIMITS.responseBytesMax
          ) {
            page.pop()
          }
          if (
            jcsByteLength(responseFor(page)) >
              EIDOS_RUNTIME_LIMITS.responseBytesMax ||
            (offset < objects.length && page.length === 0)
          ) {
            throw runtimeError(
              "resource-limit",
              "Schema descriptor cannot fit responseBytesMax"
            )
          }
          return responseFor(page)
        }),
      false,
      request
    )
  }

  queryRows(
    request: QueryRowsRequest,
    context: RequestContext
  ): Promise<RowPage> {
    return this.invoke(
      context,
      async () =>
        this.read(async () => {
          assertLimit(request.limit, EIDOS_RUNTIME_LIMITS.pageSizeMax, "limit")
          assertProjection(request.projection)
          const query = this.compatibilityQuery(request.tableId, request.query)
          const direction = request.direction ?? "forward"
          const metadata = this.core.info()
          const projectionDigest = await projectionHash(request.projection)
          const queryDigest = await hashJson(
            normalizedRuntimeQuery(request.query)
          )
          const backwardQuery = reverseRuntimeQuery(
            request.query,
            this.core.listFields(request.tableId)
          )
          const traversalQuery =
            direction === "forward" ? request.query : backwardQuery
          const traversal = this.compatibilityQuery(
            request.tableId,
            traversalQuery
          )
          let coreCursor: string | undefined
          if (request.cursor !== undefined) {
            const cursor = this.decodeCursor(request.cursor, "rows")
            if (
              cursor.fileId !== metadata.fileId ||
              cursor.tableId !== request.tableId ||
              cursor.queryHash !== queryDigest ||
              cursor.projectionHash !== projectionDigest
            ) {
              throw runtimeError("invalid-query", "Row cursor binding mismatch")
            }
            if (cursor.revision !== String(metadata.revision)) {
              throw runtimeError(
                "stale-revision",
                "Row cursor revision is stale",
                {
                  currentRevision: String(metadata.revision),
                }
              )
            }
            const selected =
              direction === "forward" ? cursor.forward : cursor.backward
            if (typeof selected !== "string") {
              throw runtimeError(
                "invalid-query",
                "Row cursor boundary is invalid"
              )
            }
            coreCursor = selected
          }
          const extraFields = (request.query.sort ?? []).map(
            (sort) => sort.fieldId
          )
          const fields = Array.from(
            new Set([...request.projection.fields, ...extraFields])
          )
          const result = this.core.queryRows(request.tableId, {
            fields,
            query: traversal,
            limit: request.limit + 1,
            cursor: coreCursor,
            resolveRelations: request.projection.resolveRelations.length > 0,
          })
          const hasMoreInTraversal = result.rows.length > request.limit
          const traversalRows = result.rows.slice(0, request.limit)
          const logicalRows =
            direction === "forward" ? traversalRows : traversalRows.reverse()
          const columns = this.columns(request.tableId, request.projection)
          const rows = this.projectRows(
            request.tableId,
            request.projection,
            logicalRows,
            columns
          )
          const boundaryCursor = (row: EidosFileLogicalRow | undefined) => {
            if (!row) return null
            return this.encodeCursor("rows", {
              fileId: metadata.fileId,
              tableId: request.tableId,
              revision: String(metadata.revision),
              queryHash: queryDigest,
              projectionHash: projectionDigest,
              forward: this.core.createRowCursor(request.tableId, query, row),
              backward: this.core.createRowCursor(
                request.tableId,
                this.compatibilityQuery(request.tableId, backwardQuery),
                row
              ),
            })
          }
          const hasEarlier =
            direction === "backward"
              ? hasMoreInTraversal
              : request.cursor !== undefined
          const hasLater =
            direction === "forward"
              ? hasMoreInTraversal
              : request.cursor !== undefined
          return {
            fileId: metadata.fileId,
            tableId: request.tableId,
            revision: String(metadata.revision),
            projectionHash: projectionDigest,
            columns,
            rows,
            nextCursor: hasLater ? boundaryCursor(logicalRows.at(-1)) : null,
            previousCursor: hasEarlier ? boundaryCursor(logicalRows[0]) : null,
          }
        }),
      false,
      request
    )
  }

  getRowsById(
    request: {
      tableId: string
      rowIds: string[]
      projection: ProjectionSpec
    },
    context: RequestContext
  ): Promise<RowBatch> {
    return this.invoke(
      context,
      async () =>
        this.read(async () => {
          if (
            request.rowIds.length > EIDOS_RUNTIME_LIMITS.rowsByIdMax ||
            new Set(request.rowIds).size !== request.rowIds.length
          ) {
            throw runtimeError(
              "invalid-request",
              "rowIds must be unique and within rowsByIdMax"
            )
          }
          request.rowIds.forEach((id) => assertEidosFileUuid(id, "Row ID"))
          assertProjection(request.projection)
          return this.getRowsByIdDirect(
            request.tableId,
            request.rowIds,
            request.projection
          )
        }),
      false,
      request
    )
  }

  aggregate(
    request: AggregateRequest,
    context: RequestContext
  ): Promise<AggregateResponse> {
    return this.invoke(
      context,
      () => this.read(() => this.aggregateNow(request)),
      false,
      request
    )
  }

  groupRows(
    request: GroupRequest,
    context: RequestContext
  ): Promise<GroupPage> {
    return this.invoke(
      context,
      async () => this.read(async () => this.groupRowsNow(request)),
      false,
      request
    )
  }

  queryGroupRows(
    request: GroupRowsRequest,
    context: RequestContext
  ): Promise<GroupRowPage> {
    return this.invoke(
      context,
      async () =>
        this.read(async () => {
          assertLimit(request.limit, EIDOS_RUNTIME_LIMITS.pageSizeMax, "limit")
          const cursor = this.decodeCursor(request.cursor, "group-rows")
          const source = cursor.request as unknown as GroupRequest
          if (!source || typeof source !== "object" || Array.isArray(source)) {
            throw runtimeError("invalid-query", "Invalid group row cursor")
          }
          assertProjection(source.projection)
          const metadata = this.core.info()
          const projectionDigest = await projectionHash(source.projection)
          const bindingDigest = await groupBindingHash(source)
          if (
            cursor.fileId !== metadata.fileId ||
            cursor.tableId !== source.tableId ||
            cursor.projectionHash !== projectionDigest ||
            cursor.bindingHash !== bindingDigest ||
            !Array.isArray(cursor.groupKey) ||
            typeof cursor.forward !== "string" ||
            typeof cursor.backward !== "string"
          ) {
            throw runtimeError(
              "invalid-query",
              "Group row cursor binding mismatch"
            )
          }
          if (cursor.revision !== String(metadata.revision)) {
            throw runtimeError(
              "stale-revision",
              "Group row cursor revision is stale",
              {
                currentRevision: String(metadata.revision),
              }
            )
          }
          const groupKey = cursor.groupKey as LogicalValue[]
          if (groupKey.length !== source.groupBy.length) {
            throw runtimeError(
              "invalid-query",
              "Group row cursor key is invalid"
            )
          }
          const groupQuery = queryForGroup(
            source.query,
            source.groupBy,
            groupKey
          )
          const direction = request.direction ?? "forward"
          const backwardQuery = reverseRuntimeQuery(
            groupQuery,
            this.core.listFields(source.tableId)
          )
          const traversalQuery =
            direction === "forward" ? groupQuery : backwardQuery
          const fields = Array.from(
            new Set([
              ...source.projection.fields,
              ...(groupQuery.sort ?? []).map((sort) => sort.fieldId),
            ])
          )
          const result = this.core.queryRows(source.tableId, {
            fields,
            query: this.compatibilityQuery(source.tableId, traversalQuery),
            limit: request.limit + 1,
            cursor:
              direction === "forward"
                ? (cursor.forward as string)
                : (cursor.backward as string),
            resolveRelations: source.projection.resolveRelations.length > 0,
          })
          const hasMore = result.rows.length > request.limit
          const traversalRows = result.rows.slice(0, request.limit)
          const logicalRows =
            direction === "forward" ? traversalRows : traversalRows.reverse()
          const columns = this.columns(source.tableId, source.projection)
          const rowCursor = (row: EidosFileLogicalRow | undefined) => {
            if (!row) return null
            return this.encodeCursor("group-rows", {
              fileId: metadata.fileId,
              tableId: source.tableId,
              revision: String(metadata.revision),
              projectionHash: projectionDigest,
              bindingHash: bindingDigest,
              request: groupCursorSource(source),
              groupKey,
              forward: this.core.createRowCursor(
                source.tableId,
                this.compatibilityQuery(source.tableId, groupQuery),
                row
              ),
              backward: this.core.createRowCursor(
                source.tableId,
                this.compatibilityQuery(source.tableId, backwardQuery),
                row
              ),
            })
          }
          const hasEarlier =
            direction === "backward" ? hasMore : request.cursor !== undefined
          const hasLater =
            direction === "forward" ? hasMore : request.cursor !== undefined
          return {
            fileId: metadata.fileId,
            tableId: source.tableId,
            revision: String(metadata.revision),
            projectionHash: projectionDigest,
            columns,
            groupKey,
            rows: this.projectRows(
              source.tableId,
              source.projection,
              logicalRows,
              columns
            ),
            nextCursor: hasLater ? rowCursor(logicalRows.at(-1)) : null,
            previousCursor: hasEarlier ? rowCursor(logicalRows[0]) : null,
          }
        }),
      false,
      request
    )
  }

  previewFormula(
    request: FormulaPreviewRequest,
    context: RequestContext
  ): Promise<FormulaPreviewResult> {
    return this.invoke(
      context,
      () => {
        if (!this.capabilitiesValue.formulaPreview) {
          throw runtimeError("unsupported", "formulaPreview is unavailable")
        }
        return this.read(() => {
          const name =
            request.fieldId === undefined
              ? request.candidateName
              : this.core
                  .listFields(request.tableId)
                  .find((field) => field.id === request.fieldId)?.name
          if (!name) {
            throw runtimeError(
              "invalid-request",
              "Formula candidate name is required"
            )
          }
          try {
            const result = this.core.previewFormula(request.tableId, {
              name,
              columnName: name,
              formula: request.sourceText,
              displayType: request.declaredResultType,
            })
            const metadata = this.core.info()
            return {
              fileId: metadata.fileId,
              revision: String(metadata.revision),
              valid: true,
              inferredType: request.declaredResultType,
              dependencies: result.dependencies.flatMap((dependency) => {
                const field = this.core
                  .listFields(request.tableId)
                  .find(
                    (entry) =>
                      entry.name === dependency.name ||
                      entry.tableColumnName === dependency.columnName
                  )
                return field?.id ? [field.id] : []
              }),
              rows: result.samples.map((sample) => ({
                rowId: sample.rowId,
                value: compatibilityLogicalValue(
                  sample.value,
                  request.declaredResultType
                ),
              })),
              diagnostics: [],
              diagnosticsTruncated: false,
            }
          } catch (error) {
            const mapped = mapRuntimeFailure(error)
            return {
              fileId: this.core.info().fileId,
              revision: String(this.core.info().revision),
              valid: false,
              diagnostics: [
                {
                  code: "formula-parse-invalid",
                  severity: "error",
                  message: mapped.message,
                },
              ],
              diagnosticsTruncated: false,
            }
          }
        })
      },
      false,
      request
    )
  }

  mutateRows(
    request: RowMutation,
    context: RequestContext
  ): Promise<MutationResult> {
    return this.invoke(
      context,
      async () => {
        this.assertWritable("mutateRows")
        if (
          request.changes.length < 1 ||
          request.changes.length > EIDOS_RUNTIME_LIMITS.mutationRowsMax
        ) {
          throw runtimeError(
            "invalid-request",
            "changes must be within mutationRowsMax"
          )
        }
        const mutationCells = request.changes.reduce(
          (total, change) =>
            total +
            ("values" in change ? Object.keys(change.values).length : 0),
          0
        )
        if (mutationCells > EIDOS_RUNTIME_LIMITS.mutationCellsMax) {
          throw runtimeError(
            "resource-limit",
            "Mutation exceeds mutationCellsMax"
          )
        }
        assertJcsBytes(
          request,
          EIDOS_RUNTIME_LIMITS.mutationBytesMax,
          "Row mutation"
        )
        const current = this.core.info()
        assertCurrentRevision(
          request.expectedRevision,
          String(current.revision)
        )
        const clientKeys = new Set<string>()
        const rowIds = new Set<string>()
        for (const change of request.changes) {
          if (change.kind === "create") {
            if (!change.clientKey || clientKeys.has(change.clientKey)) {
              throw runtimeError(
                "invalid-request",
                "Create clientKey values must be non-empty and unique"
              )
            }
            clientKeys.add(change.clientKey)
          } else {
            assertEidosFileUuid(change.rowId, "Row ID")
            if (rowIds.has(change.rowId)) {
              throw runtimeError(
                "invalid-request",
                "A Row ID may occur only once per mutation"
              )
            }
            rowIds.add(change.rowId)
          }
        }
        if (rowIds.size > 0) {
          const rowIdField = this.core
            .listFields(request.tableId)
            .find(
              (field) =>
                field.systemRole === "row-id" || field.type === "row-id"
            )
          if (!rowIdField?.id)
            throw runtimeError("corrupt-file", "Table is missing Row-ID Field")
          const existing = new Set(
            this.fetchRowsByIds(request.tableId, Array.from(rowIds), {
              fields: [rowIdField.id],
              resolveRelations: [],
            }).map((row) => row.id)
          )
          for (const rowId of rowIds) {
            if (!existing.has(rowId)) {
              throw runtimeError("not-found", "Row not found", {
                tableId: request.tableId,
                rowId,
              })
            }
          }
        }
        const inserts = request.changes
          .filter((change) => change.kind === "create")
          .map((change) => ({
            fields: this.mutationValues(request.tableId, change.values),
          }))
        const updates = request.changes
          .filter((change) => change.kind === "update")
          .map((change) => ({
            id: change.rowId,
            fields: this.mutationValues(request.tableId, change.values),
          }))
        const deletes = request.changes
          .filter((change) => change.kind === "delete")
          .map((change) => change.rowId)
        const beforeRevision = String(this.core.info().revision)
        return this.withCommitBarrier(
          "mutateRows",
          beforeRevision,
          context,
          async () => {
            const result = this.core.mutateRows({
              tableId: request.tableId,
              insert: inserts,
              update: updates,
              delete: deletes,
              expectedRevision: parseRevision(request.expectedRevision),
            })
            const after = this.core.info()
            const createdChanges = request.changes.filter(
              (change) => change.kind === "create"
            )
            const created = createdChanges.map((change, index) => ({
              clientKey: change.clientKey,
              rowId: result.rows[index]!.id,
            }))
            const affectedRows = result.affected ?? []
            const response: MutationResult = {
              fileId: after.fileId,
              revision: String(after.revision),
              changed: String(after.revision) !== beforeRevision,
              created,
              affectedRows,
            }
            if (request.returning) {
              response.returnedRows = await this.getRowsByIdDirect(
                request.tableId,
                request.changes.flatMap((change) => {
                  if (change.kind === "create") {
                    const allocated = created.find(
                      (entry) => entry.clientKey === change.clientKey
                    )
                    return allocated ? [allocated.rowId] : []
                  }
                  if (change.kind === "update") return [change.rowId]
                  return []
                }),
                request.returning
              )
            }
            return response
          },
          (result) => ({
            operation: "mutateRows",
            result: {
              fileId: result.fileId,
              revision: result.revision,
              changed: true,
              created: result.created,
              affectedRows: result.affectedRows,
            },
          })
        )
      },
      false,
      request
    )
  }

  private mutationValues(
    tableId: string,
    values: Record<string, LogicalValue>
  ): Record<string, EidosFileLogicalRow["fields"][string]> {
    const fields = new Map(
      this.core.listFields(tableId).map((field) => [field.id!, field])
    )
    const normalized: Record<string, EidosFileLogicalRow["fields"][string]> = {}
    for (const [fieldId, value] of Object.entries(values)) {
      const field = fields.get(fieldId)
      if (!field) {
        throw runtimeError("not-found", "Mutation Field not found", { fieldId })
      }
      if (!fieldWritable(field)) {
        throw runtimeError("forbidden", "Mutation Field is read-only", {
          fieldId,
        })
      }
      const type = fieldValueType(field)
      assertJcsBytes(
        value,
        EIDOS_RUNTIME_LIMITS.logicalValueBytesMax,
        "Logical value"
      )
      if (value === null) {
        if (!field.nullable) {
          throw runtimeError("constraint", "Field is not nullable", { fieldId })
        }
        normalized[fieldId] = null
        continue
      }
      if (!logicalValueMatchesType(value, type)) {
        throw runtimeError("invalid-value", "Mutation value type is invalid", {
          fieldId,
        })
      }
      if (
        Array.isArray(value) &&
        value.length > EIDOS_RUNTIME_LIMITS.listElementsMax
      ) {
        throw runtimeError("resource-limit", "List exceeds listElementsMax", {
          fieldId,
        })
      }
      if (type === "date" && !isCanonicalEidosFileDate(value)) {
        throw runtimeError("invalid-value", "Date is not canonical", {
          fieldId,
        })
      }
      if (type === "datetime" && !isCanonicalEidosFileInstant(value)) {
        throw runtimeError("invalid-value", "Datetime is not canonical", {
          fieldId,
        })
      }
      if (type === "json") {
        const text = value as string
        if (
          new TextEncoder().encode(text).byteLength >
          EIDOS_RUNTIME_LIMITS.jsonCellBytesMax
        ) {
          throw runtimeError(
            "resource-limit",
            "JSON cell exceeds jsonCellBytesMax",
            {
              fieldId,
            }
          )
        }
        try {
          if (canonicalizeEidosFileJson(JSON.parse(text)) !== text) {
            throw new Error("non-canonical")
          }
        } catch {
          throw runtimeError(
            "invalid-value",
            "JSON Field value must be canonical JCS text",
            { fieldId }
          )
        }
      }
      if (type === "integer") {
        normalized[fieldId] = parseSignedInt64(value as string, "Integer value")
      } else {
        normalized[fieldId] = value as EidosFileLogicalRow["fields"][string]
      }
    }
    return normalized
  }

  async mutateView(
    request: ViewMutationRequest,
    context: RequestContext
  ): Promise<ViewMutationResult> {
    return this.invoke(
      context,
      () => {
        this.assertWritable("mutateView")
        if (request.changes.length < 1) {
          throw runtimeError(
            "invalid-request",
            "View mutation changes are required"
          )
        }
        const before = this.core.info()
        assertCurrentRevision(request.expectedRevision, String(before.revision))
        const clientKeys = new Set<string>()
        const viewIds = new Set<string>()
        const createdViews: Array<{ clientKey: string; viewId: string }> = []
        const affected = new Set<string>()
        for (const change of request.changes) {
          if (change.kind === "create-view") {
            if (!change.clientKey || clientKeys.has(change.clientKey)) {
              throw runtimeError(
                "invalid-request",
                "View clientKey values must be non-empty and unique"
              )
            }
            clientKeys.add(change.clientKey)
          } else {
            if (viewIds.has(change.viewId)) {
              throw runtimeError(
                "invalid-request",
                "A View ID may occur only once per request"
              )
            }
            viewIds.add(change.viewId)
          }
        }
        return this.withCommitBarrier(
          "mutateView",
          String(before.revision),
          context,
          () => {
            this.core.applyCanonicalMutation(() => {
              for (const change of request.changes) {
                if (change.kind === "create-view") {
                  const view = this.core.createView(change.tableId, {
                    name: assertEidosFileDisplayName(change.name, "View name"),
                    type: change.type,
                    position: int64ToSafeNumber(change.position, "position"),
                    properties: objectValue(change.layout),
                    filter: change.query.filter
                      ? runtimeFilterToCompatibility(change.query.filter)
                      : null,
                    sorts: (change.query.sort ?? []).map((sort) => ({
                      field: sort.fieldId,
                      direction: sort.direction,
                      nulls: sort.nulls ?? "last",
                    })),
                  })
                  createdViews.push({
                    clientKey: change.clientKey,
                    viewId: view.id,
                  })
                  affected.add(view.id)
                  continue
                }
                const current = this.allViews().find(
                  (view) => view.id === change.viewId
                )
                if (!current) {
                  throw runtimeError("not-found", "View not found")
                }
                if (change.kind === "delete-view") {
                  this.core.deleteView(change.viewId)
                  affected.add(change.viewId)
                  continue
                }
                const layout =
                  change.patch.layout === undefined
                    ? undefined
                    : objectValue(change.patch.layout)
                const fieldOrder = Array.isArray(layout?.fieldOrder)
                  ? layout.fieldOrder.filter(
                      (fieldId): fieldId is string =>
                        typeof fieldId === "string"
                    )
                  : null
                const hiddenFields = Array.isArray(layout?.hiddenFields)
                  ? layout.hiddenFields.filter(
                      (fieldId): fieldId is string =>
                        typeof fieldId === "string"
                    )
                  : []
                this.core.updateView(change.viewId, {
                  ...(change.patch.name === undefined
                    ? {}
                    : { name: change.patch.name }),
                  ...(change.patch.type === undefined
                    ? {}
                    : { type: change.patch.type }),
                  ...(change.patch.position === undefined
                    ? {}
                    : {
                        position: int64ToSafeNumber(
                          change.patch.position,
                          "position"
                        ),
                      }),
                  ...(layout === undefined
                    ? {}
                    : {
                        properties: layout,
                        orderMap: fieldOrder
                          ? Object.fromEntries(
                              fieldOrder.map((fieldId, index) => [
                                fieldId,
                                index,
                              ])
                            )
                          : null,
                        hiddenFields,
                      }),
                  ...(change.patch.query === undefined
                    ? {}
                    : {
                        filter: change.patch.query.filter
                          ? runtimeFilterToCompatibility(
                              change.patch.query.filter
                            )
                          : null,
                        sorts: (change.patch.query.sort ?? []).map((sort) => ({
                          field: sort.fieldId,
                          direction: sort.direction,
                          nulls: sort.nulls ?? "last",
                        })),
                      }),
                })
                affected.add(change.viewId)
              }
            }, parseRevision(request.expectedRevision))
            const after = this.core.info()
            return {
              fileId: after.fileId,
              revision: String(after.revision),
              changed: String(after.revision) !== String(before.revision),
              createdViews,
              affectedViewIds: Array.from(affected).sort(binaryCompare),
            }
          },
          (result) => ({
            operation: "mutateView",
            result: {
              fileId: result.fileId,
              revision: result.revision,
              changed: true,
              createdViews: result.createdViews,
              affectedViewIds: result.affectedViewIds,
            },
          })
        )
      },
      false,
      request
    )
  }

  async preflightSchema(
    request: SchemaPreflightRequest,
    context: RequestContext
  ): Promise<SchemaPreflightResult> {
    return this.invoke(
      context,
      async () => {
        this.assertWritable("preflightSchema")
        const metadata = this.core.info()
        assertCurrentRevision(
          request.expectedRevision,
          String(metadata.revision)
        )
        const analysis = this.analyzeSchemaChange(request.change)
        const actionsHash = await hashJson(request.change)
        const token = this.generator.next()
        const expiresInMilliseconds = 600_000
        const wall = checkedNowInstant(this.environment)
        const expiresAt = new Date(
          Date.parse(wall) + expiresInMilliseconds
        ).toISOString()
        const plan: RetainedSchemaPlan = {
          token,
          change: request.change,
          actionsHash,
          baseRevision: request.expectedRevision,
          classification: analysis.classification,
          dependencies: analysis.dependencies,
          warnings: analysis.warnings,
          affectedRows: analysis.affectedRows,
          valueChanges: analysis.valueChanges,
          createdAtSequence: ++this.schemaPlanSequence,
          expiresAtMonotonic:
            this.environment.clock.nowMilliseconds() + expiresInMilliseconds,
          expiresAt,
        }
        const retainedBytes = jcsByteLength(plan)
        if (retainedBytes > EIDOS_RUNTIME_LIMITS.schemaPlanBytesMax) {
          throw runtimeError(
            "resource-limit",
            "Schema plan exceeds schemaPlanBytesMax"
          )
        }
        const dependencies = plan.dependencies.slice(
          0,
          EIDOS_RUNTIME_LIMITS.schemaPageSizeMax
        )
        const responseBase = {
          fileId: metadata.fileId,
          planToken: token,
          baseRevision: request.expectedRevision,
          actionsHash,
          classification: plan.classification,
          affectedRows: plan.affectedRows,
          dependencyCount: String(plan.dependencies.length),
          warnings: plan.warnings.slice(0, EIDOS_RUNTIME_LIMITS.diagnosticsMax),
          warningsTruncated:
            plan.warnings.length > EIDOS_RUNTIME_LIMITS.diagnosticsMax,
          valueChanges: plan.valueChanges.slice(
            0,
            EIDOS_RUNTIME_LIMITS.diagnosticsMax
          ),
          valueChangesTruncated:
            plan.valueChanges.length > EIDOS_RUNTIME_LIMITS.diagnosticsMax,
          expiresInMilliseconds,
          expiresAt,
        }
        const responseFor = (prefix: typeof dependencies) => ({
          ...responseBase,
          dependencies: prefix,
          ...(prefix.length < plan.dependencies.length
            ? {
                dependencyCursor: this.encodeCursor("schema-dependencies", {
                  planToken: token,
                  offset: prefix.length,
                }),
              }
            : {}),
        })
        while (
          dependencies.length > 0 &&
          jcsByteLength(responseFor(dependencies)) >
            EIDOS_RUNTIME_LIMITS.responseBytesMax
        ) {
          dependencies.pop()
        }
        if (
          jcsByteLength(responseFor(dependencies)) >
            EIDOS_RUNTIME_LIMITS.responseBytesMax ||
          (plan.dependencies.length > 0 && dependencies.length === 0)
        ) {
          throw runtimeError(
            "resource-limit",
            "Schema preflight result cannot fit responseBytesMax"
          )
        }
        this.evictSchemaPlans(retainedBytes)
        this.schemaPlans.set(token, plan)
        return responseFor(dependencies)
      },
      false,
      request
    )
  }

  async getSchemaPlanDependencies(
    request: { planToken: string; cursor?: string; limit: number },
    context: RequestContext
  ): Promise<SchemaDependencyPage> {
    return this.invoke(
      context,
      () => {
        assertLimit(
          request.limit,
          EIDOS_RUNTIME_LIMITS.schemaPageSizeMax,
          "limit"
        )
        const plan = this.retainedSchemaPlan(request.planToken)
        let offset = 0
        if (request.cursor !== undefined) {
          const cursor = this.decodeCursor(
            request.cursor,
            "schema-dependencies"
          )
          if (
            cursor.planToken !== request.planToken ||
            typeof cursor.offset !== "number" ||
            !Number.isSafeInteger(cursor.offset) ||
            cursor.offset < 0
          ) {
            throw runtimeError("invalid-plan", "Invalid dependency cursor")
          }
          offset = cursor.offset
        }
        const dependencies = plan.dependencies.slice(
          offset,
          offset + request.limit
        )
        if (offset > plan.dependencies.length) {
          throw runtimeError(
            "invalid-plan",
            "Dependency cursor is past the end"
          )
        }
        const responseFor = (prefix: typeof dependencies) => {
          const nextOffset = offset + prefix.length
          return {
            fileId: this.core.info().fileId,
            revision: plan.baseRevision,
            dependencyCount: String(plan.dependencies.length),
            dependencies: prefix,
            nextCursor:
              nextOffset < plan.dependencies.length
                ? this.encodeCursor("schema-dependencies", {
                    planToken: plan.token,
                    offset: nextOffset,
                  })
                : null,
          }
        }
        while (
          dependencies.length > 0 &&
          jcsByteLength(responseFor(dependencies)) >
            EIDOS_RUNTIME_LIMITS.responseBytesMax
        ) {
          dependencies.pop()
        }
        if (
          jcsByteLength(responseFor(dependencies)) >
            EIDOS_RUNTIME_LIMITS.responseBytesMax ||
          (offset < plan.dependencies.length && dependencies.length === 0)
        ) {
          throw runtimeError(
            "resource-limit",
            "Schema dependency cannot fit responseBytesMax"
          )
        }
        return responseFor(dependencies)
      },
      false,
      request
    )
  }

  async mutateSchema(
    request: SchemaMutationRequest,
    context: RequestContext
  ): Promise<SchemaMutationResult> {
    return this.invoke(
      context,
      () => {
        this.assertWritable("mutateSchema")
        if (!request.planToken || !/^[0-9a-f-]{36}$/.test(request.planToken)) {
          throw runtimeError("invalid-plan", "Invalid schema plan token")
        }
        const plan = this.retainedSchemaPlan(request.planToken)
        if (
          request.actionsHash !== plan.actionsHash ||
          request.expectedRevision !== plan.baseRevision
        ) {
          throw runtimeError("invalid-plan", "Schema plan binding mismatch")
        }
        const before = this.core.info()
        assertCurrentRevision(plan.baseRevision, String(before.revision))
        if (plan.classification === "forbidden") {
          throw runtimeError("forbidden", "Schema plan is forbidden")
        }
        if (
          plan.classification === "explicit-lossy" &&
          request.confirmLossy !== true
        ) {
          throw runtimeError(
            "lossy-confirmation-required",
            "Schema plan requires confirmLossy:true"
          )
        }
        this.schemaPlans.delete(plan.token)
        const createdObjects: CreatedSchemaObject[] = []
        const affectedTableIds = new Set<string>()
        const affectedFieldIds = new Set<string>()
        return this.withCommitBarrier(
          "mutateSchema",
          String(before.revision),
          context,
          () => {
            this.core.applyCanonicalMutation(() => {
              this.applySchemaChange(
                plan.change,
                createdObjects,
                affectedTableIds,
                affectedFieldIds
              )
            }, parseRevision(request.expectedRevision))
            const after = this.core.info()
            return {
              fileId: after.fileId,
              revision: String(after.revision),
              changed: String(after.revision) !== String(before.revision),
              createdObjects,
              affectedTableIds:
                Array.from(affectedTableIds).sort(binaryCompare),
              affectedFieldIds:
                Array.from(affectedFieldIds).sort(binaryCompare),
            }
          },
          (result) => ({
            operation: "mutateSchema",
            result: {
              fileId: result.fileId,
              revision: result.revision,
              changed: true,
              createdObjects: result.createdObjects,
              affectedTableIds: result.affectedTableIds,
              affectedFieldIds: result.affectedFieldIds,
            },
          })
        )
      },
      false,
      request
    )
  }

  validate(
    request: ValidationRequest,
    context: RequestContext
  ): Promise<ValidationReport> {
    return this.invoke(
      context,
      () =>
        this.read(() => {
          assertLimit(
            request.diagnosticsLimit,
            EIDOS_RUNTIME_LIMITS.diagnosticsMax,
            "diagnosticsLimit"
          )
          const result = this.core.validate({ level: request.level })
          const metadata = result.metadata
          const diagnostics: RuntimeDiagnostic[] = [
            ...result.errors.map((issue) =>
              validationDiagnostic(issue, "error")
            ),
            ...result.warnings.map((issue) =>
              validationDiagnostic(issue, "warning")
            ),
          ]
          const retained = diagnostics.slice(0, request.diagnosticsLimit)
          return {
            ...(metadata
              ? {
                  fileId: metadata.fileId,
                  revision: String(metadata.revision),
                }
              : {}),
            level: request.level,
            valid: result.valid,
            diagnostics: retained,
            truncated: retained.length < diagnostics.length,
          }
        }),
      false,
      request
    )
  }

  async cancel(request: { requestId: string }): Promise<void> {
    const control = this.requestControls.get(request.requestId)
    if (!control) return
    control.cancelled = true
    if (this.connection.capabilities().interrupt) {
      try {
        this.connection.interrupt()
      } catch {
        // Cancellation remains requested even when interruption races.
      }
    }
  }

  close(context: RequestContext): Promise<void> {
    if (this.state === "closed") return Promise.resolve()
    try {
      assertRequestContext(context)
    } catch (error) {
      return Promise.reject(mapRuntimeFailure(error))
    }
    if (context.signal?.aborted) {
      return Promise.reject(runtimeError("cancelled", "Close was cancelled"))
    }
    if (this.state === "open") this.state = "closing"
    return this.invoke(
      context,
      () => {
        this.schemaPlans.clear()
        this.state = "closed"
      },
      true
    )
  }

  private snapshot(): RuntimeSnapshot {
    const metadata = this.core.info()
    const tables = this.core.listTables()
    const fields = tables.flatMap((table) => this.core.listFields(table.id))
    const views = tables.flatMap((table) => this.core.listViews(table.id))
    return {
      fileId: metadata.fileId,
      format: { major: 1, minor: 0 },
      revision: String(metadata.revision),
      title: metadata.title ?? "Untitled",
      defaultTableId: metadata.defaultTableId ?? null,
      schemaCounts: {
        tables: String(tables.length),
        fields: String(fields.length),
        views: String(views.length),
        features: "0",
      },
    }
  }

  private schemaDescriptors(): SchemaDescriptor[] {
    const tables = this.core.listTables()
    const tableDescriptors = tables.map((table) => {
      const fields = this.core.listFields(table.id)
      const label = fields.find((field) => field.isRecordLabel)
      if (!label?.id) {
        throw runtimeError("corrupt-file", "Table has no Record Label Field", {
          tableId: table.id,
        })
      }
      return {
        object: "table" as const,
        id: table.id,
        name: table.name,
        labelFieldId: label.id,
        position: String(table.position ?? 0),
        settings: objectValue({
          ...(table.icon === null ? {} : { icon: table.icon }),
          ...(table.description === null
            ? {}
            : { description: table.description }),
        }),
      }
    })
    const fieldDescriptors = tables.flatMap((table) =>
      this.core.listFields(table.id).map((field) => fieldDescriptor(field))
    )
    const views = tables.flatMap((table) =>
      this.core.listViews(table.id).map((view) => ({
        object: "view" as const,
        id: view.id,
        tableId: view.tableId,
        name: view.name,
        type: view.type,
        query: {
          ...(view.filter
            ? { filter: compatibilityFilterToRuntime(view.filter) }
            : {}),
          ...(view.sorts.length > 0
            ? {
                sort: view.sorts.map((sort) => ({
                  fieldId: sort.field,
                  direction: sort.direction,
                  ...(sort.nulls ? { nulls: sort.nulls } : {}),
                })),
              }
            : {}),
        } satisfies SavedViewQuery,
        layout: objectValue(view.properties ?? {}),
        position: String(view.position ?? 0),
      }))
    )
    return [...tableDescriptors, ...fieldDescriptors, ...views]
  }

  private columns(
    tableId: string,
    projection: ProjectionSpec
  ): ColumnDescriptor[] {
    const fields = this.core.listFields(tableId)
    return projection.fields.map((fieldId) => {
      const field = fields.find((entry) => entry.id === fieldId)
      if (!field) {
        throw runtimeError("not-found", "Projection Field not found", {
          tableId,
          fieldId,
        })
      }
      const relation = relationDefinition(field)
      return {
        fieldId,
        name: field.name,
        valueType: fieldValueType(field),
        source:
          field.type === "formula"
            ? "formula"
            : field.type === "lookup"
              ? "lookup"
              : field.type === "relation" && relation?.direction === "inverse"
                ? "inverse-relation"
                : "stored",
        writable: fieldWritable(field),
      }
    })
  }

  private projectRows(
    tableId: string,
    projection: ProjectionSpec,
    rows: EidosFileLogicalRow[],
    columns: ColumnDescriptor[]
  ): ProjectedRow[] {
    const fields = this.core.listFields(tableId)
    return rows.map((row) => {
      const projected: ProjectedRow = {
        id: row.id,
        values: projection.fields.map((fieldId, index) =>
          compatibilityLogicalValue(
            row.fields[fieldId] ?? null,
            columns[index]!.valueType
          )
        ),
      }
      const resolvedRelations = projection.resolveRelations.flatMap(
        (fieldId) => {
          const column = projection.fields.indexOf(fieldId)
          if (column < 0) return []
          const field = fields.find((entry) => entry.id === fieldId)
          const definition = field ? relationDefinition(field) : undefined
          if (!field || !definition) return []
          const targetFields = this.core.listFields(definition.targetTableId)
          const labelField = targetFields.find((entry) => entry.isRecordLabel)
          if (!labelField?.id) return []
          const items = row.resolved?.[fieldId] ?? []
          return [
            {
              column,
              items: items.map((item) => ({
                id: item.id,
                state: "resolved" as const,
                labelFieldId: labelField.id!,
                labelType: fieldValueType(labelField),
                label: item.label as LogicalValue,
              })),
            },
          ]
        }
      )
      if (resolvedRelations.length > 0) {
        projected.resolvedRelations = resolvedRelations
      }
      if (projected.values.length !== columns.length) {
        throw runtimeError("fatal", "Columnar projection length mismatch")
      }
      return projected
    })
  }

  private aggregateNow(request: AggregateRequest): AggregateResponse {
    if (
      request.items.length < 1 ||
      request.items.length > EIDOS_RUNTIME_LIMITS.aggregateItemsMax
    ) {
      throw runtimeError(
        "invalid-request",
        "Aggregate items exceed aggregateItemsMax"
      )
    }
    const keys = new Set<string>()
    const fields = this.core.listFields(request.tableId)
    const fieldsById = new Map(fields.map((field) => [field.id!, field]))
    const fieldIds = Array.from(
      new Set([
        ...request.items.flatMap((item) =>
          item.op === "count-all" ? [] : [item.fieldId]
        ),
        ...runtimeQueryFieldIds(request.query),
      ])
    )
    for (const fieldId of fieldIds) {
      if (!fieldsById.has(fieldId)) {
        throw runtimeError("not-found", "Aggregate Field not found", {
          fieldId,
        })
      }
    }
    const rows = this.core
      .runtimeScanLogicalRows(
        request.tableId,
        fieldIds,
        this.compatibilityQuery(request.tableId, request.query ?? {})
      )
      .sort((left, right) => binaryCompare(left.id, right.id))
    const results = request.items.map((item) => {
      if (!item.key || keys.has(item.key)) {
        throw runtimeError(
          "invalid-request",
          "Aggregate keys must be non-empty and unique"
        )
      }
      keys.add(item.key)
      if (item.op === "count-all") {
        return { key: item.key, value: String(rows.length) }
      }
      const field = fieldsById.get(item.fieldId)!
      const valueType = fieldValueType(field)
      const values = rows.map((row) => row.fields[item.fieldId] ?? null)
      return aggregateItemResult(item, valueType, values)
    })
    const metadata = this.core.info()
    return {
      fileId: metadata.fileId,
      tableId: request.tableId,
      revision: String(metadata.revision),
      results,
    }
  }

  private compatibilityQuery(tableId: string, query: RowQuery) {
    assertRuntimeRowQuery(this.core.listFields(tableId), query)
    return runtimeQueryToCompatibility(query)
  }

  private async groupRowsNow(request: GroupRequest): Promise<GroupPage> {
    assertLimit(
      request.groupLimit,
      EIDOS_RUNTIME_LIMITS.groupPageSizeMax,
      "groupLimit"
    )
    assertLimit(
      request.rowsPerGroup,
      EIDOS_RUNTIME_LIMITS.pageSizeMax,
      "rowsPerGroup"
    )
    if (
      request.groupBy.length < 1 ||
      request.groupBy.length > EIDOS_RUNTIME_LIMITS.groupFieldsMax ||
      new Set(request.groupBy).size !== request.groupBy.length
    ) {
      throw runtimeError("invalid-query", "groupBy is invalid")
    }
    assertProjection(request.projection)
    if (request.aggregates.length > EIDOS_RUNTIME_LIMITS.aggregateItemsMax) {
      throw runtimeError(
        "invalid-request",
        "Group aggregates exceed aggregateItemsMax"
      )
    }
    const fields = this.core.listFields(request.tableId)
    const fieldsById = new Map(fields.map((field) => [field.id!, field]))
    const groupTypes: TypeRef[] = request.groupBy.map((fieldId) => {
      const field = fieldsById.get(fieldId)
      const type = field ? fieldValueType(field) : undefined
      if (!field || typeof type !== "string" || !isSortableType(type)) {
        throw runtimeError("invalid-query", "Group Field is not groupable", {
          fieldId,
        })
      }
      return type
    })
    assertAggregateItems(request.aggregates, fieldsById)
    const required = Array.from(
      new Set([
        ...request.projection.fields,
        ...request.groupBy,
        ...request.aggregates.flatMap((item) =>
          item.op === "count-all" ? [] : [item.fieldId]
        ),
        ...runtimeQueryFieldIds(request.query),
      ])
    )
    const sourceRows = this.core.runtimeScanLogicalRows(
      request.tableId,
      required,
      this.compatibilityQuery(request.tableId, request.query)
    )
    type RuntimeGroup = {
      identity: string
      rawKey: unknown[]
      key: LogicalValue[]
      rows: EidosFileLogicalRow[]
    }
    const grouped = new Map<string, RuntimeGroup>()
    for (const row of sourceRows) {
      const rawKey = request.groupBy.map(
        (fieldId) => row.fields[fieldId] ?? null
      )
      const identity = groupIdentity(rawKey, groupTypes)
      const existing = grouped.get(identity)
      if (existing) {
        existing.rows.push(row)
      } else {
        grouped.set(identity, {
          identity,
          rawKey,
          key: rawKey.map((value, index) =>
            value === null
              ? null
              : publicAggregateValue(value, groupTypes[index]!)
          ),
          rows: [row],
        })
      }
    }
    const ordered = Array.from(grouped.values()).sort((left, right) =>
      compareGroupKeys(left.rawKey, right.rawKey, groupTypes)
    )
    const metadata = this.core.info()
    const projectionDigest = await projectionHash(request.projection)
    const bindingDigest = await groupBindingHash(request)
    const direction = request.direction ?? "forward"
    let boundary = direction === "forward" ? -1 : ordered.length
    if (request.cursor !== undefined) {
      const cursor = this.decodeCursor(request.cursor, "groups")
      if (
        cursor.fileId !== metadata.fileId ||
        cursor.tableId !== request.tableId ||
        cursor.bindingHash !== bindingDigest ||
        cursor.projectionHash !== projectionDigest ||
        typeof cursor.groupIdentity !== "string"
      ) {
        throw runtimeError("invalid-query", "Group cursor binding mismatch")
      }
      if (cursor.revision !== String(metadata.revision)) {
        throw runtimeError("stale-revision", "Group cursor revision is stale", {
          currentRevision: String(metadata.revision),
        })
      }
      boundary = ordered.findIndex(
        (entry) => entry.identity === cursor.groupIdentity
      )
      if (boundary < 0) {
        throw runtimeError("invalid-query", "Group cursor boundary is invalid")
      }
    }
    const start =
      direction === "forward"
        ? boundary + 1
        : Math.max(0, boundary - request.groupLimit)
    const end =
      direction === "forward"
        ? Math.min(ordered.length, start + request.groupLimit)
        : boundary
    const selected = ordered.slice(start, end)
    const visibleRowIds = selected.flatMap((group) =>
      group.rows.slice(0, request.rowsPerGroup).map((row) => row.id)
    )
    let projectionRows = new Map(sourceRows.map((row) => [row.id, row]))
    if (request.projection.resolveRelations.length > 0) {
      projectionRows = new Map(
        this.fetchRowsByIds(
          request.tableId,
          visibleRowIds,
          request.projection
        ).map((row) => [row.id, row])
      )
    }
    const columns = this.columns(request.tableId, request.projection)
    const cursorForGroup = (group: RuntimeGroup | undefined) =>
      group
        ? this.encodeCursor("groups", {
            fileId: metadata.fileId,
            tableId: request.tableId,
            revision: String(metadata.revision),
            projectionHash: projectionDigest,
            bindingHash: bindingDigest,
            groupIdentity: group.identity,
          })
        : null
    return {
      fileId: metadata.fileId,
      tableId: request.tableId,
      revision: String(metadata.revision),
      projectionHash: projectionDigest,
      columns,
      groups: selected.map((group) => {
        const visible = group.rows.slice(0, request.rowsPerGroup)
        const projected = visible.map(
          (row) => projectionRows.get(row.id) ?? row
        )
        const groupedQuery = queryForGroup(
          request.query,
          request.groupBy,
          group.key
        )
        const backwardGroupedQuery = reverseRuntimeQuery(
          groupedQuery,
          this.core.listFields(request.tableId)
        )
        const rowCursor = (row: EidosFileLogicalRow) =>
          this.encodeCursor("group-rows", {
            fileId: metadata.fileId,
            tableId: request.tableId,
            revision: String(metadata.revision),
            projectionHash: projectionDigest,
            bindingHash: bindingDigest,
            request: groupCursorSource(request),
            groupKey: group.key,
            forward: this.core.createRowCursor(
              request.tableId,
              this.compatibilityQuery(request.tableId, groupedQuery),
              row
            ),
            backward: this.core.createRowCursor(
              request.tableId,
              this.compatibilityQuery(request.tableId, backwardGroupedQuery),
              row
            ),
          })
        return {
          key: group.key,
          count: String(group.rows.length),
          aggregates: aggregateResultsForRows(
            request.aggregates,
            fieldsById,
            group.rows
          ),
          rows: this.projectRows(
            request.tableId,
            request.projection,
            projected,
            columns
          ),
          nextRowCursor:
            visible.length < group.rows.length && visible.length > 0
              ? rowCursor(visible.at(-1)!)
              : null,
        }
      }),
      nextCursor: end < ordered.length ? cursorForGroup(selected.at(-1)) : null,
      previousCursor: start > 0 ? cursorForGroup(selected[0]) : null,
    }
  }

  private async getRowsByIdDirect(
    tableId: string,
    rowIds: string[],
    projection: ProjectionSpec
  ): Promise<RowBatch> {
    const rows = this.fetchRowsByIds(tableId, rowIds, projection)
    const found = new Set(rows.map((row) => row.id))
    const metadata = this.core.info()
    const columns = this.columns(tableId, projection)
    return {
      fileId: metadata.fileId,
      tableId,
      revision: String(metadata.revision),
      projectionHash: await projectionHash(projection),
      columns,
      rows: this.projectRows(tableId, projection, rows, columns),
      missingRowIds: rowIds.filter((id) => !found.has(id)),
    }
  }

  private fetchRowsByIds(
    tableId: string,
    rowIds: string[],
    projection: ProjectionSpec
  ): EidosFileLogicalRow[] {
    if (rowIds.length === 0) return []
    const rowIdField = this.core
      .listFields(tableId)
      .find((field) => field.systemRole === "row-id" || field.type === "row-id")
    if (!rowIdField?.id) {
      throw runtimeError("corrupt-file", "Table is missing its Row-ID Field")
    }
    const found = new Map<string, EidosFileLogicalRow>()
    for (
      let offset = 0;
      offset < rowIds.length;
      offset += EIDOS_RUNTIME_LIMITS.rowsByIdMax
    ) {
      const ids = rowIds.slice(
        offset,
        offset + EIDOS_RUNTIME_LIMITS.rowsByIdMax
      )
      const rows = this.core.queryRows(tableId, {
        fields: projection.fields,
        query: this.compatibilityQuery(tableId, {
          filter: { op: "in", fieldId: rowIdField.id, values: ids },
        }),
        limit: ids.length,
        resolveRelations: projection.resolveRelations.length > 0,
      }).rows
      for (const row of rows) found.set(row.id, row)
    }
    return rowIds.flatMap((rowId) => {
      const row = found.get(rowId)
      return row ? [row] : []
    })
  }

  private allViews() {
    return this.core
      .listTables()
      .flatMap((table) => this.core.listViews(table.id))
  }

  private analyzeSchemaChange(change: SchemaChange): {
    classification: SchemaPreflightResult["classification"]
    dependencies: SchemaPreflightResult["dependencies"]
    warnings: RuntimeDiagnostic[]
    affectedRows: string
    valueChanges: SchemaPreflightResult["valueChanges"]
  } {
    const leaves =
      change.kind === "batch" ? change.changes : [change as SchemaLeafChange]
    if (leaves.length === 0) {
      throw runtimeError("invalid-request", "Schema batch must be non-empty")
    }
    const dependencies = new Map<
      string,
      SchemaPreflightResult["dependencies"][number]
    >()
    const warnings: RuntimeDiagnostic[] = []
    let classification: SchemaPreflightResult["classification"] =
      "metadata-only"
    let affectedRows = 0n
    const valueChanges: SchemaPreflightResult["valueChanges"] = []
    const forbid = (
      code: RuntimeDiagnostic["code"],
      message: string,
      members: Partial<RuntimeDiagnostic> = {}
    ) => {
      classification = "forbidden"
      warnings.push({ code, severity: "error", message, ...members })
    }
    const lossy = (
      message: string,
      members: Partial<RuntimeDiagnostic> = {}
    ) => {
      if (classification !== "forbidden") classification = "explicit-lossy"
      warnings.push({
        code: "object-delete-loss",
        severity: "warning",
        message,
        ...members,
      })
    }
    const tableIds = new Set(this.core.listTables().map((table) => table.id))
    const fields = this.core
      .listTables()
      .flatMap((table) => this.core.listFields(table.id))
    const fieldsById = new Map(fields.map((field) => [field.id!, field]))
    const proposedFields = new Map<string, EidosFileFieldInfo>(
      fields.map((field) => [
        field.id!,
        {
          ...field,
          settings: { ...(field.settings ?? {}) },
          property: field.property ? { ...field.property } : null,
        },
      ])
    )
    const tableNames = new Map(
      this.core.listTables().map((table) => [table.id, table.name])
    )
    let syntheticField = 0
    let rewrittenFormulaSources = 0
    for (const leaf of leaves) {
      switch (leaf.kind) {
        case "create-table": {
          const tableId = `new-table:${leaf.clientKey}`
          tableNames.set(tableId, leaf.name)
          for (const system of simulatedSystemFields(tableId, leaf.name))
            proposedFields.set(system.id!, system)
          for (const field of leaf.fields) {
            const candidate = simulatedNewField(
              tableId,
              leaf.name,
              field,
              ++syntheticField
            )
            proposedFields.set(candidate.id!, candidate)
          }
          break
        }
        case "delete-table":
          for (const [id, field] of proposedFields) {
            if (field.tableId === leaf.tableId) proposedFields.delete(id)
          }
          tableNames.delete(leaf.tableId)
          break
        case "create-field": {
          const candidate = simulatedNewField(
            leaf.tableId,
            tableNames.get(leaf.tableId) ?? leaf.tableId,
            leaf.field,
            ++syntheticField
          )
          proposedFields.set(candidate.id!, candidate)
          break
        }
        case "delete-field":
          proposedFields.delete(leaf.fieldId)
          break
        case "rename-field": {
          const candidate = proposedFields.get(leaf.fieldId)
          if (!candidate) break
          const oldName = candidate.name
          for (const formula of proposedFields.values()) {
            if (
              formula.tableId !== candidate.tableId ||
              formula.type !== "formula"
            )
              continue
            const source = String(formula.property?.formula ?? "")
            const rewritten = rewriteEidosFileFormulaFieldReferences(
              source,
              oldName,
              leaf.name
            )
            if (rewritten !== source) {
              formula.property = {
                ...(formula.property ?? {}),
                formula: rewritten,
              }
              rewrittenFormulaSources += 1
            }
          }
          candidate.name = leaf.name
          break
        }
        case "set-formula": {
          const candidate = proposedFields.get(leaf.fieldId)
          if (candidate?.type === "formula") {
            candidate.property = {
              ...(candidate.property ?? {}),
              formula: leaf.definition.sourceText,
              displayType: leaf.definition.resultType,
            }
          }
          break
        }
        case "set-lookup": {
          const candidate = proposedFields.get(leaf.fieldId)
          if (candidate?.type === "lookup") {
            candidate.property = {
              ...(candidate.property ?? {}),
              relationField: leaf.definition.relationFieldId,
              targetField: leaf.definition.targetFieldId,
              aggregate: leaf.definition.aggregate,
              distinct: leaf.definition.distinctValues,
            }
          }
          break
        }
        case "set-relation": {
          const candidate = proposedFields.get(leaf.fieldId)
          if (candidate?.type === "relation") {
            candidate.property = simulatedRelationProperty(leaf.definition)
            candidate.physicalName =
              leaf.definition.direction === "forward"
                ? (candidate.physicalName ?? candidate.tableColumnName)
                : null
          }
          break
        }
        case "convert-field": {
          const candidate = proposedFields.get(leaf.fieldId)
          if (candidate) {
            candidate.type = leaf.to
            candidate.property =
              leaf.to === "relation"
                ? simulatedRelationProperty(leaf.definition)
                : null
            candidate.storageCodec =
              leaf.to === "relation"
                ? "relation"
                : leaf.to === "file" || leaf.to === "multi-select"
                  ? "json_array"
                  : "scalar"
            candidate.valueKind = leaf.to === "relation" ? "relation" : "source"
          }
          break
        }
      }
    }
    for (let pass = 0; pass < proposedFields.size; pass += 1) {
      let changed = false
      for (const field of proposedFields.values()) {
        if (field.type !== "lookup" || !field.property) continue
        const target = proposedFields.get(String(field.property.targetField))
        if (!target) continue
        const displayType = eidosFileLookupDisplayType(
          String(field.property.aggregate) as EidosFileLookupAggregate,
          target
        )
        const valueType = eidosFileLookupValueType(
          String(field.property.aggregate) as EidosFileLookupAggregate,
          target
        )
        if (
          field.property.displayType !== displayType ||
          JSON.stringify(field.property.valueType) !== JSON.stringify(valueType)
        ) {
          field.property.displayType = displayType
          field.property.valueType = valueType
          changed = true
        }
      }
      if (!changed) break
    }
    const proposedByTable = new Map<string, EidosFileFieldInfo[]>()
    for (const field of proposedFields.values()) {
      const owner = proposedByTable.get(field.tableId) ?? []
      owner.push(field)
      proposedByTable.set(field.tableId, owner)
    }
    const dependencyGraph = new Map<string, Set<string>>()
    for (const field of proposedFields.values())
      dependencyGraph.set(field.id!, new Set())
    for (const [tableId, tableFields] of proposedByTable) {
      const names = new Map<string, string>()
      for (const field of tableFields) {
        const folded = asciiNoCase(field.name)
        const duplicate = names.get(folded)
        if (duplicate && duplicate !== field.id) {
          forbid("semantic-field-invalid", "Field names are not unique", {
            tableId,
            fieldId: field.id,
          })
        } else names.set(folded, field.id!)
      }
      try {
        for (const compiled of compileEidosFileFormulaFields(tableFields)) {
          for (const dependency of compiled.dependencyFieldIds) {
            dependencyGraph.get(dependency)?.add(compiled.field.id!)
          }
        }
      } catch (error) {
        forbid(
          "formula-type-invalid",
          error instanceof Error ? error.message : "Invalid Formula",
          { tableId }
        )
      }
    }
    for (const field of proposedFields.values()) {
      if (field.type === "lookup") {
        const relationId = String(field.property?.relationField ?? "")
        const targetId = String(field.property?.targetField ?? "")
        const aggregate = String(field.property?.aggregate ?? "")
        const relation = proposedFields.get(relationId)
        const target = proposedFields.get(targetId)
        const targetTableId = String(relation?.property?.targetTableId ?? "")
        if (
          relation?.type !== "relation" ||
          relation.tableId !== field.tableId ||
          !target ||
          target.tableId !== targetTableId ||
          ![
            "values",
            "first",
            "count",
            "sum",
            "average",
            "min",
            "max",
          ].includes(aggregate) ||
          !eidosFileLookupAggregateSupportsTarget(
            aggregate as EidosFileLookupAggregate,
            target
          )
        ) {
          forbid("lookup-invalid", `Lookup ${field.name} is invalid`, {
            tableId: field.tableId,
            fieldId: field.id,
          })
        }
        dependencyGraph.get(relationId)?.add(field.id!)
        dependencyGraph.get(targetId)?.add(field.id!)
      } else if (
        field.type === "relation" &&
        field.property?.direction === "inverse"
      ) {
        const sourceId = String(field.property.sourceFieldId ?? "")
        dependencyGraph.get(sourceId)?.add(field.id!)
      }
    }
    const cycle = smallestDependencyCycle(dependencyGraph)
    if (cycle) {
      forbid("semantic-cycle", "Derived Field dependency cycle", {
        relatedFieldIds: cycle,
      })
    }
    if (rewrittenFormulaSources > 0) classification = "lossless-rewrite"
    for (const leaf of leaves) {
      if ("position" in leaf) parseSignedInt64(leaf.position, "position")
      switch (leaf.kind) {
        case "create-table":
          if (
            leaf.fields.some(
              (field) => field.kind === "relation" || field.kind === "lookup"
            )
          ) {
            forbid(
              "relation-definition-invalid",
              "Relation and Lookup Fields cannot be created inside create-table"
            )
          }
          break
        case "set-file-title":
          assertEidosFileDisplayName(leaf.title, "File title")
          break
        case "set-default-table":
          if (leaf.tableId !== null && !tableIds.has(leaf.tableId)) {
            forbid("dependency-blocked", "Default Table does not exist")
          }
          break
        case "delete-table": {
          if (!tableIds.has(leaf.tableId)) {
            forbid("dependency-blocked", "Table does not exist", {
              tableId: leaf.tableId,
            })
            break
          }
          const metadata = this.core.info()
          if (metadata.defaultTableId === leaf.tableId) {
            forbid(
              "dependency-blocked",
              "Clear or retarget the default Table before deletion",
              { tableId: leaf.tableId }
            )
          }
          lossy("Deleting a Table removes its rows and Fields", {
            tableId: leaf.tableId,
          })
          affectedRows += BigInt(this.core.countRows(leaf.tableId))
          dependencies.set("table:" + leaf.tableId, {
            object: "table",
            id: leaf.tableId,
          })
          for (const field of this.core.listFields(leaf.tableId)) {
            dependencies.set("field:" + field.id, {
              object: "field",
              id: field.id!,
            })
          }
          for (const view of this.core.listViews(leaf.tableId)) {
            dependencies.set("view:" + view.id, {
              object: "view",
              id: view.id,
            })
          }
          break
        }
        case "rename-table":
        case "set-table-settings":
        case "set-table-position":
          if (!tableIds.has(leaf.tableId)) {
            forbid("dependency-blocked", "Table does not exist", {
              tableId: leaf.tableId,
            })
          }
          break
        case "create-field":
          if (!tableIds.has(leaf.tableId)) {
            forbid("dependency-blocked", "Owning Table does not exist", {
              tableId: leaf.tableId,
            })
          }
          if (
            leaf.field.kind !== "formula" &&
            leaf.field.kind !== "lookup" &&
            leaf.field.kind !== "relation" &&
            leaf.field.nullable === false &&
            this.core.countRows(leaf.tableId) > 0
          ) {
            forbid(
              "non-nullability-blocked",
              "A populated Table cannot add a non-null scalar Field",
              { tableId: leaf.tableId }
            )
          }
          // ADD COLUMN with the canonical list default changes the physical
          // schema but does not rewrite any existing logical row value. The
          // schema plan classification is therefore metadata-only.
          break
        case "delete-field": {
          const field = fieldsById.get(leaf.fieldId)
          if (!field) {
            forbid("dependency-blocked", "Field does not exist", {
              fieldId: leaf.fieldId,
            })
            break
          }
          if (field.systemRole) {
            forbid("dependency-blocked", "System Fields cannot be deleted", {
              fieldId: leaf.fieldId,
            })
          } else {
            lossy("Deleting a Field removes its values", {
              tableId: field.tableId,
              fieldId: leaf.fieldId,
            })
            affectedRows += BigInt(this.core.countRows(field.tableId))
          }
          dependencies.set("field:" + leaf.fieldId, {
            object: "field",
            id: leaf.fieldId,
          })
          break
        }
        case "rename-field":
        case "set-field-settings":
        case "set-field-position":
        case "set-formula":
        case "set-lookup":
        case "set-relation":
        case "rename-option":
          if (!fieldsById.has(leaf.fieldId)) {
            forbid("dependency-blocked", "Field does not exist", {
              fieldId: leaf.fieldId,
            })
          }
          if (
            leaf.kind === "rename-option" &&
            leaf.collision === "merge" &&
            !warnings.some((warning) => warning.severity === "error")
          ) {
            classification = "explicit-lossy"
            warnings.push({
              code: "option-merge-loss",
              severity: "warning",
              fieldId: leaf.fieldId,
              message: "Option values may merge",
            })
          }
          break
        case "set-record-label":
          if (
            !tableIds.has(leaf.tableId) ||
            fieldsById.get(leaf.fieldId)?.tableId !== leaf.tableId
          ) {
            forbid("record-label-blocked", "Record Label Field is invalid", {
              tableId: leaf.tableId,
              fieldId: leaf.fieldId,
            })
          }
          break
        case "set-field-nullable": {
          const field = fieldsById.get(leaf.fieldId)
          if (!field || field.systemRole || !field.physicalName) {
            forbid(
              "non-nullability-blocked",
              "Only stored scalar/JSON Fields support nullable changes",
              { fieldId: leaf.fieldId }
            )
          } else if (leaf.nullable === false) {
            const table = this.core.getTable(field.tableId)
            const nulls = this.core.connection.get<{ count: number | bigint }>(
              "SELECT count(*) AS count FROM " +
                quoteSqlIdentifier(table.physicalName ?? table.rawTableName) +
                " WHERE " +
                quoteSqlIdentifier(field.physicalName) +
                " IS NULL"
            )?.count
            if (BigInt(nulls ?? 0) > 0n) {
              forbid(
                "non-nullability-blocked",
                "Existing SQL NULL values block non-nullability",
                { tableId: field.tableId, fieldId: leaf.fieldId }
              )
            }
          }
          break
        }
        case "convert-field": {
          const field = fieldsById.get(leaf.fieldId)
          if (
            !field ||
            field.systemRole ||
            !field.physicalName ||
            ["formula", "lookup"].includes(field.type)
          ) {
            forbid(
              "conversion-domain-invalid",
              "Only stored user Fields support convert-field",
              { fieldId: leaf.fieldId }
            )
            break
          }
          const conversion = this.conversionPlan(leaf)
          if (conversion.classification === "forbidden") {
            forbid(
              "conversion-domain-invalid",
              conversion.error ?? "Stored values cannot be converted",
              { tableId: field.tableId, fieldId: leaf.fieldId }
            )
            break
          }
          classification = highestSchemaClassification(
            classification,
            conversion.classification
          )
          affectedRows += BigInt(conversion.affectedRows)
          valueChanges.push(
            ...conversion.valueChanges.map((change) => ({
              ...change,
              tableId: field.tableId,
              fieldId: leaf.fieldId,
            }))
          )
          break
        }
      }
    }
    const orderedDependencies = Array.from(dependencies.values()).sort(
      (left, right) => {
        const order = { table: 0, field: 1, view: 2 }
        return (
          order[left.object] - order[right.object] ||
          binaryCompare(left.id, right.id)
        )
      }
    )
    return {
      classification,
      dependencies: orderedDependencies,
      warnings,
      affectedRows: String(affectedRows),
      valueChanges,
    }
  }

  private conversionPlan(
    change: Extract<SchemaLeafChange, { kind: "convert-field" }>
  ): CanonicalConversionPlan {
    const field = this.field(change.fieldId)
    if (!field.physicalName) {
      return {
        classification: "forbidden",
        rows: [],
        affectedRows: "0",
        valueChanges: [],
        error: "Virtual and inverse Fields cannot be converted",
      }
    }
    const table = this.core.getTable(field.tableId)
    const rows = this.core.connection.query<{
      id: string
      value: EidosFileSqlPrimitive
    }>(
      `SELECT "_id" AS id, ${quoteSqlIdentifier(field.physicalName)} AS value
         FROM ${quoteSqlIdentifier(table.physicalName ?? table.rawTableName)}
        ORDER BY "_id" COLLATE BINARY`
    )
    let relationIds: Set<string> | undefined
    if (change.to === "relation") {
      const target = this.core.getTable(change.definition.targetTableId)
      relationIds = new Set(
        this.core.connection
          .query<{ id: string }>(
            `SELECT "_id" AS id FROM ${quoteSqlIdentifier(
              target.physicalName ?? target.rawTableName
            )}`
          )
          .map((row) => row.id)
      )
    }
    return planCanonicalFieldConversion({
      from: field.type as StoredFieldType,
      to: change.to,
      toNullable: "toNullable" in change ? change.toNullable : false,
      policies: change.policies,
      rows,
      ...(relationIds
        ? { relationIdValid: (id: string) => relationIds!.has(id) }
        : {}),
      ...(change.to === "relation"
        ? { relationCardinality: change.definition.cardinality }
        : {}),
    })
  }

  private applySchemaChange(
    change: SchemaChange,
    createdObjects: CreatedSchemaObject[],
    affectedTableIds: Set<string>,
    affectedFieldIds: Set<string>
  ): void {
    const leaves =
      change.kind === "batch" ? change.changes : [change as SchemaLeafChange]
    for (const leaf of leaves) {
      switch (leaf.kind) {
        case "create-table": {
          const table = this.core.createTable({
            name: leaf.name,
            createDefaultView: false,
            fields: leaf.fields.map(newFieldInput),
          })
          affectedTableIds.add(table.id)
          const fields = this.core.listFields(table.id)
          createdObjects.push({
            id: table.id,
            object: "table",
            clientKey: leaf.clientKey,
          })
          for (const field of fields) {
            if (field.systemRole) {
              createdObjects.push({
                id: field.id!,
                object: "field",
                systemRole: field.systemRole,
              })
            } else {
              const source = leaf.fields.find(
                (candidate) => candidate.name === field.name
              )
              if (source) {
                createdObjects.push({
                  id: field.id!,
                  object: "field",
                  clientKey: source.clientKey,
                })
              }
            }
            affectedFieldIds.add(field.id!)
          }
          this.core.connection.run(
            "UPDATE eidos__tables SET position=?, settings_json=? WHERE id=?",
            [
              parseSignedInt64(leaf.position, "position"),
              canonicalizeEidosFileJson(leaf.settings ?? {}),
              table.id,
            ]
          )
          for (const source of leaf.fields) {
            const field = fields.find((entry) => entry.name === source.name)
            if (!field) continue
            this.core.connection.run(
              "UPDATE eidos__fields SET position=?, settings_json=? WHERE id=?",
              [
                parseSignedInt64(source.position, "position"),
                canonicalizeEidosFileJson(source.settings ?? {}),
                field.id!,
              ]
            )
          }
          if (leaf.labelFieldClientKey) {
            const source = leaf.fields.find(
              (field) => field.clientKey === leaf.labelFieldClientKey
            )
            const label = source
              ? fields.find((field) => field.name === source.name)
              : undefined
            if (!label?.id) {
              throw runtimeError(
                "invalid-request",
                "labelFieldClientKey does not identify a supplied Field"
              )
            }
            this.core.updateField(table.id, label.id, { isRecordLabel: true })
          }
          break
        }
        case "set-file-title":
          this.core.connection.run(
            "UPDATE eidos__meta SET title=? WHERE singleton=1",
            [assertEidosFileDisplayName(leaf.title, "File title")]
          )
          break
        case "set-default-table":
          this.core.connection.run(
            "UPDATE eidos__meta SET default_table_id=? WHERE singleton=1",
            [leaf.tableId]
          )
          break
        case "delete-table":
          this.core.deleteTable(leaf.tableId)
          affectedTableIds.add(leaf.tableId)
          break
        case "rename-table":
          this.core.updateTable(leaf.tableId, { name: leaf.name })
          affectedTableIds.add(leaf.tableId)
          break
        case "set-table-settings":
          this.core.connection.run(
            "UPDATE eidos__tables SET settings_json=? WHERE id=?",
            [canonicalizeEidosFileJson(leaf.settings), leaf.tableId]
          )
          affectedTableIds.add(leaf.tableId)
          break
        case "set-table-position":
          this.core.connection.run(
            "UPDATE eidos__tables SET position=? WHERE id=?",
            [parseSignedInt64(leaf.position, "position"), leaf.tableId]
          )
          affectedTableIds.add(leaf.tableId)
          break
        case "create-field": {
          const field = this.core.addField(
            leaf.tableId,
            newFieldInput(leaf.field)
          )
          this.core.connection.run(
            "UPDATE eidos__fields SET position=?, settings_json=? WHERE id=?",
            [
              parseSignedInt64(leaf.field.position, "position"),
              canonicalizeEidosFileJson(leaf.field.settings ?? {}),
              field.id!,
            ]
          )
          createdObjects.push({
            id: field.id!,
            object: "field",
            clientKey: leaf.field.clientKey,
          })
          affectedTableIds.add(leaf.tableId)
          affectedFieldIds.add(field.id!)
          break
        }
        case "delete-field": {
          const field = this.field(leaf.fieldId)
          if (field.isRecordLabel && leaf.replacementLabelFieldId) {
            this.core.updateField(field.tableId, leaf.replacementLabelFieldId, {
              isRecordLabel: true,
            })
          }
          this.core.deleteField(field.tableId, leaf.fieldId)
          affectedTableIds.add(field.tableId)
          affectedFieldIds.add(leaf.fieldId)
          break
        }
        case "rename-field": {
          const field = this.field(leaf.fieldId)
          this.core.updateField(field.tableId, leaf.fieldId, {
            name: leaf.name,
          })
          affectedTableIds.add(field.tableId)
          affectedFieldIds.add(leaf.fieldId)
          break
        }
        case "set-field-settings": {
          const field = this.field(leaf.fieldId)
          this.core.connection.run(
            "UPDATE eidos__fields SET settings_json=? WHERE id=?",
            [canonicalizeEidosFileJson(leaf.settings), leaf.fieldId]
          )
          affectedTableIds.add(field.tableId)
          affectedFieldIds.add(leaf.fieldId)
          break
        }
        case "set-field-position": {
          const field = this.field(leaf.fieldId)
          this.core.connection.run(
            "UPDATE eidos__fields SET position=? WHERE id=?",
            [parseSignedInt64(leaf.position, "position"), leaf.fieldId]
          )
          affectedTableIds.add(field.tableId)
          affectedFieldIds.add(leaf.fieldId)
          break
        }
        case "set-record-label":
          this.core.updateField(leaf.tableId, leaf.fieldId, {
            isRecordLabel: true,
          })
          affectedTableIds.add(leaf.tableId)
          affectedFieldIds.add(leaf.fieldId)
          break
        case "set-formula": {
          const field = this.field(leaf.fieldId)
          this.core.updateField(field.tableId, leaf.fieldId, {
            property: {
              ...(field.settings ?? {}),
              formula: leaf.definition.sourceText,
              displayType: leaf.definition.resultType,
            },
          })
          affectedTableIds.add(field.tableId)
          affectedFieldIds.add(leaf.fieldId)
          break
        }
        case "set-lookup": {
          const field = this.field(leaf.fieldId)
          this.core.updateField(field.tableId, leaf.fieldId, {
            property: {
              ...(field.settings ?? {}),
              relationField: leaf.definition.relationFieldId,
              targetField: leaf.definition.targetFieldId,
              aggregate: leaf.definition.aggregate,
              distinct: leaf.definition.distinctValues,
            },
          })
          affectedTableIds.add(field.tableId)
          affectedFieldIds.add(leaf.fieldId)
          break
        }
        case "set-relation": {
          const field = this.field(leaf.fieldId)
          this.core.updateField(field.tableId, leaf.fieldId, {
            property:
              leaf.definition.direction === "forward"
                ? {
                    ...(field.settings ?? {}),
                    direction: "forward",
                    targetTableId: leaf.definition.targetTableId,
                    cardinality: leaf.definition.cardinality,
                    onDelete: leaf.definition.onDelete,
                  }
                : {
                    ...(field.settings ?? {}),
                    direction: "inverse",
                    targetTableId: leaf.definition.targetTableId,
                    sourceFieldId: leaf.definition.inverseOfFieldId,
                    cardinality: "many",
                  },
          })
          affectedTableIds.add(field.tableId)
          affectedFieldIds.add(leaf.fieldId)
          break
        }
        case "rename-option": {
          const field = this.field(leaf.fieldId)
          this.core.updateField(field.tableId, leaf.fieldId, {
            optionValueChanges: [{ from: leaf.from, to: leaf.to }],
          })
          affectedTableIds.add(field.tableId)
          affectedFieldIds.add(leaf.fieldId)
          break
        }
        case "set-field-nullable": {
          const field = this.field(leaf.fieldId)
          this.core.setFieldNullable(leaf.fieldId, leaf.nullable)
          affectedTableIds.add(field.tableId)
          affectedFieldIds.add(leaf.fieldId)
          break
        }
        case "convert-field": {
          const field = this.field(leaf.fieldId)
          const conversion = this.conversionPlan(leaf)
          if (conversion.classification === "forbidden") {
            throw runtimeError(
              "forbidden",
              conversion.error ?? "Conversion predicates no longer hold"
            )
          }
          this.core.convertStoredField(
            leaf.fieldId,
            leaf.to,
            "toNullable" in leaf ? leaf.toNullable : false,
            conversion.rows,
            leaf.to === "relation"
              ? {
                  targetTableId: leaf.definition.targetTableId,
                  cardinality: leaf.definition.cardinality,
                  onDelete: leaf.definition.onDelete,
                }
              : undefined
          )
          affectedTableIds.add(field.tableId)
          affectedFieldIds.add(leaf.fieldId)
          break
        }
      }
    }
  }

  private field(fieldId: string): EidosFileFieldInfo {
    for (const table of this.core.listTables()) {
      const field = this.core
        .listFields(table.id)
        .find((candidate) => candidate.id === fieldId)
      if (field) return field
    }
    throw runtimeError("not-found", "Field not found", { fieldId })
  }

  private retainedSchemaPlan(token: string): RetainedSchemaPlan {
    const plan = this.schemaPlans.get(token)
    if (!plan) throw runtimeError("plan-expired", "Schema plan is not retained")
    if (this.environment.clock.nowMilliseconds() > plan.expiresAtMonotonic) {
      this.schemaPlans.delete(token)
      throw runtimeError("plan-expired", "Schema plan expired")
    }
    return plan
  }

  private evictSchemaPlans(incomingBytes = 0): void {
    const now = this.environment.clock.nowMilliseconds()
    for (const [token, plan] of this.schemaPlans) {
      if (now > plan.expiresAtMonotonic) this.schemaPlans.delete(token)
    }
    const retainedBytes = () =>
      Array.from(this.schemaPlans.values()).reduce(
        (total, plan) => total + jcsByteLength(plan),
        0
      )
    while (
      this.schemaPlans.size >= EIDOS_RUNTIME_LIMITS.schemaPlanEntriesMax ||
      retainedBytes() + incomingBytes > EIDOS_RUNTIME_LIMITS.schemaPlanBytesMax
    ) {
      const oldest = Array.from(this.schemaPlans.values()).sort(
        (left, right) => left.createdAtSequence - right.createdAtSequence
      )[0]
      if (!oldest) break
      this.schemaPlans.delete(oldest.token)
    }
  }

  private allocateFileEntry(request: {
    name: string
    mediaType: string
    size: string
    uri: string
    extensions?: Record<string, JsonValue>
  }): FileEntry {
    const extensions = request.extensions ?? {}
    for (const key of ["id", "name", "mediaType", "size", "uri"]) {
      if (Object.prototype.hasOwnProperty.call(extensions, key)) {
        throw runtimeError(
          "invalid-request",
          "File entry extension collides with required member",
          { path: "/extensions/" + key }
        )
      }
    }
    const candidate = {
      ...extensions,
      id: this.generator.next(),
      name: request.name,
      mediaType: request.mediaType,
      size: request.size,
      uri: request.uri,
    }
    try {
      return assertEidosFileValues([candidate])[0] as FileEntry
    } catch (error) {
      throw runtimeError(
        "invalid-value",
        error instanceof Error ? error.message : "Invalid File entry"
      )
    }
  }

  private read<T>(operation: () => T): T {
    return this.connection.transaction("read", operation)
  }

  private async withCommitBarrier<
    T extends { fileId: string; revision: string; changed: boolean },
  >(
    operation: CommitReconciliation["operation"],
    baseRevision: string,
    context: RequestContext,
    execute: () => T | Promise<T>,
    reconciliation: (result: T) => CommitReconciliation
  ): Promise<T> {
    const barrier = this.environment.transportCommitBarrier
    if (!barrier) return execute()
    return this.connection.transaction("write", async () => {
      const result = await execute()
      if (result.changed) {
        const record = reconciliation(result)
        if (record.operation !== operation) {
          throw runtimeError(
            "fatal",
            "Commit reconciliation operation mismatch"
          )
        }
        assertJcsBytes(
          record,
          EIDOS_RUNTIME_LIMITS.responseBytesMax,
          "Commit reconciliation"
        )
        await barrier.prepare(
          {
            fileID: result.fileId,
            baseRevision,
            commitRevision: result.revision,
            reconciliation: record,
          },
          context
        )
      }
      return result
    })
  }

  private assertWritable(operation: string): void {
    if (!this.writable) {
      throw runtimeError("unsupported", operation + " is unavailable read-only")
    }
  }

  private invoke<T>(
    context: RequestContext,
    operation: () => T | Promise<T>,
    allowClosing = false,
    requestPayload?: unknown,
    accountResponse = true
  ): Promise<T> {
    try {
      assertRequestContext(context)
      if (requestPayload !== undefined) {
        assertJcsBytes(
          requestPayload,
          EIDOS_RUNTIME_LIMITS.requestBytesMax,
          "Runtime request"
        )
      }
    } catch (error) {
      return Promise.reject(mapRuntimeFailure(error))
    }
    if (
      this.state === "closed" ||
      this.state === "fatal" ||
      (!allowClosing && this.state !== "open")
    ) {
      return Promise.reject(
        runtimeError(
          this.state === "fatal" ? "fatal" : "closed",
          "Runtime is closed"
        )
      )
    }
    if (this.requestControls.has(context.requestId)) {
      return Promise.reject(
        runtimeError("invalid-request", "requestId is already unresolved", {
          path: "/requestId",
        })
      )
    }
    const acceptedAt = this.environment.clock.nowMilliseconds()
    const control: RequestControl = {
      cancelled: context.signal?.aborted === true,
      unsubscribe: () => undefined,
    }
    control.unsubscribe =
      context.signal?.onAbort(() => {
        control.cancelled = true
      }) ?? (() => undefined)
    this.requestControls.set(context.requestId, control)
    const execute = async () => {
      try {
        if (!allowClosing) this.checkControl(context, control, acceptedAt)
        const result = await operation()
        if (result !== undefined && accountResponse) {
          assertJcsBytes(
            result,
            EIDOS_RUNTIME_LIMITS.responseBytesMax,
            "Runtime response"
          )
        }
        return result
      } catch (error) {
        const failure = mapRuntimeFailure(error)
        if (failure.code === "fatal" || failure.code === "unknown-commit") {
          this.state = "fatal"
        }
        throw failure
      } finally {
        control.unsubscribe()
        this.requestControls.delete(context.requestId)
      }
    }
    const result = this.queue.then(execute, execute)
    this.queue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  private checkControl(
    context: RequestContext,
    control: RequestControl,
    acceptedAt: number
  ): void {
    if (control.cancelled) {
      throw runtimeError("cancelled", "Request was cancelled", {
        retryable: true,
      })
    }
    const elapsed = this.environment.clock.nowMilliseconds() - acceptedAt
    const budget = Math.min(
      context.deadlineMilliseconds ?? EIDOS_RUNTIME_LIMITS.foregroundTimeMsMax,
      EIDOS_RUNTIME_LIMITS.foregroundTimeMsMax
    )
    if (!Number.isFinite(elapsed) || elapsed < 0) {
      this.state = "fatal"
      throw runtimeError("fatal", "Monotonic clock moved backward")
    }
    if (elapsed > budget) {
      throw runtimeError("deadline-exceeded", "Request deadline exceeded", {
        retryable: true,
      })
    }
  }

  private encodeCursor(kind: string, value: JsonObject): string {
    const payload = canonicalizeEidosFileJson({
      version: 1,
      epoch: this.epoch,
      kind,
      ...value,
    })
    return encodeURIComponent(
      payload + "." + cursorMac(this.cursorSecret, payload)
    )
  }

  private decodeCursor(cursor: string, kind: string): JsonObject {
    try {
      const envelope = decodeURIComponent(cursor)
      const separator = envelope.lastIndexOf(".")
      if (separator < 1) throw new Error("cursor authentication missing")
      const payload = envelope.slice(0, separator)
      const received = envelope.slice(separator + 1)
      const expected = cursorMac(this.cursorSecret, payload)
      if (!constantTimeTextEqual(received, expected)) {
        throw new Error("cursor authentication failed")
      }
      const parsed = JSON.parse(payload) as JsonObject
      if (
        parsed.version !== 1 ||
        parsed.epoch !== this.epoch ||
        parsed.kind !== kind
      ) {
        throw new Error("cursor binding mismatch")
      }
      return parsed
    } catch {
      throw runtimeError("invalid-query", "Invalid or foreign cursor")
    }
  }
}

function fieldDescriptor(
  field: ReturnType<EidosFileRuntime["listFields"]>[number]
): FieldDescriptor {
  const definition =
    field.type === "relation"
      ? relationDefinition(field)
      : field.type === "formula"
        ? {
            sourceText: String(field.property?.formula ?? ""),
            resultType: String(
              field.property?.displayType ?? "text"
            ) as FormulaResultType,
          }
        : field.type === "lookup"
          ? {
              relationFieldId: String(field.property?.relationField ?? ""),
              targetFieldId: String(field.property?.targetField ?? ""),
              aggregate: String(
                field.property?.aggregate ?? "values"
              ) as LookupDefinition["aggregate"],
              distinctValues: field.property?.distinct === true,
            }
          : undefined
  return {
    object: "field",
    id: field.id!,
    tableId: field.tableId,
    name: field.name,
    kind:
      field.type === "created-time" || field.type === "last-edited-time"
        ? "datetime"
        : field.type === "row-id"
          ? "text"
          : (field.type as FieldDescriptor["kind"]),
    valueType: fieldValueType(field),
    systemRole: field.systemRole ?? null,
    nullable: field.nullable ?? false,
    position: String(field.position ?? 0),
    settings: objectValue(field.settings ?? {}),
    writable: fieldWritable(field),
    ...(definition ? { definition } : {}),
  }
}

function fieldValueType(
  field: ReturnType<EidosFileRuntime["listFields"]>[number]
): TypeRef {
  if (field.systemRole === "row-id" || field.type === "row-id") return "row-id"
  if (
    field.systemRole === "created-time" ||
    field.systemRole === "updated-time" ||
    field.type === "created-time" ||
    field.type === "last-edited-time"
  ) {
    return "datetime"
  }
  if (field.type === "formula") {
    return String(field.property?.displayType ?? "text") as TypeRef
  }
  if (field.type === "lookup") {
    const generated = field.property?.valueType
    const generatedObject =
      generated && typeof generated === "object"
        ? (generated as Record<string, unknown>)
        : undefined
    if (
      typeof generated === "string" ||
      (generatedObject?.kind === "list" &&
        typeof generatedObject.element === "string")
    ) {
      return generated as TypeRef
    }
    const display = String(field.property?.displayType ?? "text")
    if (field.property?.aggregate === "values") {
      const element =
        display === "file"
          ? "file-entry"
          : display === "relation"
            ? "row-id"
            : display === "multi-select"
              ? "select"
              : display
      return {
        kind: "list",
        element: element as AtomicType,
      }
    }
    return display as TypeRef
  }
  return field.type as TypeRef
}

function fieldWritable(
  field: ReturnType<EidosFileRuntime["listFields"]>[number]
): boolean {
  const relation =
    field.type === "relation" ? relationDefinition(field) : undefined
  return (
    !field.systemRole &&
    field.type !== "formula" &&
    field.type !== "lookup" &&
    !(field.type === "relation" && relation?.direction === "inverse")
  )
}

function relationDefinition(
  field: ReturnType<EidosFileRuntime["listFields"]>[number]
): RelationDefinition | undefined {
  if (field.type !== "relation" || !field.property) return undefined
  const direction =
    field.property.direction === "inverse" ? "inverse" : "forward"
  if (direction === "inverse") {
    return {
      direction,
      targetTableId: String(field.property.targetTableId),
      cardinality: "many",
      inverseOfFieldId: String(field.property.sourceFieldId),
    }
  }
  return {
    direction,
    targetTableId: String(field.property.targetTableId),
    cardinality: field.property.cardinality === "one" ? "one" : "many",
    onDelete: ["restrict", "detach", "preserve"].includes(
      String(field.property.onDelete)
    )
      ? (field.property.onDelete as "restrict" | "detach" | "preserve")
      : "restrict",
  }
}

function normalizedRuntimeQuery(query: RowQuery): JsonObject {
  return objectValue({
    ...(query.filter === undefined ? {} : { filter: query.filter }),
    ...(query.search === undefined ? {} : { search: query.search }),
    sort: (query.sort ?? []).map((sort) => ({
      fieldId: sort.fieldId,
      direction: sort.direction,
      nulls: sort.nulls ?? "last",
    })),
  })
}

function runtimeQueryFieldIds(query: RowQuery | undefined): string[] {
  if (!query) return []
  const ids = new Set<string>([
    ...(query.search?.fields ?? []),
    ...(query.sort ?? []).map((sort) => sort.fieldId),
  ])
  const visit = (node: FilterNode): void => {
    if (node.op === "and" || node.op === "or") {
      node.args.forEach(visit)
      return
    }
    if (node.op === "not") {
      visit(node.arg)
      return
    }
    if ("fieldId" in node) ids.add(node.fieldId)
  }
  if (query.filter) visit(query.filter)
  return [...ids]
}

function reverseRuntimeQuery(
  query: RowQuery,
  fields: ReturnType<EidosFileRuntime["listFields"]>
): RowQuery {
  const sorts = (query.sort ?? []).map((sort) => ({
    ...sort,
    direction: sort.direction === "asc" ? ("desc" as const) : ("asc" as const),
  }))
  const rowId = fields.find(
    (field) => field.systemRole === "row-id" || field.type === "row-id"
  )
  if (rowId && !sorts.some((sort) => sort.fieldId === rowId.id)) {
    sorts.push({
      fieldId: rowId.id!,
      direction: "desc",
      nulls: "last",
    })
  }
  return {
    ...(query.filter === undefined ? {} : { filter: query.filter }),
    ...(query.search === undefined ? {} : { search: query.search }),
    sort: sorts,
  }
}

function runtimeQueryToCompatibility(query: RowQuery) {
  return {
    ...(query.search ? { search: query.search.text } : {}),
    ...(query.search ? { searchFields: [...query.search.fields] } : {}),
    ...(query.filter
      ? { filter: runtimeFilterToCompatibility(query.filter) }
      : {}),
    sorts: (query.sort ?? []).map((sort) => ({
      field: sort.fieldId,
      direction: sort.direction,
      nulls: sort.nulls ?? "last",
    })),
  }
}

function assertRuntimeRowQuery(
  fields: ReturnType<EidosFileRuntime["listFields"]>,
  query: RowQuery
): void {
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    throw runtimeError("invalid-query", "RowQuery must be an object")
  }
  const byId = new Map(fields.map((field) => [field.id!, field]))
  if (query.search !== undefined) {
    if (
      typeof query.search.text !== "string" ||
      new TextEncoder().encode(query.search.text).byteLength >
        EIDOS_RUNTIME_LIMITS.searchBytesMax ||
      !Array.isArray(query.search.fields) ||
      query.search.fields.length < 1 ||
      query.search.fields.length > EIDOS_RUNTIME_LIMITS.projectionFieldsMax ||
      new Set(query.search.fields).size !== query.search.fields.length
    ) {
      throw runtimeError("invalid-query", "Search request is invalid")
    }
    for (const fieldId of query.search.fields) {
      const field = byId.get(fieldId)
      const type = field ? fieldValueType(field) : undefined
      if (
        !field ||
        typeof type !== "string" ||
        !["text", "url", "select", "row-id"].includes(type)
      ) {
        throw runtimeError("invalid-query", "Search Field is not searchable", {
          fieldId,
        })
      }
    }
  }
  if (query.sort !== undefined) {
    if (
      !Array.isArray(query.sort) ||
      query.sort.length > EIDOS_RUNTIME_LIMITS.sortFieldsMax ||
      new Set(query.sort.map((sort) => sort.fieldId)).size !== query.sort.length
    ) {
      throw runtimeError("invalid-query", "Sort list is invalid")
    }
    query.sort.forEach((sort, index) => {
      const field = byId.get(sort.fieldId)
      const type = field ? fieldValueType(field) : undefined
      if (
        !field ||
        typeof type !== "string" ||
        ![
          "text",
          "number",
          "integer",
          "checkbox",
          "date",
          "datetime",
          "url",
          "select",
          "row-id",
        ].includes(type) ||
        !["asc", "desc"].includes(sort.direction) ||
        (sort.nulls !== undefined && !["first", "last"].includes(sort.nulls)) ||
        (type === "row-id" && index !== query.sort!.length - 1)
      ) {
        throw runtimeError("invalid-query", "Sort Field is invalid", {
          fieldId: sort.fieldId,
        })
      }
    })
  }
  let nodes = 0
  const visit = (node: FilterNode, depth: number): void => {
    nodes += 1
    if (
      depth > EIDOS_RUNTIME_LIMITS.filterDepthMax ||
      nodes > EIDOS_RUNTIME_LIMITS.filterNodesMax
    ) {
      throw runtimeError("resource-limit", "Filter complexity exceeds limits")
    }
    if (!node || typeof node !== "object" || typeof node.op !== "string") {
      throw runtimeError("invalid-query", "Filter node is invalid")
    }
    if (node.op === "and" || node.op === "or") {
      if (!Array.isArray(node.args)) {
        throw runtimeError("invalid-query", "Logical Filter args are invalid")
      }
      node.args.forEach((child) => visit(child, depth + 1))
      return
    }
    if (node.op === "not") {
      visit(node.arg, depth + 1)
      return
    }
    if (!("fieldId" in node)) {
      throw runtimeError("invalid-query", "Filter Field is required")
    }
    const field = byId.get(node.fieldId)
    if (!field) {
      throw runtimeError("invalid-query", "Filter Field does not exist", {
        fieldId: node.fieldId,
      })
    }
    const type = fieldValueType(field)
    if (node.op === "is-null" || node.op === "is-not-null") return
    if (
      node.op === "contains" ||
      node.op === "starts-with" ||
      node.op === "ends-with"
    ) {
      if (
        typeof type !== "string" ||
        !["text", "url", "select", "row-id"].includes(type) ||
        typeof node.value !== "string"
      ) {
        throw runtimeError("invalid-query", "String Filter operand is invalid")
      }
      return
    }
    if (node.op === "has-any" || node.op === "has-all") {
      if (
        typeof type === "string" ||
        !Array.isArray(node.values) ||
        !node.values.every(
          (value) =>
            value !== null && logicalValueMatchesType(value, type.element)
        )
      ) {
        throw runtimeError("invalid-query", "List Filter operand is invalid")
      }
      return
    }
    if (node.op === "relation-has") {
      if (field.type !== "relation") {
        throw runtimeError("invalid-query", "relation-has requires Relation")
      }
      try {
        assertEidosFileUuid(node.rowId, "Row ID")
      } catch {
        throw runtimeError("invalid-query", "relation-has Row ID is invalid")
      }
      return
    }
    if (node.op === "in") {
      if (
        !Array.isArray(node.values) ||
        !node.values.every(
          (value) => value !== null && logicalValueMatchesType(value, type)
        )
      ) {
        throw runtimeError("invalid-query", "in operands are invalid")
      }
      return
    }
    if (node.op === "between") {
      if (
        typeof type !== "string" ||
        !isSortableType(type) ||
        node.lower === null ||
        node.upper === null ||
        !logicalValueMatchesType(node.lower, type) ||
        !logicalValueMatchesType(node.upper, type)
      ) {
        throw runtimeError("invalid-query", "between operands are invalid")
      }
      return
    }
    if (
      !("value" in node) ||
      node.value === null ||
      !logicalValueMatchesType(node.value, type) ||
      (["lt", "lte", "gt", "gte"].includes(node.op) &&
        (typeof type !== "string" || !isSortableType(type)))
    ) {
      throw runtimeError("invalid-query", "Filter operand type is invalid")
    }
  }
  if (query.filter) visit(query.filter, 1)
}

function isSortableType(type: string): boolean {
  return [
    "text",
    "number",
    "integer",
    "checkbox",
    "date",
    "datetime",
    "url",
    "select",
    "row-id",
  ].includes(type)
}

function logicalValueMatchesType(value: LogicalValue, type: TypeRef): boolean {
  if (typeof type === "object") {
    return (
      Array.isArray(value) &&
      value.every(
        (entry) =>
          entry !== null && logicalValueMatchesType(entry, type.element)
      )
    )
  }
  switch (type) {
    case "number":
      return typeof value === "number" && Number.isFinite(value)
    case "integer":
      return (
        typeof value === "string" &&
        /^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(value)
      )
    case "checkbox":
      return typeof value === "boolean"
    case "row-id":
      if (typeof value !== "string") return false
      try {
        assertEidosFileUuid(value, "Row ID")
        return true
      } catch {
        return false
      }
    case "text":
    case "url":
    case "select":
    case "date":
    case "datetime":
      return typeof value === "string"
    case "multi-select":
      return (
        Array.isArray(value) &&
        value.every((entry) => typeof entry === "string")
      )
    case "relation":
      return (
        Array.isArray(value) &&
        value.every((entry) => typeof entry === "string")
      )
    case "file":
      return Array.isArray(value) && value.every((entry) => isFileEntry(entry))
    case "file-entry":
      return isFileEntry(value)
    case "json":
      if (typeof value !== "string") return false
      try {
        return canonicalizeEidosFileJson(JSON.parse(value)) === value
      } catch {
        return false
      }
  }
}

function isFileEntry(value: unknown): value is FileEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === "string" &&
    typeof entry.name === "string" &&
    typeof entry.mediaType === "string" &&
    typeof entry.size === "string" &&
    typeof entry.uri === "string"
  )
}

function isJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true
  }
  if (typeof value === "number") return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (typeof value !== "object") return false
  return Object.values(value).every(isJsonValue)
}

function runtimeFilterToCompatibility(node: FilterNode): EidosFileFilterGroup {
  const group = (
    conjunction: "and" | "or",
    children: EidosFileFilterGroup["children"]
  ): EidosFileFilterGroup => ({ type: "group", conjunction, children })
  if (node.op === "and" || node.op === "or") {
    return group(node.op, node.args.map(runtimeFilterToCompatibility))
  }
  if (node.op === "not") {
    const nested = runtimeFilterToCompatibility(node.arg)
    return {
      ...nested,
      negated: nested.negated !== true,
    }
  }
  if (node.op === "between") {
    return group("and", [
      {
        type: "rule",
        field: node.fieldId,
        operator: "greater-than-or-equal",
        value: node.lower as string | number | boolean | null,
      },
      {
        type: "rule",
        field: node.fieldId,
        operator: "less-than-or-equal",
        value: node.upper as string | number | boolean | null,
      },
    ])
  }
  if (node.op === "has-all") {
    return group("and", [
      {
        type: "rule",
        field: node.fieldId,
        operator: "is-all-of",
        value: node.values as Array<string | number | boolean | null>,
      },
    ])
  }
  const leaf = node as Exclude<
    FilterNode,
    { op: "and" | "or" } | { op: "not" } | { op: "between" } | { op: "has-all" }
  >
  const operatorMap: Partial<
    Record<FilterNode["op"], EidosFileFilterOperator>
  > = {
    "is-null": "is-empty",
    "is-not-null": "is-not-empty",
    eq: "equals",
    ne: "not-equals",
    lt: "less-than",
    lte: "less-than-or-equal",
    gt: "greater-than",
    gte: "greater-than-or-equal",
    in: "is-any-of",
    contains: "contains",
    "starts-with": "starts-with",
    "ends-with": "ends-with",
    "has-any": "is-any-of",
    "relation-has": "is-any-of",
  }
  const operator = operatorMap[leaf.op]
  if (!operator) {
    throw runtimeError("invalid-query", "Filter operation is unsupported")
  }
  const value =
    leaf.op === "in" || leaf.op === "has-any"
      ? leaf.values
      : leaf.op === "relation-has"
        ? [leaf.rowId]
        : "value" in leaf
          ? leaf.value
          : undefined
  return group("and", [
    {
      type: "rule",
      field: leaf.fieldId,
      operator: operator as EidosFileFilterOperator,
      ...(value === undefined
        ? {}
        : {
            value: value as EidosFileFilterValue | EidosFileFilterValue[],
          }),
    },
  ])
}

function compatibilityFilterToRuntime(group: EidosFileFilterGroup): FilterNode {
  return {
    op: group.conjunction,
    args: group.children.map((child) => {
      if (child.type === "group") return compatibilityFilterToRuntime(child)
      const operator = compatibilityOperator(child.operator)
      if (operator === "is-null" || operator === "is-not-null") {
        return { op: operator, fieldId: child.field }
      }
      if (operator === "in") {
        return {
          op: "in",
          fieldId: child.field,
          values: (Array.isArray(child.value)
            ? child.value
            : [child.value ?? null]) as LogicalValue[],
        }
      }
      return {
        op: (operator ?? "eq") as "eq",
        fieldId: child.field,
        value: (Array.isArray(child.value)
          ? child.value[0]
          : (child.value ?? null)) as LogicalValue,
      }
    }),
  }
}

function compatibilityOperator(
  operator: EidosFileFilterOperator
):
  | "is-null"
  | "is-not-null"
  | "eq"
  | "ne"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "contains"
  | "starts-with"
  | "ends-with"
  | "in"
  | undefined {
  switch (operator) {
    case "is-empty":
      return "is-null"
    case "is-not-empty":
      return "is-not-null"
    case "equals":
      return "eq"
    case "not-equals":
      return "ne"
    case "less-than":
      return "lt"
    case "less-than-or-equal":
      return "lte"
    case "greater-than":
      return "gt"
    case "greater-than-or-equal":
      return "gte"
    case "contains":
      return "contains"
    case "starts-with":
      return "starts-with"
    case "ends-with":
      return "ends-with"
    case "is-any-of":
      return "in"
    case "not-contains":
    case "is-none-of":
      return undefined
  }
}

function compatibilityLogicalValue(
  value: unknown,
  type: TypeRef
): LogicalValue {
  if (
    type === "integer" &&
    (typeof value === "number" || typeof value === "bigint")
  ) {
    return String(value)
  }
  if (typeof value === "string" && typeof type === "object") {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed.map((entry) => compatibilityLogicalValue(entry, type.element))
  }
  if (
    typeof value === "string" &&
    typeof type === "string" &&
    ["file", "multi-select", "relation"].includes(type)
  ) {
    return JSON.parse(value) as LogicalValue
  }
  if (typeof value === "string" && type === "file-entry") {
    return JSON.parse(value) as LogicalValue
  }
  if (type === "checkbox" && typeof value === "number") return value === 1
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    Array.isArray(value) ||
    (typeof value === "object" && value !== null)
  ) {
    return value as LogicalValue
  }
  return null
}

function validationDiagnostic(
  issue: { code: string; message: string; table?: string },
  severity: "error" | "warning"
): RuntimeDiagnostic {
  return {
    code: validationCode(issue.code),
    severity,
    message: issue.message,
    ...(issue.table ? { tableId: issue.table } : {}),
  }
}

function validationCode(code: string): RuntimeDiagnostic["code"] {
  const known = new Set<RuntimeDiagnostic["code"]>([
    "file-not-sqlite",
    "file-identity-invalid",
    "file-format-unsupported",
    "file-feature-unsupported",
    "file-core-object-invalid",
    "file-metadata-invalid",
    "file-foreign-key-invalid",
    "file-physical-schema-invalid",
    "file-definition-invalid",
    "file-trigger-invalid",
    "file-index-invalid",
    "file-extension-invalid",
    "file-cell-invalid",
    "file-json-invalid",
    "file-reference-invalid",
    "file-unresolved-relation",
    "file-integrity-invalid",
  ])
  return known.has(code as RuntimeDiagnostic["code"])
    ? (code as RuntimeDiagnostic["code"])
    : "file-core-object-invalid"
}

function objectValue(value: Record<string, unknown>): JsonObject {
  return JSON.parse(canonicalizeEidosFileJson(value)) as JsonObject
}

function simulatedSystemFields(
  tableId: string,
  tableName: string
): EidosFileFieldInfo[] {
  return [
    ["row-id", "row-id", "_id", -3],
    ["created-time", "created-time", "_created_at", -2],
    ["updated-time", "last-edited-time", "_updated_at", -1],
  ].map(([role, type, name, position]) => ({
    id: `${tableId}:system:${role}`,
    tableId,
    name: String(name),
    type: type as EidosFileFieldInfo["type"],
    tableName,
    tableColumnName: String(name),
    physicalName: String(name),
    systemRole: role as NonNullable<EidosFileFieldInfo["systemRole"]>,
    nullable: false,
    isRecordLabel: false,
    position: Number(position),
    settings: {},
    property: {},
    storageCodec: "scalar",
    valueKind: "system",
    isHidden: true,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  }))
}

function simulatedNewField(
  tableId: string,
  tableName: string,
  field: NewField,
  sequence: number
): EidosFileFieldInfo {
  const id = `${tableId}:new-field:${sequence}:${field.clientKey}`
  let property: Record<string, unknown> | null = field.settings
    ? { ...field.settings }
    : {}
  if (field.kind === "formula") {
    const definition = field.definition
    if (
      !definition ||
      !("sourceText" in definition) ||
      !("resultType" in definition)
    ) {
      throw runtimeError("invalid-request", "Formula Field requires definition")
    }
    property = {
      ...property,
      formula: definition.sourceText,
      displayType: definition.resultType,
    }
  } else if (field.kind === "lookup") {
    const definition = field.definition
    if (
      !definition ||
      !("relationFieldId" in definition) ||
      !("targetFieldId" in definition) ||
      !("aggregate" in definition)
    ) {
      throw runtimeError("invalid-request", "Lookup Field requires definition")
    }
    property = {
      ...property,
      relationField: definition.relationFieldId,
      targetField: definition.targetFieldId,
      aggregate: definition.aggregate,
      distinct: definition.distinctValues,
      displayType: "text",
    }
  } else if (field.kind === "relation") {
    const definition = field.definition
    if (!definition || !("direction" in definition)) {
      throw runtimeError(
        "invalid-request",
        "Relation Field requires definition"
      )
    }
    property = simulatedRelationProperty(definition)
  }
  const virtual =
    field.kind === "formula" ||
    field.kind === "lookup" ||
    (field.kind === "relation" && property.direction === "inverse")
  const list = ["multi-select", "file"].includes(field.kind)
  return {
    id,
    tableId,
    name: field.name,
    type: field.kind,
    tableName,
    tableColumnName: virtual ? id : field.name,
    physicalName: virtual ? null : field.name,
    systemRole: null,
    nullable:
      field.kind === "formula" || field.kind === "lookup"
        ? true
        : list || field.kind === "relation"
          ? false
          : field.nullable !== false,
    isRecordLabel: false,
    position: Number(field.position),
    settings: field.settings ?? {},
    property,
    storageCodec:
      field.kind === "relation"
        ? "relation"
        : list || (field.kind === "lookup" && property.aggregate === "values")
          ? "json_array"
          : "scalar",
    valueKind: virtual
      ? "derived"
      : field.kind === "relation"
        ? "relation"
        : "source",
    isHidden: false,
    isDerived: virtual,
    sourceTableColumnName:
      field.kind === "relation" && property.direction === "inverse"
        ? String(property.sourceFieldId ?? "")
        : null,
    dependsOn: null,
  }
}

function simulatedRelationProperty(
  definition: RelationDefinition
): Record<string, unknown> {
  return definition.direction === "forward"
    ? {
        direction: "forward",
        targetTableId: definition.targetTableId,
        cardinality: definition.cardinality,
        onDelete: definition.onDelete,
      }
    : {
        direction: "inverse",
        targetTableId: definition.targetTableId,
        sourceFieldId: definition.inverseOfFieldId,
        cardinality: "many",
      }
}

function asciiNoCase(value: string): string {
  return value.replace(/[A-Z]/g, (character) => character.toLowerCase())
}

function highestSchemaClassification(
  left: SchemaPreflightResult["classification"],
  right: SchemaPreflightResult["classification"]
): SchemaPreflightResult["classification"] {
  const rank = {
    "metadata-only": 0,
    "lossless-rewrite": 1,
    "explicit-lossy": 2,
    forbidden: 3,
  } as const
  return rank[left] >= rank[right] ? left : right
}

function assertConnectionCapabilities(connection: ConnectionPort): void {
  const capabilities = connection.capabilities()
  if (
    capabilities.adapterVersion !== "1.0" ||
    !capabilities.json1 ||
    !capabilities.returning ||
    !capabilities.strict ||
    !capabilities.int64 ||
    !capabilities.scalarFunctions ||
    !capabilities.snapshot
  ) {
    throw runtimeError(
      "adapter-error",
      "ConnectionPort does not satisfy EA-Connection-1.0"
    )
  }
}

function assertFactoryContext(
  context: RuntimeFactoryContext,
  environment: RuntimeEnvironment
): void {
  if (context.cancellation.cancelled()) {
    throw runtimeError("cancelled", "Runtime factory was cancelled", {
      retryable: true,
    })
  }
  if (context.deadlineMilliseconds !== undefined) {
    assertPositiveSafeInteger(
      context.deadlineMilliseconds,
      "deadlineMilliseconds"
    )
  }
  checkedNowInstant(environment)
  const monotonic = environment.clock.nowMilliseconds()
  if (!Number.isFinite(monotonic) || monotonic < 0) {
    throw runtimeError(
      "adapter-error",
      "ClockPort.nowMilliseconds must be non-negative and finite"
    )
  }
}

function checkedNowInstant(environment: RuntimeEnvironment): string {
  const instant = environment.clock.nowInstant()
  if (!isCanonicalEidosFileInstant(instant)) {
    throw runtimeError(
      "adapter-error",
      "ClockPort.nowInstant returned a non-canonical instant"
    )
  }
  return instant
}

function uuidGenerator(environment: RuntimeEnvironment): EidosUuidV7Generator {
  return new EidosUuidV7Generator(
    () => checkedNowInstant(environment),
    (length) => environment.entropy.randomBytes(length).slice()
  )
}

function assertRequestContext(context: RequestContext): void {
  if (
    typeof context.requestId !== "string" ||
    context.requestId.length === 0 ||
    context.requestId.includes("\u0000") ||
    new TextEncoder().encode(context.requestId).byteLength > 128
  ) {
    throw runtimeError("invalid-request", "Invalid requestId", {
      path: "/requestId",
    })
  }
  if (context.deadlineMilliseconds !== undefined) {
    assertPositiveSafeInteger(
      context.deadlineMilliseconds,
      "deadlineMilliseconds"
    )
  }
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw runtimeError(
      "invalid-request",
      label + " must be a positive JSON safe integer"
    )
  }
}

function assertLimit(value: number, maximum: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw runtimeError(
      "invalid-request",
      label + " must be between 1 and " + maximum
    )
  }
}

function assertProjection(projection: ProjectionSpec): void {
  if (
    projection.fields.length > EIDOS_RUNTIME_LIMITS.projectionFieldsMax ||
    new Set(projection.fields).size !== projection.fields.length ||
    new Set(projection.resolveRelations).size !==
      projection.resolveRelations.length ||
    projection.resolveRelations.some(
      (fieldId) => !projection.fields.includes(fieldId)
    )
  ) {
    throw runtimeError("invalid-request", "Invalid ProjectionSpec")
  }
}

function assertCurrentRevision(expected: string, current: string): void {
  parseRevision(expected, "revision")
  if (expected !== current) {
    throw runtimeError("stale-revision", "File revision has changed", {
      retryable: true,
      currentRevision: current,
    })
  }
}

function parseRevision(value: string, label = "revision"): bigint {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw runtimeError(
      "invalid-request",
      label + " must be canonical non-negative int64 decimal"
    )
  }
  const parsed = BigInt(value)
  if (parsed > 9_223_372_036_854_775_807n) {
    throw runtimeError("invalid-request", label + " exceeds int64")
  }
  return parsed
}

function taggedText(value: SqlValue | undefined): string {
  if (value?.tag !== "text") {
    throw runtimeError("corrupt-file", "Expected SQLite TEXT storage class")
  }
  return value.value
}

function taggedInteger(value: SqlValue | undefined): string {
  if (value?.tag !== "integer") {
    throw runtimeError("corrupt-file", "Expected SQLite INTEGER storage class")
  }
  return value.value
}

async function projectionHash(projection: ProjectionSpec): Promise<string> {
  return hashJson(projection)
}

async function hashJson(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeEidosFileJson(value))
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("")
}

const UINT64_MASK = (1n << 64n) - 1n

function cursorMac(key: Uint8Array, payload: string): string {
  const message = new TextEncoder().encode(payload)
  const read64 = (bytes: Uint8Array, offset: number): bigint => {
    let value = 0n
    for (let index = 0; index < 8; index += 1) {
      value |= BigInt(bytes[offset + index] ?? 0) << BigInt(index * 8)
    }
    return value
  }
  const rotate = (value: bigint, bits: bigint) =>
    ((value << bits) | (value >> (64n - bits))) & UINT64_MASK
  let v0 = 0x736f6d6570736575n ^ read64(key, 0)
  let v1 = 0x646f72616e646f6dn ^ read64(key, 8)
  let v2 = 0x6c7967656e657261n ^ read64(key, 0)
  let v3 = 0x7465646279746573n ^ read64(key, 8)
  const round = () => {
    v0 = (v0 + v1) & UINT64_MASK
    v1 = rotate(v1, 13n) ^ v0
    v0 = rotate(v0, 32n)
    v2 = (v2 + v3) & UINT64_MASK
    v3 = rotate(v3, 16n) ^ v2
    v0 = (v0 + v3) & UINT64_MASK
    v3 = rotate(v3, 21n) ^ v0
    v2 = (v2 + v1) & UINT64_MASK
    v1 = rotate(v1, 17n) ^ v2
    v2 = rotate(v2, 32n)
  }
  let offset = 0
  while (offset + 8 <= message.byteLength) {
    const block = read64(message, offset)
    v3 ^= block
    round()
    round()
    v0 ^= block
    offset += 8
  }
  let finalBlock = BigInt(message.byteLength) << 56n
  for (let index = 0; offset + index < message.byteLength; index += 1) {
    finalBlock |= BigInt(message[offset + index]!) << BigInt(index * 8)
  }
  v3 ^= finalBlock
  round()
  round()
  v0 ^= finalBlock
  v2 ^= 0xffn
  round()
  round()
  round()
  round()
  return ((v0 ^ v1 ^ v2 ^ v3) & UINT64_MASK).toString(16).padStart(16, "0")
}

function constantTimeTextEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return difference === 0
}

function parseSignedInt64(value: string, label: string): bigint {
  if (!/^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(value) || value === "-0") {
    throw runtimeError(
      "invalid-request",
      label + " must be canonical signed int64 decimal"
    )
  }
  const parsed = BigInt(value)
  if (
    parsed < -9_223_372_036_854_775_808n ||
    parsed > 9_223_372_036_854_775_807n
  ) {
    throw runtimeError("invalid-request", label + " exceeds signed int64")
  }
  return parsed
}

function int64ToSafeNumber(value: string, label: string): number {
  const parsed = parseSignedInt64(value, label)
  if (
    parsed < BigInt(Number.MIN_SAFE_INTEGER) ||
    parsed > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw runtimeError(
      "resource-limit",
      label + " cannot be represented by this compatibility engine"
    )
  }
  return Number(parsed)
}

function quoteSqlIdentifier(value: string): string {
  return '"' + value.replace(/"/g, '""') + '"'
}

function newFieldInput(field: NewField): CreateEidosFileFieldInput {
  const base = {
    name: field.name,
    nullable: field.nullable,
  }
  if (field.kind === "formula") {
    const definition = field.definition as FormulaDefinition
    return {
      name: field.name,
      type: "formula",
      property: {
        ...(field.settings ?? {}),
        formula: definition.sourceText,
        displayType: definition.resultType,
      },
    }
  }
  if (field.kind === "lookup") {
    const definition = field.definition as LookupDefinition
    return {
      name: field.name,
      type: "lookup",
      property: {
        ...(field.settings ?? {}),
        relationField: definition.relationFieldId,
        targetField: definition.targetFieldId,
        aggregate: definition.aggregate,
        displayType: "text",
        distinct: definition.distinctValues,
      },
    }
  }
  if (field.kind === "relation") {
    const definition = field.definition as RelationDefinition
    return {
      name: field.name,
      type: "relation",
      property:
        definition.direction === "forward"
          ? {
              ...(field.settings ?? {}),
              direction: "forward",
              targetTableId: definition.targetTableId,
              cardinality: definition.cardinality,
              onDelete: definition.onDelete,
            }
          : {
              ...(field.settings ?? {}),
              direction: "inverse",
              targetTableId: definition.targetTableId,
              sourceFieldId: definition.inverseOfFieldId,
              cardinality: "many",
            },
    }
  }
  return {
    ...base,
    type: field.kind,
    property: field.settings,
  } as CreateEidosFileFieldInput
}

function runtimeError(
  code: RuntimeErrorCode,
  message: string,
  members: Partial<RuntimeError> = {}
): RuntimeError {
  return {
    code,
    message: message.slice(0, 4_096),
    retryable: false,
    ...members,
  }
}

function mapRuntimeFailure(error: unknown): RuntimeError {
  if (isRuntimeError(error)) return error
  if (error instanceof EidosFileError) {
    const code: RuntimeErrorCode = (
      {
        "invalid-sqlite": "corrupt-file",
        "not-eidos-file": "corrupt-file",
        "unsupported-version": "unsupported",
        "unsupported-feature": "unsupported",
        "invalid-schema": "corrupt-file",
        "invalid-formula": "invalid-formula",
        "invalid-value": "invalid-value",
        "constraint-conflict": "constraint",
        "dependency-cycle": "cycle",
        "stale-revision": "stale-revision",
        "file-conflict": "conflict",
        "permission-denied": "forbidden",
        "query-limit": "resource-limit",
        "resource-limit": "resource-limit",
        "unsupported-format": "unsupported",
        "invalid-identifier": "invalid-request",
        "invalid-query": "invalid-query",
        "invalid-range": "invalid-request",
        "invalid-csv": "invalid-value",
        "protected-field": "forbidden",
        "protected-view": "forbidden",
        "relation-in-use": "constraint",
        "formula-in-use": "constraint",
        "lookup-in-use": "constraint",
        "table-not-found": "not-found",
        "row-not-found": "not-found",
        "field-not-found": "not-found",
        "view-not-found": "not-found",
        "file-exists": "already-exists",
        "file-not-found": "not-found",
      } satisfies Record<EidosFileErrorCode, RuntimeErrorCode>
    )[error.code]
    return runtimeError(code, error.message, {
      retryable: code === "stale-revision" || code === "conflict",
    })
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "fatal" in error
  ) {
    const adapter = error as {
      code: string
      message?: string
      retryable?: boolean
      fatal?: boolean
    }
    return runtimeError(
      adapter.code === "commit-outcome-unknown"
        ? "unknown-commit"
        : adapter.fatal
          ? "fatal"
          : adapter.code === "busy"
            ? "busy"
            : adapter.code === "cancelled"
              ? "cancelled"
              : adapter.code === "deadline-exceeded"
                ? "deadline-exceeded"
                : adapter.code === "resource-limit"
                  ? "resource-limit"
                  : adapter.code === "corrupt" ||
                      adapter.code === "not-a-database"
                    ? "corrupt-file"
                    : adapter.code === "adapter-closed"
                      ? "closed"
                      : "adapter-error",
      adapter.message ?? "Adapter failure",
      adapter.code === "commit-outcome-unknown"
        ? {
            retryable: false,
            details: { reconciliationRequired: true },
          }
        : { retryable: adapter.retryable === true }
    )
  }
  return runtimeError(
    "fatal",
    error instanceof Error ? error.message : "Unknown Runtime failure"
  )
}

function isRuntimeError(value: unknown): value is RuntimeError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as RuntimeError).code === "string" &&
    typeof (value as RuntimeError).message === "string" &&
    typeof (value as RuntimeError).retryable === "boolean"
  )
}

function binaryCompare(left: string, right: string): number {
  const a = new TextEncoder().encode(left)
  const b = new TextEncoder().encode(right)
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!
  }
  return a.length - b.length
}

function assertAggregateItems(
  items: AggregateItem[],
  fieldsById: Map<string, EidosFileFieldInfo>
): void {
  const keys = new Set<string>()
  for (const item of items) {
    if (!item.key || keys.has(item.key)) {
      throw runtimeError(
        "invalid-request",
        "Aggregate keys must be non-empty and unique"
      )
    }
    keys.add(item.key)
    if (item.op !== "count-all" && !fieldsById.has(item.fieldId)) {
      throw runtimeError("not-found", "Aggregate Field not found", {
        fieldId: item.fieldId,
      })
    }
  }
}

function aggregateResultsForRows(
  items: AggregateItem[],
  fieldsById: Map<string, EidosFileFieldInfo>,
  rows: EidosFileLogicalRow[]
): AggregateResponse["results"] {
  const rowIdOrder = [...rows].sort((left, right) =>
    binaryCompare(left.id, right.id)
  )
  return items.map((item) => {
    if (item.op === "count-all") {
      return { key: item.key, value: String(rows.length) }
    }
    const field = fieldsById.get(item.fieldId)!
    return aggregateItemResult(
      item,
      fieldValueType(field),
      rowIdOrder.map((row) => row.fields[item.fieldId] ?? null)
    )
  })
}

function groupIdentity(values: unknown[], types: TypeRef[]): string {
  return canonicalizeEidosFileJson(
    values.map((value, index) =>
      value === null ? "null" : typedAggregateKey(value, types[index]!)
    )
  )
}

function compareGroupKeys(
  left: unknown[],
  right: unknown[],
  types: TypeRef[]
): number {
  for (let index = 0; index < types.length; index += 1) {
    const a = left[index] ?? null
    const b = right[index] ?? null
    if (a === null || b === null) {
      if (a === b) continue
      return a === null ? -1 : 1
    }
    const comparison = compareAggregateValues(a, b, types[index]!)
    if (comparison !== 0) return comparison
  }
  return 0
}

function groupCursorSource(request: GroupRequest): JsonObject {
  return objectValue({
    tableId: request.tableId,
    query: normalizedRuntimeQuery(request.query),
    groupBy: request.groupBy,
    aggregates: request.aggregates,
    projection: request.projection,
    groupLimit: 1,
    rowsPerGroup: 1,
  })
}

function queryForGroup(
  query: RowQuery,
  groupBy: string[],
  key: LogicalValue[]
): RowQuery {
  const rules: FilterNode[] = groupBy.map((fieldId, index) =>
    key[index] === null
      ? { op: "is-null", fieldId }
      : { op: "eq", fieldId, value: key[index]! }
  )
  return {
    ...query,
    filter:
      query.filter === undefined
        ? { op: "and", args: rules }
        : { op: "and", args: [query.filter, ...rules] },
  }
}

function groupBindingHash(request: GroupRequest): Promise<string> {
  return hashJson({
    tableId: request.tableId,
    query: normalizedRuntimeQuery(request.query),
    groupBy: request.groupBy,
    aggregates: request.aggregates,
    projection: request.projection,
  })
}

function aggregateItemResult(
  item: Exclude<AggregateItem, { op: "count-all" }>,
  valueType: TypeRef,
  values: unknown[]
): AggregateResponse["results"][number] {
  const nonNull: unknown[] = values.filter((value) => value !== null)
  const distinct = new Map<string, unknown>()
  for (const value of nonNull) {
    const key = typedAggregateKey(value, valueType)
    if (!distinct.has(key)) distinct.set(key, value)
  }
  if (item.op === "count") {
    return { key: item.key, value: String(nonNull.length) }
  }
  if (item.op === "distinct-count") {
    return { key: item.key, value: String(distinct.size) }
  }
  const sortable = typeof valueType === "string" && isSortableType(valueType)
  const numeric = valueType === "integer" || valueType === "number"
  if ((item.op === "sum" || item.op === "average") && !numeric) {
    throw runtimeError(
      "invalid-request",
      `${item.op} requires an Integer or Number Field`,
      { fieldId: item.fieldId }
    )
  }
  if ((item.op === "min" || item.op === "max") && !sortable) {
    throw runtimeError(
      "invalid-request",
      `${item.op} requires a sortable scalar Field`,
      { fieldId: item.fieldId }
    )
  }
  const sum = (): LogicalValue => {
    if (nonNull.length === 0) return null
    if (valueType === "integer") {
      const total = nonNull.reduce<bigint>(
        (accumulator, value) => accumulator + BigInt(value as bigint),
        0n
      )
      if (
        total < -9_223_372_036_854_775_808n ||
        total > 9_223_372_036_854_775_807n
      ) {
        throw runtimeError(
          "constraint",
          "Integer aggregate sum exceeds int64",
          {
            fieldId: item.fieldId,
          }
        )
      }
      return String(total)
    }
    const result = pairwiseBinary64(nonNull.map(Number))
    if (!Number.isFinite(result)) {
      throw runtimeError("constraint", "Number aggregate is non-finite", {
        fieldId: item.fieldId,
      })
    }
    return Object.is(result, -0) ? 0 : result
  }
  const average = (): number | null => {
    if (nonNull.length === 0) return null
    const result =
      valueType === "integer"
        ? rationalToBinary64(
            nonNull.reduce<bigint>(
              (accumulator, value) => accumulator + BigInt(value as bigint),
              0n
            ),
            BigInt(nonNull.length)
          )
        : pairwiseBinary64(nonNull.map(Number)) / nonNull.length
    if (!Number.isFinite(result)) {
      throw runtimeError("constraint", "Average aggregate is non-finite", {
        fieldId: item.fieldId,
      })
    }
    return Object.is(result, -0) ? 0 : result
  }
  const extreme = (kind: "min" | "max"): LogicalValue => {
    if (nonNull.length === 0) return null
    let selected: unknown = nonNull[0]!
    for (const candidate of nonNull.slice(1)) {
      const compared = compareAggregateValues(candidate, selected, valueType)
      if (
        (kind === "min" && compared < 0) ||
        (kind === "max" && compared > 0)
      ) {
        selected = candidate
      }
    }
    return publicAggregateValue(selected, valueType)
  }
  if (item.op === "sum") return { key: item.key, value: sum() }
  if (item.op === "average") return { key: item.key, value: average() }
  if (item.op === "min" || item.op === "max") {
    return { key: item.key, value: extreme(item.op) }
  }
  const statistics: ColumnStatistics = {
    rows: String(values.length),
    nulls: String(values.length - nonNull.length),
    distinct: String(distinct.size),
  }
  if (sortable) {
    statistics.min = extreme("min")
    statistics.max = extreme("max")
  }
  if (numeric) {
    statistics.sum = sum()
    statistics.average = average()
  }
  return { key: item.key, statistics }
}

function publicAggregateValue(value: unknown, type: TypeRef): LogicalValue {
  if (value === null) return null
  if (type === "integer") return String(value)
  if (type === "checkbox") return value === true || value === 1 || value === 1n
  if (typeof value === "number") return Object.is(value, -0) ? 0 : value
  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    Array.isArray(value)
  )
    return value as LogicalValue
  throw runtimeError("fatal", "Aggregate produced an invalid logical value")
}

function typedAggregateKey(value: unknown, type: TypeRef): string {
  if (type === "integer") return `integer:${String(value)}`
  if (type === "number") {
    const number = Object.is(value, -0) ? 0 : Number(value)
    return `number:${number}`
  }
  if (type === "checkbox")
    return `checkbox:${value === true || value === 1 ? 1 : 0}`
  if (
    typeof type === "object" ||
    ["file", "multi-select", "relation", "file-entry"].includes(String(type))
  ) {
    try {
      return `structured:${canonicalizeEidosFileJson(value as JsonValue)}`
    } catch {
      throw runtimeError(
        "fatal",
        "Aggregate encountered an invalid structured value"
      )
    }
  }
  return `${String(type)}:${String(value)}`
}

function compareAggregateValues(
  left: unknown,
  right: unknown,
  type: TypeRef
): number {
  if (type === "integer") {
    const a = BigInt(left as bigint)
    const b = BigInt(right as bigint)
    return a < b ? -1 : a > b ? 1 : 0
  }
  if (type === "number") {
    const a = Number(left)
    const b = Number(right)
    return a < b ? -1 : a > b ? 1 : 0
  }
  if (type === "checkbox") {
    const a = left === true || left === 1 || left === 1n
    const b = right === true || right === 1 || right === 1n
    return a === b ? 0 : a ? 1 : -1
  }
  return binaryCompare(String(left), String(right))
}

function pairwiseBinary64(values: number[]): number {
  let level = values.map((value) => (Object.is(value, -0) ? 0 : value))
  while (level.length > 1) {
    const next: number[] = []
    for (let index = 0; index < level.length; index += 2) {
      next.push(
        index + 1 < level.length
          ? level[index]! + level[index + 1]!
          : level[index]!
      )
    }
    level = next
  }
  return level[0] ?? 0
}

function rationalToBinary64(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n)
    throw runtimeError("fatal", "Invalid rational denominator")
  if (numerator === 0n) return 0
  const negative = numerator < 0n
  const absolute = negative ? -numerator : numerator
  let exponent = bitLength(absolute) - bitLength(denominator)
  if (exponent >= 0) {
    if (absolute < denominator << BigInt(exponent)) exponent -= 1
  } else if (absolute << BigInt(-exponent) < denominator) {
    exponent -= 1
  }
  if (exponent > 1023) return negative ? -Infinity : Infinity
  let result: number
  if (exponent >= -1022) {
    const shift = 52 - exponent
    const scaledNumerator = shift >= 0 ? absolute << BigInt(shift) : absolute
    const scaledDenominator =
      shift >= 0 ? denominator : denominator << BigInt(-shift)
    let significand = divideRoundTiesEven(scaledNumerator, scaledDenominator)
    if (significand === 9_007_199_254_740_992n) {
      significand >>= 1n
      exponent += 1
      if (exponent > 1023) return negative ? -Infinity : Infinity
    }
    result = Number(significand) * 2 ** (exponent - 52)
  } else {
    const significand = divideRoundTiesEven(absolute << 1074n, denominator)
    result = Number(significand) * 2 ** -1074
  }
  return negative ? -result : result
}

function divideRoundTiesEven(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator
  const remainder = numerator % denominator
  const doubled = remainder * 2n
  return doubled > denominator ||
    (doubled === denominator && quotient % 2n !== 0n)
    ? quotient + 1n
    : quotient
}

function bitLength(value: bigint): number {
  return value.toString(2).length
}

function assertJcsBytes(value: unknown, maximum: number, label: string): void {
  let bytes: number
  try {
    bytes = jcsByteLength(value)
  } catch {
    throw runtimeError("invalid-request", `${label} is not canonical JSON data`)
  }
  if (bytes > maximum) {
    throw runtimeError("resource-limit", `${label} exceeds its byte limit`)
  }
}

function jcsByteLength(value: unknown): number {
  return new TextEncoder().encode(canonicalizeEidosFileJson(value as JsonValue))
    .byteLength
}
