import React, { act, useEffect, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  Runtime,
  type EidosFileRow,
  type EidosFileRowQuery,
  type EidosFileSnapshot,
  type RequestContext,
  type RuntimeClient,
  type ViewDescriptor,
} from "@eidos.space/eidos-file"
import { BetterSqlite3ConnectionPort } from "../../eidos-file/src/better-sqlite3"
import fixture from "../../eidos-file/test-fixtures/date-queries-v1.json"
import { HttpRuntimeClient } from "../../eidos-file-serve/src/client"
import { EidosRuntimeEditorDataSource } from "./runtime-editor-data-source"
import {
  EidosFileEditorView,
  type EidosFileViewRendererProps,
} from "./eidos-file-editor-view"
import { EidosFileUIProvider, useEidosFileUI } from "./context"
import { eidosFileDateTimeInputValue } from "./eidos-file-date-time"
import { eidosFileRecordFieldText } from "./eidos-file-record-format"
import { eidosFileValueToGridCell } from "./eidos-file-grid-adapter"
import { eidosFileCalendarRowDateKey } from "./eidos-file-calendar-view"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close()
  document.body.innerHTML = ""
  vi.restoreAllMocks()
})
async function setup(legacy = false) {
  const filePackage = resolve(process.cwd(), "../eidos-file")
  const Database = createRequire(resolve(filePackage, "package.json"))(
    "better-sqlite3"
  ) as new (
    bytes: Buffer
  ) => ConstructorParameters<typeof BetterSqlite3ConnectionPort>[0]
  const bytes = await readFile(
    resolve(filePackage, "test-fixtures/date-queries-v1.eidos")
  )
  const port = new BetterSqlite3ConnectionPort(new Database(bytes))
  let reference = "2026-11-13T00:30:00.000Z",
    entropy = 100,
    tick = 0
  const runtime = (
    await Runtime.open(
      port,
      {
        clock: { nowInstant: () => reference, nowMilliseconds: () => tick++ },
        entropy: {
          randomBytes: (length) =>
            Uint8Array.from({ length }, () => entropy++ & 255),
        },
      },
      "readwrite",
      { cancellation: { cancelled: () => false, onCancel: () => () => {} } }
    )
  ).service
  const calls: Array<{ method: string; request: Record<string, unknown> }> = []
  let opaque = false
  const client = new HttpRuntimeClient(async (method, payload, context) => {
    // The same request-only JSON envelope used by the Android/iOS Web bridge.
    const wire = JSON.parse(JSON.stringify({ method, request: payload })) as {
      method: keyof RuntimeClient
      request: Record<string, unknown>
    }
    calls.push(wire)
    const operation = runtime[wire.method] as unknown as (
      request: unknown,
      context: RequestContext
    ) => Promise<unknown>
    const result = JSON.parse(
      JSON.stringify(await operation.call(runtime, wire.request, context))
    ) as unknown
    if (legacy && method === "negotiate") {
      const negotiation = result as { capabilities: Record<string, unknown> }
      delete negotiation.capabilities.calendarQueryVersion
      delete negotiation.capabilities.calendarPeriodTimeZoneData
      negotiation.capabilities.calendarDayTimeZoneData = ["2026f"]
    }
    if (legacy && method === "getSchemaPage") {
      const page = result as { objects: Array<Record<string, unknown>> }
      page.objects = page.objects.map((item) =>
        item.object === "view" ? { ...item, queryStatus: "supported" } : item
      )
    }
    if (opaque && method === "getSchemaPage") {
      const page = result as {
        objects: Array<ViewDescriptor | Record<string, unknown>>
      }
      page.objects = page.objects.map((item) =>
        item.object === "view" && item.id === fixture.views[1]!.viewId
          ? {
              ...item,
              queryStatus: "unsupported",
              query: {
                "x.future": { preserved: [null, true, "value"] },
                filter: {
                  op: "future-match",
                  fieldId: fixture.date,
                  value: "keep",
                },
              },
            }
          : item
      )
    }
    return result
  })
  const source = new EidosRuntimeEditorDataSource(client, "synthetic.eidos", {
    calendarQueryVersion: 2,
  })
  const snapshot = await source.initialize()
  calls.length = 0
  cleanup.push(async () => {
    await runtime.close({ requestId: "calendar-ui-close" })
    port.close()
  })
  return {
    source,
    client,
    snapshot,
    calls,
    setReference: (value: string) => {
      reference = value
    },
    useOpaque: () => {
      opaque = true
    },
  }
}

