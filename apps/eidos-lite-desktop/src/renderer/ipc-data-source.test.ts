// @vitest-environment jsdom

import type {
  EidosFileCsvImportPlan,
  EidosFileCsvImportResult,
  EidosFileSnapshot,
} from "@eidos.space/eidos-file"

import {
  eidosLiteSchemaImpactRequiredResult,
  type EidosLiteApi,
} from "../shared/contracts"
import { EidosFileSchemaImpactRequiredError } from "../../../../packages/eidos-file-ui/src/schema-impact-confirmation"
import { eidosLiteCsvFileName } from "./csv-workflow"
import { IpcEidosFileDataSource } from "./ipc-data-source"

it("applies transient folder scope to paging, totals, neighbors, statistics and action targets without changing saved Views", async () => {
  const catalog = {
    ...snapshot,
    tables: [
      {
        table: { id: "files", settings: { vtabModule: "fs_meta" } },
        fields: [
          {
            id: "path-field",
            name: "path",
            tableColumnName: "path-field",
            physicalName: null,
          },
        ],
        views: [{ id: "grid", filter: null }],
      },
    ],
  } as unknown as EidosFileSnapshot
  const callRuntime = vi.fn(async () => ({}))
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: { callRuntime },
  })
  const source = new IpcEidosFileDataSource(
    "catalog",
    catalog
  ).withPropertyDirectory("docs")
  const query = {
    search: "note",
    filter: {
      type: "group" as const,
      conjunction: "or" as const,
      children: [],
    },
  }
  const scoped = {
    ...query,
    filter: {
      type: "group",
      conjunction: "and",
      children: [
        {
          type: "rule",
          field: "path-field",
          operator: "starts-with",
          value: "docs/",
        },
        query.filter,
      ],
    },
  }
  await source.getPage("files", 0, 100, query, 999)
  expect(callRuntime).toHaveBeenLastCalledWith("catalog", "getPage", [
    "files",
    0,
    100,
    scoped,
    undefined,
  ])
  await source.getRecordNeighbors("files", "docs/note.txt", query)
  expect(callRuntime).toHaveBeenLastCalledWith(
    "catalog",
    "getRecordNeighbors",
    ["files", "docs/note.txt", scoped]
  )
  await source.getRowIndex("files", "docs/note.txt", query)
  expect(callRuntime).toHaveBeenLastCalledWith("catalog", "getRowIndex", [
    "files",
    "docs/note.txt",
    scoped,
  ])
  await source.getGroupCounts("files", "status", query)
  expect(callRuntime).toHaveBeenLastCalledWith("catalog", "getGroupCounts", [
    "files",
    "status",
    scoped,
  ])
  await source.calculateColumnStats("files", [], query)
  expect(callRuntime).toHaveBeenLastCalledWith(
    "catalog",
    "calculateColumnStats",
    ["files", [], scoped]
  )
  await source.aggregateTable("files", { metric: { op: "count" } }, query)
  expect(callRuntime).toHaveBeenLastCalledWith("catalog", "aggregateTable", [
    "files",
    { metric: { op: "count" } },
    scoped,
  ])
  await source.captureTableActionTarget("files", query, null)
  expect(callRuntime).toHaveBeenLastCalledWith(
    "catalog",
    "captureTableActionTarget",
    ["files", scoped, null]
  )
  await source.withPropertyDirectory(null).getPage("files", 0, 100, query, 999)
  expect(callRuntime).toHaveBeenLastCalledWith("catalog", "getPage", [
    "files",
    0,
    100,
    query,
    999,
  ])
  expect(catalog.tables[0]!.views[0]!.filter).toBeNull()
  expect(query.filter.conjunction).toBe("or")
})

const snapshot = {
  path: "tasks.eidos",
  metadata: { revision: "2" },
  tables: [],
} as unknown as EidosFileSnapshot

it("bridges plugin config and action operations without cloning AbortSignals", async () => {
  const callRuntime = vi.fn(async (_session: string, method: string) =>
    method === "captureTableActionTarget"
      ? ["row"]
      : method === "getSnapshot"
        ? snapshot
        : { undoToken: "undo" }
  )
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: { callRuntime },
  })
  const source = new IpcEidosFileDataSource("session", snapshot)
  const controller = new AbortController()
  await source.readTablePluginConfig("table", "plugin")
  await source.writeTablePluginConfig("table", "plugin", {
    value: null,
    expectedVersion: "v1",
  })
  expect(
    await source.captureTableActionTarget("table", {}, null, controller.signal)
  ).toEqual(["row"])
  const row = { id: "row", values: { field: null }, version: "v1" }
  await source.readTableActionRows("table", ["row"], ["field"])
  expect(
    await source.writeTableActionRow(
      "table",
      row,
      { field: "done" },
      controller.signal
    )
  ).toEqual({ undoToken: "undo" })
  await source.undoTableActionRow("undo")
  source.releaseTableActionUndo(["undo"])
  expect(callRuntime).toHaveBeenCalledWith(
    "session",
    "captureTableActionTarget",
    ["table", {}, null]
  )
  expect(callRuntime).toHaveBeenCalledWith("session", "writeTableActionRow", [
    "table",
    row,
    { field: "done" },
  ])
  controller.abort()
  await expect(
    source.captureTableActionTarget("table", {}, null, controller.signal)
  ).rejects.toThrow()
  expect(() =>
    source.writeTableActionRow(
      "table",
      row,
      { field: "bad" },
      controller.signal
    )
  ).toThrow()
})

