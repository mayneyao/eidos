import { describe, expect, it } from "vitest"
import type {
  HostLimits,
  HostServices,
  HostSessionState,
  RuntimeCapabilities,
  RuntimeClient,
  RuntimeLimits,
} from "@eidos.space/eidos-file"

import { EidosUIKernel } from "./kernel"

const FILE = "018f0000-0000-7000-8000-000000000001"
const TABLE = "018f0000-0000-7000-8000-000000000002"
const FIELD = "018f0000-0000-7000-8000-000000000003"
const ROW = "018f0000-0000-7000-8000-000000000004"

const capabilities: RuntimeCapabilities = {
  readRows: true,
  schemaPaging: true,
  cursorPaging: true,
  aggregate: true,
  groupRows: true,
  formulaPreview: false,
  mutateRows: true,
  mutationUndo: false,
  mutateView: true,
  schemaPreflight: true,
  mutateSchema: true,
  validate: true,
  events: false,
  csvExport: false,
  csvImport: false,
}

const runtimeLimits: RuntimeLimits = {
  requestBytesMax: 8_388_608,
  responseBytesMax: 16_777_216,
  schemaPageSizeMax: 1_000,
  pageSizeMax: 1_000,
  projectionFieldsMax: 256,
  rowsByIdMax: 1_000,
  mutationRowsMax: 500,
  mutationCellsMax: 25_000,
  mutationBytesMax: 8_388_608,
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
  csvBytesMax: 16_777_216,
  schemaPlanEntriesMax: 64,
  schemaPlanBytesMax: 8_388_608,
  undoEntriesMax: 1,
  undoBytesMax: 1,
}

const hostLimits: HostLimits = {
  sourceBytesMax: "1000000",
  candidateBytesMax: "1000000",
  recoveryBytesMax: "0",
  recoveryEntriesMax: 0,
  recoveryRetentionSecondsMax: 0,
  assetBytesMax: "0",
  assetPreviewBytesMax: "0",
  concurrentAssetLeasesMax: 0,
  concurrentSessionsMax: 2,
}

function runtimeFixture() {
  let revision = "1"
  let queries = 0
  const unsupported = async (): Promise<never> => {
    throw new Error("unused")
  }
  const runtime: RuntimeClient = {
    async negotiate() {
      return { version: "1.0", capabilities, limits: runtimeLimits }
    },
    async getSnapshot() {
      return {
        fileId: FILE,
        format: { major: 1, minor: 0 },
        revision,
        title: "Fixture",
        defaultTableId: TABLE,
        schemaCounts: { tables: "1", fields: "1", views: "0", features: "0" },
      }
    },
    async getSchemaPage() {
      return {
        fileId: FILE,
        revision,
        objects: [
          {
            object: "table" as const,
            id: TABLE,
            name: "Items",
            labelFieldId: FIELD,
            position: "0",
            settings: {},
          },
          {
            object: "field" as const,
            id: FIELD,
            tableId: TABLE,
            name: "Name",
            kind: "text" as const,
            valueType: "text" as const,
            systemRole: null,
            nullable: false,
            position: "0",
            settings: {},
            writable: true,
          },
        ],
        nextCursor: null,
      }
    },
    async queryRows(request) {
      queries += 1
      return {
        fileId: FILE,
        tableId: TABLE,
        revision,
        projectionHash: "projection",
        columns: request.projection.fields.map((fieldId) => ({
          fieldId,
          name: "Name",
          valueType: "text" as const,
          source: "stored" as const,
          writable: true,
        })),
        rows: [{ id: ROW, values: ["Item"] }],
        nextCursor: null,
        previousCursor: null,
      }
    },
    getRowsById: unsupported,
    aggregate: unsupported,
    groupRows: unsupported,
    queryGroupRows: unsupported,
    previewFormula: unsupported,
    async mutateRows() {
      revision = String(BigInt(revision) + 1n)
      return {
        fileId: FILE,
        revision,
        changed: true,
        created: [],
        affectedRows: [{ tableId: TABLE, rowId: ROW }],
      }
    },
    mutateView: unsupported,
    preflightSchema: unsupported,
    getSchemaPlanDependencies: unsupported,
    mutateSchema: unsupported,
    validate: unsupported,
    async cancel() {},
    async close() {},
  }
  return { runtime, queryCount: () => queries }
}

