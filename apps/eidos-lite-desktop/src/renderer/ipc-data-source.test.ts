// @vitest-environment jsdom

import type {
  EidosFileCsvImportPlan,
  EidosFileCsvImportResult,
  EidosFileSnapshot,
} from "@eidos.space/eidos-file"

import type { EidosLiteApi } from "../shared/contracts"
import { eidosLiteCsvFileName } from "./csv-workflow"
import { IpcEidosFileDataSource } from "./ipc-data-source"

const snapshot = {
  path: "tasks.eidos",
  metadata: { revision: "2" },
  tables: [],
} as unknown as EidosFileSnapshot

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

it("builds a portable CSV export name from the active file, table, and view", () => {
  expect(
    eidosLiteCsvFileName("project.eidos", "Roadmap / 2026", "Grid: Active")
  ).toBe("project.eidos - Roadmap - 2026 - Grid- Active.csv")
})