const plan = {
  fileName: "tasks.csv",
  tableName: "Tasks",
  rowCount: 2,
  skippedRowCount: 0,
  columns: [],
  sampleRows: [],
  issues: [],
} satisfies EidosFileCsvImportPlan

const importResult = {
  table: { id: "table-2", name: "Tasks" },
  importedRowCount: 2,
  skippedRowCount: 0,
} as EidosFileCsvImportResult

it("routes CSV preview and import through the opaque runtime session", async () => {
  const callRuntime = vi.fn(
    async (_sessionId: string, method: string): Promise<unknown> => {
      if (method === "previewCsv") return plan
      if (method === "importCsv") return { snapshot, result: importResult }
      if (method === "getSnapshot") return snapshot
      throw new Error(`Unexpected runtime method: ${method}`)
    }
  )
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: { callRuntime } as unknown as EidosLiteApi,
  })
  const onSnapshot = vi.fn()
  const source = new IpcEidosFileDataSource("session-1", snapshot, onSnapshot)
  const bytes = new TextEncoder().encode("Name\nAda\n").buffer

  await expect(source.previewCsv("tasks.csv", bytes)).resolves.toBe(plan)
  await expect(source.importCsv("tasks.csv", bytes)).resolves.toEqual({
    snapshot,
    result: importResult,
  })
  expect(callRuntime).toHaveBeenNthCalledWith(1, "session-1", "previewCsv", [
    "tasks.csv",
    bytes,
    {},
  ])
  expect(callRuntime).toHaveBeenNthCalledWith(2, "session-1", "importCsv", [
    "tasks.csv",
    bytes,
    {},
  ])
  expect(callRuntime).toHaveBeenNthCalledWith(3, "session-1", "getSnapshot", [])
  expect(onSnapshot).toHaveBeenCalledWith(snapshot)
})

it("routes sorted Row ID location through the opaque runtime session", async () => {
  const callRuntime = vi.fn(async () => 7)
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: { callRuntime } as unknown as EidosLiteApi,
  })
  const source = new IpcEidosFileDataSource("session-1", snapshot)
  const query = {
    sorts: [{ field: "score", direction: "desc" as const }],
  }

  await expect(source.getRowIndex("tasks", "row-7", query)).resolves.toBe(7)
  expect(callRuntime).toHaveBeenCalledWith("session-1", "getRowIndex", [
    "tasks",
    "row-7",
    query,
  ])
})

it("routes record neighbors through the opaque runtime session", async () => {
  const result = { found: true, previousId: null, nextId: "row-8" }
  const callRuntime = vi.fn(async () => result)
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: { callRuntime } as unknown as EidosLiteApi,
  })
  const source = new IpcEidosFileDataSource("session-1", snapshot)
  await expect(
    source.getRecordNeighbors("tasks", "row-7", {})
  ).resolves.toEqual(result)
  expect(callRuntime).toHaveBeenCalledWith("session-1", "getRecordNeighbors", [
    "tasks",
    "row-7",
    {},
  ])
})

it("routes deletion undo through the opaque runtime session", async () => {
  const result = {
    tableId: "tasks",
    rowCount: 2,
    revision: 4,
    undoToken: "redo-delete",
  }
  const callRuntime = vi.fn(async () => result)
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: { callRuntime } as unknown as EidosLiteApi,
  })
  const source = new IpcEidosFileDataSource("session-1", snapshot)

  await expect(source.revertRowMutation("tasks", "undo-delete")).resolves.toBe(
    result
  )
  expect(callRuntime).toHaveBeenCalledWith("session-1", "revertRowMutation", [
    "tasks",
    "undo-delete",
  ])
})

it("restores schema impact confirmation errors after the IPC boundary", async () => {
  const impact = {
    classification: "lossless-rewrite" as const,
    affectedRows: "3",
    dependencyCount: "1",
    warnings: [],
    warningsTruncated: false,
    valueChanges: [],
    valueChangesTruncated: false,
  }
  const workerSignal = eidosLiteSchemaImpactRequiredResult(
    Object.assign(
      new Error("Review the schema change impact before applying it"),
      {
        name: "EidosFileSchemaImpactRequiredError",
        code: "schema-impact-confirmation-required",
        impact,
      }
    )
  )
  expect(workerSignal).not.toBeNull()
  const callRuntime = vi.fn(async () => workerSignal)
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: { callRuntime } as unknown as EidosLiteApi,
  })
  const source = new IpcEidosFileDataSource("session-1", snapshot)

  let received: unknown
  try {
    await source.updateField("tasks", "status", {
      optionValueChanges: [{ from: "Twitter", to: "X" }],
    })
  } catch (error) {
    received = error
  }

  expect(received).toBeInstanceOf(EidosFileSchemaImpactRequiredError)
  expect(received).toMatchObject({
    code: "schema-impact-confirmation-required",
    impact,
  })
  expect(callRuntime).toHaveBeenCalledTimes(1)
})

it("builds a portable CSV export name from the active file, table, and view", () => {
  expect(
    eidosLiteCsvFileName("project.eidos", "Roadmap / 2026", "Grid: Active")
  ).toBe("project.eidos - Roadmap - 2026 - Grid- Active.csv")
})