async function mount(
  fixtureState: Awaited<ReturnType<typeof setup>>,
  initialZone: string,
  opaque = false
) {
  const container = document.createElement("div")
  document.body.append(container)
  const root: Root = createRoot(container)
  cleanup.unshift(async () => {
    await act(async () => root.unmount())
  })
  let currentQuery: EidosFileRowQuery = {},
    currentRow: EidosFileRow | undefined
  function Rows({ source, table, query }: EidosFileViewRendererProps) {
    const host = useEidosFileUI()
    const [rows, setRows] = useState<EidosFileRow[]>([])
    currentQuery = query
    useEffect(() => {
      let active = true
      void source.getPage(table.table.id, 0, 20, query).then((page) => {
        if (active) {
          currentRow = page.rows[0]
          setRows(page.rows)
        }
      })
      return () => {
        active = false
      }
    }, [query, source, table.table.id])
    const instant = table.fields.find((field) => field.id === fixture.instant)!
    return (
      <div data-calendar-test-rows>
        {rows.map((row) => {
          const value = String(row[fixture.instant])
          const cell = eidosFileValueToGridCell(
            instant,
            value,
            false,
            row,
            "Unavailable record",
            false,
            host.timeZone,
            undefined,
            host.calendarTimeZoneData
          )
          return (
            <div key={String(row._id)}>
              <span data-label>{String(row[fixture.label])}</span>
              <span data-grid>
                {"data" in cell &&
                cell.data &&
                typeof cell.data === "object" &&
                "displayDate" in cell.data
                  ? String(cell.data.displayDate)
                  : ""}
              </span>
              <span data-card>
                {eidosFileRecordFieldText(
                  row,
                  instant,
                  host.timeZone,
                  host.calendarTimeZoneData
                )}
              </span>
              <span data-calendar>
                {eidosFileCalendarRowDateKey(
                  row,
                  instant,
                  host.timeZone,
                  host.calendarTimeZoneData
                )}
              </span>
              <input
                data-input
                readOnly
                value={eidosFileDateTimeInputValue(
                  new Date(value),
                  host.timeZone,
                  true,
                  host.calendarTimeZoneData
                )}
              />
            </div>
          )
        })}
      </div>
    )
  }
  function App({ zone }: { zone: string }) {
    const [snapshot, setSnapshot] = useState<EidosFileSnapshot>(
      fixtureState.snapshot
    )
    const table = snapshot.tables.find(
      (table) => table.table.id === fixture.tableId
    )!
    const view = table.views.find(
      (view) => view.id === fixture.views[1]!.viewId
    )!
    return (
      <EidosFileUIProvider
        timeZone={zone}
        calendarPeriodTimeZoneData={
          snapshot.queryCapabilities?.calendarPeriodTimeZoneData
        }
      >
        <EidosFileEditorView
          source={fixtureState.source}
          table={table}
          view={view}
          renderers={{ grid: Rows }}
          onSnapshot={setSnapshot}
        />
      </EidosFileUIProvider>
    )
  }
  if (opaque) {
    fixtureState.useOpaque()
    fixtureState.snapshot = await fixtureState.source.getSnapshot()
    fixtureState.calls.length = 0
  }
  const render = async (zone: string) => {
    await act(async () => {
      root.render(<App zone={zone} />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
  await render(initialZone)
  return { container, render, query: () => currentQuery, row: () => currentRow }
}

describe("application calendar query flow", () => {
  it("does not revive UTC conditions when an older Runtime advertises the old model", async () => {
    const fixtureState = await setup(true)
    const ui = await mount(fixtureState, "America/New_York")
    expect(ui.container.querySelector("[data-calendar-test-rows]")).toBeNull()
    expect(ui.container.textContent).not.toContain("Update date filters")
    const view = fixtureState.snapshot.tables
      .find((table) => table.table.id === fixture.tableId)!
      .views.find((view) => view.id === fixture.views[1]!.viewId)!
    expect(view.queryStatus).toBe("unsupported")
    await expect(
      fixtureState.source.updateView(view.id, { upgradeDateQuery: true })
    ).rejects.toThrow(/Update this Runtime/)
    await expect(
      fixtureState.source.getPage(fixture.tableId, 0, 20, {
        filter: {
          type: "group",
          conjunction: "and",
          children: [
            {
              type: "rule",
              field: fixture.date,
              operator: "is-relative-to-today",
              value: { direction: "this", unit: "day" },
            },
          ],
        },
      })
    ).rejects.toThrow(/Retired date filters/)
    expect(
      fixtureState.calls.filter((call) =>
        ["queryRows", "aggregate", "groupRows", "mutateView"].includes(
          call.method
        )
      )
    ).toHaveLength(0)
  })

  it("upgrades a real old View and recomputes display, input and membership from the current application zone", async () => {
    const fixtureState = await setup()
    const ui = await mount(fixtureState, "America/New_York")
    expect(ui.container.textContent).toContain(
      "Today (saved time zone) → Today"
    )
    expect(ui.container.textContent).toContain("Their meaning will change")
    expect(ui.container.querySelector("[data-calendar-test-rows]")).toBeNull()
    expect(
      fixtureState.calls.filter((call) =>
        ["queryRows", "aggregate", "groupRows"].includes(call.method)
      )
    ).toHaveLength(0)
    const button = [...ui.container.querySelectorAll("button")].find(
      (button) => button.textContent === "Update date filters"
    )!
    await act(async () => {
      button.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await vi.waitFor(async () => {
      await act(async () => {})
      expect(ui.container.querySelector("[data-label]")?.textContent).toBe(
        "today"
      )
    })
    for (const key of ["grid", "card"])
      expect(ui.container.querySelector(`[data-${key}]`)?.textContent).toBe(
        "2026-11-12 00:30:00"
      )
    expect(ui.container.querySelector("[data-calendar]")?.textContent).toBe(
      "2026-11-12"
    )
    expect(
      ui.container.querySelector<HTMLInputElement>("[data-input]")?.value
    ).toBe("2026-11-12T00:30:00")
    expect(JSON.stringify(ui.query().filter)).not.toMatch(/timeZone|2026f/)
    expect(
      fixtureState.calls.filter((call) => call.method === "queryRows").at(-1)
        ?.request
    ).toMatchObject({
      calendar: {
        timeZone: "America/New_York",
        timeZoneData: "2026f",
        weekStartsOn: 1,
      },
    })
    await ui.render("Asia/Shanghai")
    await vi.waitFor(async () => {
      await act(async () => {})
      expect(ui.container.querySelector("[data-label]")?.textContent).toBe(
        "boundary"
      )
    })
    for (const key of ["grid", "card"])
      expect(ui.container.querySelector(`[data-${key}]`)?.textContent).toBe(
        "2026-11-13 13:00:00"
      )
    expect(ui.container.querySelector("[data-calendar]")?.textContent).toBe(
      "2026-11-13"
    )
    expect(
      ui.container.querySelector<HTMLInputElement>("[data-input]")?.value
    ).toBe("2026-11-13T13:00:00")
    const rowRequest = fixtureState.calls
      .filter((call) => call.method === "queryRows")
      .at(-1)!.request
    expect(rowRequest.calendar).toEqual({
      timeZone: "Asia/Shanghai",
      timeZoneData: "2026f",
      weekStartsOn: 1,
    })
    fixtureState.setReference("2026-11-14T12:30:00.000Z")
    expect(
      await fixtureState.source.getRecordNeighbors(
        fixture.tableId,
        String(ui.row()!._id),
        ui.query()
      )
    ).toEqual({ found: true, previousId: null, nextId: null })
    expect(fixtureState.calls.at(-1)?.request.referenceInstant).toBe(
      "2026-11-13T00:30:00.000Z"
    )
    expect(
      await fixtureState.source.getGroupCounts(
        fixture.tableId,
        fixture.date,
        ui.query()
      )
    ).toEqual([{ value: "2026-11-13", total: 1 }])
    expect(
      fixtureState.calls.filter((call) => call.method === "groupRows").at(-1)
        ?.request
    ).toMatchObject({
      calendar: rowRequest.calendar,
      referenceInstant: "2026-11-13T00:30:00.000Z",
    })
    const latest = await fixtureState.source.getSnapshot()
    const view = latest.tables
      .find((table) => table.table.id === fixture.tableId)!
      .views.find((view) => view.id === fixture.views[1]!.viewId)!
    expect(JSON.stringify(JSON.parse(view.query))).not.toMatch(/timeZone|2026f/)
    expect(view.properties?.["space.eidos/date-query-upgrade"]).toMatchObject({
      originalQuery: { filter: { op: "or" } },
    })
    const copy = await fixtureState.source.duplicateView(
      view.id,
      "Calendar copy"
    )
    expect(
      copy.tables
        .find((table) => table.table.id === fixture.tableId)!
        .views.find((item) => item.name === "Calendar copy")!.properties?.[
        "space.eidos/date-query-upgrade"
      ]
    ).toEqual(view.properties?.["space.eidos/date-query-upgrade"])
  })
  it("keeps a legacy consumer opaque through the new HTTP SDK while a declared consumer remains editable", async () => {
    const state = await setup()
    await state.source.updateView(fixture.views[1]!.viewId, {
      upgradeDateQuery: true,
    })
    const legacySource = new EidosRuntimeEditorDataSource(
      state.client,
      "legacy.eidos"
    )
    const legacySnapshot = await legacySource.initialize()
    const legacyView = legacySnapshot.tables
      .find((table) => table.table.id === fixture.tableId)!
      .views.find((view) => view.id === fixture.views[1]!.viewId)!
    expect(legacyView.queryStatus).toBe("unsupported")
    expect(JSON.parse(legacyView.query)).toMatchObject({
      filter: {
        args: expect.arrayContaining([
          expect.objectContaining({ op: "calendar-period" }),
        ]),
      },
    })
    await expect(
      legacySource.updateView(legacyView.id, { filter: null })
    ).rejects.toThrow(/explicitly/)
    const declared = await state.source.getSnapshot()
    expect(
      declared.tables
        .find((table) => table.table.id === fixture.tableId)!
        .views.find((view) => view.id === legacyView.id)!.queryStatus
    ).toBe("supported")
    const requests = state.calls.filter(
      (call) => call.method === "getSchemaPage"
    )
    expect(
      requests.some((call) => call.request.calendarQueryVersion === undefined)
    ).toBe(true)
    expect(
      requests.some((call) => call.request.calendarQueryVersion === 2)
    ).toBe(true)
  })
  it("preserves an opaque non-date View through JSON transport and never sends an unfiltered read or ordinary Apply", async () => {
    const fixtureState = await setup()
    const ui = await mount(fixtureState, "America/New_York", true)
    expect(ui.container.querySelector("[data-calendar-test-rows]")).toBeNull()
    expect(ui.container.textContent).not.toContain("Update date filters")
    expect(
      fixtureState.calls.filter((call) =>
        ["queryRows", "aggregate", "groupRows"].includes(call.method)
      )
    ).toHaveLength(0)
    const view = fixtureState.snapshot.tables
      .find((table) => table.table.id === fixture.tableId)!
      .views.find((view) => view.id === fixture.views[1]!.viewId)!
    expect(JSON.parse(view.query)).toMatchObject({
      "x.future": { preserved: [null, true, "value"] },
      filter: { op: "future-match" },
    })
    await expect(
      fixtureState.source.updateView(view.id, { filter: null })
    ).rejects.toThrow(/upgraded explicitly/)
    await expect(fixtureState.source.duplicateView(view.id)).rejects.toThrow(
      /cannot be duplicated safely/
    )
    expect(
      fixtureState.calls.filter((call) => call.method === "mutateView")
    ).toHaveLength(0)
  })
})
