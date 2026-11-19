import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import {
  Runtime,
  type EidosFileFieldInfo,
  type EidosFileRowMutationResult,
} from "@eidos.space/eidos-file"
import { createTestWasmConnection } from "../../eidos-file/src/sqlite-wasm-test-helper"
import { EidosRuntimeEditorDataSource } from "./runtime-editor-data-source"
import { EidosFileEditorView } from "./eidos-file-editor-view"
import { EidosFileCreateRecordButton } from "./eidos-file-create-record-button"
import { EidosFileUIProvider } from "./context"
import { eidosFileGalleryPlugin } from "./plugins/gallery"
import { eidosFileCalendarPlugin } from "./plugins/calendar"
import { eidosFileKanbanPlugin } from "./plugins/kanban"
import type * as CalendarView from "./eidos-file-calendar-view"

const capture = vi.hoisted(() => ({
  result: null as EidosFileRowMutationResult | null,
  pending: null as Promise<EidosFileRowMutationResult> | null,
  field: null as EidosFileFieldInfo | null,
}))
vi.mock("./eidos-file-grid", () => ({
  EidosFileGrid: ({
    onAddRow,
  }: {
    onAddRow: () => { settled: Promise<EidosFileRowMutationResult> }
  }) => (
    <button
      onClick={async () => {
        capture.pending = onAddRow().settled
        capture.result = await capture.pending
      }}
    >
      Create
    </button>
  ),
}))
vi.mock("./eidos-file-gallery-view", () => ({
  EidosFileGalleryView: ({
    onAddRow,
  }: {
    onAddRow: () => Promise<EidosFileRowMutationResult>
  }) => (
    <button
      onClick={async () => {
        capture.pending = onAddRow()
        capture.result = await capture.pending
      }}
    >
      Create
    </button>
  ),
}))
vi.mock("./eidos-file-calendar-view", async (original) => ({
  ...(await original<typeof CalendarView>()),
  EidosFileCalendarView: ({
    onAddRow,
  }: {
    onAddRow: (
      field: EidosFileFieldInfo,
      day: Date
    ) => Promise<EidosFileRowMutationResult>
  }) => (
    <button
      onClick={async () => {
        capture.pending = onAddRow(capture.field!, new Date(2026, 10, 20))
        capture.result = await capture.pending
      }}
    >
      Create
    </button>
  ),
}))
vi.mock("./eidos-file-kanban-view", () => ({
  EidosFileKanbanView: ({
    onAddRow,
  }: {
    onAddRow: (
      field: EidosFileFieldInfo,
      value: string,
      title: string
    ) => Promise<EidosFileRowMutationResult>
  }) => (
    <button
      onClick={async () => {
        capture.pending = onAddRow(capture.field!, "Done", "Explicit title")
        capture.result = await capture.pending
      }}
    >
      Create
    </button>
  ),
}))

it("Grid, Gallery, Calendar and Kanban create through captured View filters and the real Runtime", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const port = await createTestWasmConnection()
  const { service } = await Runtime.create(
    port,
    {
      clock: {
        nowInstant: () => "2026-11-16T16:00:00.123Z",
        nowMilliseconds: () => performance.now(),
      },
      entropy: {
        randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
      },
    },
    { title: "View creation" },
    {
      cancellation: { cancelled: () => false, onCancel: () => () => undefined },
    }
  )
  const source = new EidosRuntimeEditorDataSource(service, "synthetic.eidos")
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  try {
    await source.initialize()
    const snapshot = await source.createTable({
      name: "Tasks",
      fields: [
        { name: "Title", type: "text" },
        { name: "Flag", type: "checkbox" },
        {
          name: "State",
          type: "select",
          property: {
            options: [{ name: "Todo" }, { name: "Done" }],
            defaultOption: "Todo",
          },
        },
        { name: "Day", type: "date", property: { defaultValue: "now" } },
      ],
    })
    const table = snapshot.tables[0]!,
      field = (name: string) =>
        table.fields.find((field) => field.name === name)!
    const base = table.views[0]!
    for (const type of ["grid", "gallery", "calendar", "kanban"]) {
      capture.result = null
      capture.pending = null
      capture.field = field(type === "calendar" ? "Day" : "State")
      let resolveToolbarCreation!: (result: EidosFileRowMutationResult) => void
      let rejectToolbarCreation!: (error: unknown) => void
      const toolbarCreation = new Promise<EidosFileRowMutationResult>(
        (resolve, reject) => {
          resolveToolbarCreation = resolve
          rejectToolbarCreation = reject
        }
      )
      const view = {
        ...base,
        type,
        properties: {
          ...base.properties,
          dateField: field("Day").id,
          groupField: field("State").id,
        },
        filter: {
          type: "group" as const,
          conjunction: "and" as const,
          children: [
            {
              type: "rule" as const,
              field: field("State").id,
              operator: "equals" as const,
              value: "Done",
            },
            {
              type: "rule" as const,
              field: field("Flag").id,
              operator: "equals" as const,
              value: true,
            },
          ],
        },
      }
      await act(async () =>
        root.render(
          <EidosFileUIProvider
            timeZone="Asia/Shanghai"
            calendarPeriodTimeZoneData={["2026f"]}
            calendarWindowVersion={1}
          >
            {type === "gallery" ? (
              <EidosFileCreateRecordButton
                source={source}
                table={table}
                view={view}
                onCreated={(result) => {
                  capture.result = result
                  resolveToolbarCreation(result)
                }}
                onError={rejectToolbarCreation}
              />
            ) : (
              <EidosFileEditorView
                source={source}
                table={table}
                view={view}
                plugins={[
                  eidosFileGalleryPlugin,
                  eidosFileCalendarPlugin,
                  eidosFileKanbanPlugin,
                ]}
              />
            )}
          </EidosFileUIProvider>
        )
      )
      await act(async () => {
        container.querySelector("button")!.click()
        await (type === "gallery" ? toolbarCreation : capture.pending)
      })
      expect(capture.result, type).not.toBeNull()
      const row = capture.result!.row
      expect([row[field("State").id], row[field("Flag").id]], type).toEqual([
        "Done",
        true,
      ])
      expect(row[field("Day").id], type).toBe(
        type === "calendar" ? "2026-11-20" : "2026-11-17"
      )
      if (type === "kanban")
        expect(row[field("Title").id]).toBe("Explicit title")
      expect(
        (
          await source.getPage(table.table.id, 0, 20, { filter: view.filter })
        ).rows.map((row) => row._id)
      ).toContain(row._id)
    }
  } finally {
    await act(async () => root.unmount())
    container.remove()
    await service.close({ requestId: "close" })
  }
})