function hostFixture(runtime: RuntimeClient) {
  let closes = 0
  const listeners = new Set<(state: HostSessionState) => void>()
  const state: HostSessionState = {
    sessionId: "session-1",
    phase: "ready-clean",
    capabilities: {
      canWriteCurrent: true,
      canSaveCopy: false,
      canRequestPermission: false,
      hasRecovery: false,
      assetReadSchemes: [],
      assetWriteSchemes: [],
      casGuarantee: "strong",
      atomicReplace: true,
      durability: "durable",
    },
    limits: hostLimits,
    fileId: FILE,
    revision: "1",
  }
  const unsupported = async (): Promise<never> => {
    throw new Error("unused")
  }
  const host: HostServices = {
    async negotiate() {
      return {
        version: "1.0",
        serviceCapabilities: {
          canOpenSource: true,
          canCreateSource: false,
          canRequestPermission: false,
          canSaveCopy: false,
          canReconcileCommit: false,
          canResolveConflict: false,
          canRecover: false,
          canUseAssets: false,
        },
        limits: hostLimits,
      }
    },
    async openSource() {
      return { sessionId: state.sessionId, runtime, state }
    },
    createSource: unsupported,
    requestWritePermission: unsupported,
    async save() {
      return { state }
    },
    saveCopy: unsupported,
    reconcileCommit: unsupported,
    resolveConflict: unsupported,
    listRecovery: unsupported,
    restoreRecovery: unsupported,
    discardRecovery: unsupported,
    acquireAsset: unsupported,
    resolveAsset: unsupported,
    releaseAsset: async () => undefined,
    async close() {
      closes += 1
    },
    subscribe(_sessionId, listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  return { host, closeCount: () => closes }
}

describe("Eidos UI 1.0 kernel", () => {
  it("bootstraps through Host/Runtime and invalidates cached pages on mutation", async () => {
    const fixture = runtimeFixture()
    const host = hostFixture(fixture.runtime)
    const kernel = new EidosUIKernel(host.host)
    await kernel.openSource({ sourceToken: "source-1", access: "readwrite" })
    expect(kernel.getState().phase).toBe("ready")
    expect(kernel.getState().schema?.tables.get(TABLE)?.labelFieldId).toBe(
      FIELD
    )

    const request = {
      tableId: TABLE,
      query: {},
      projection: { fields: [FIELD], resolveRelations: [] },
      limit: 10,
    }
    await kernel.queryRows("grid", request)
    await kernel.queryRows("grid", request)
    expect(fixture.queryCount()).toBe(1)

    await kernel.mutateRows({
      tableId: TABLE,
      changes: [{ kind: "update", rowId: ROW, values: { [FIELD]: "Changed" } }],
    })
    await kernel.queryRows("grid", request)
    expect(fixture.queryCount()).toBe(2)
    expect(kernel.getState().snapshot?.revision).toBe("2")

    await expect(
      kernel.openSource({ sourceToken: "source-2", access: "read" })
    ).rejects.toThrow(/Dirty session/)
    await kernel.close({ discardDirty: true })
    expect(host.closeCount()).toBe(1)
  })

  it("rejects a capability whose optional method is absent", async () => {
    const fixture = runtimeFixture()
    const incompatible = Object.assign(Object.create(fixture.runtime), {
      negotiate: async () => ({
        version: "1.0" as const,
        capabilities: { ...capabilities, events: true },
        limits: runtimeLimits,
      }),
    }) as RuntimeClient
    const host = hostFixture(incompatible)
    const kernel = new EidosUIKernel(host.host)
    await expect(
      kernel.openSource({ sourceToken: "source", access: "read" })
    ).rejects.toThrow(/optional method subscribe/)
    expect(host.closeCount()).toBe(1)
  })
})
