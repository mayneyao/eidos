// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  EidosFileCalendarView,
  eidosFileCalendarCreateMode,
  eidosFileCalendarCreateValue,
  eidosFileCalendarDateFields,
  eidosFileCalendarLayout,
  eidosFileCalendarRowDateKey,
  type EidosFileCalendarPageRequest,
  type EidosFileCalendarRange,
} from "./eidos-file-calendar-view"
import {
  eidosFileCalendarPlugin,
  eidosFileCalendarRangeFilter,
} from "./plugins/calendar"

const contextMocks = vi.hoisted(() => ({
  weekStartsOnMonday: true,
  timeZone: undefined as string | undefined,
}))

vi.mock("./context", () => ({
  useEidosFileUI: () => ({
    weekStartsOnMonday: contextMocks.weekStartsOnMonday,
    timeZone: contextMocks.timeZone,
    translate: (
      message: string,
      values: Record<string, string | number> = {}
    ) =>
      Object.entries(values).reduce(
        (text, [key, value]) => text.replace(`{${key}}`, String(value)),
        message
      ),
  }),
}))

vi.mock("./eidos-file-record-inspector", () => ({
  EidosFileRecordInspector: ({ row }: { row: { title?: string } }) => (
    <aside data-testid="record-inspector">{row.title}</aside>
  ),
}))

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const fields: EidosFileFieldInfo[] = [
  {
    id: "0198c72d-82b5-7000-8000-000000000001",
    tableId: "tasks",
    name: "Title",
    type: "text",
    tableName: "tb_tasks",
    tableColumnName: "title",
    isRecordLabel: true,
    property: null,
    storageCodec: "scalar",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  },
  {
    id: "0198c72d-82b5-7000-8000-000000000002",
    tableId: "tasks",
    name: "Due",
    type: "date",
    tableName: "tb_tasks",
    tableColumnName: "due",
    property: null,
    storageCodec: "scalar",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  },
  {
    id: "0198c72d-82b5-7000-8000-000000000003",
    tableId: "tasks",
    name: "Calculated time",
    type: "formula",
    tableName: "tb_tasks",
    tableColumnName: "calculated_time",
    property: { displayType: "datetime" },
    storageCodec: "materialized_text",
    valueKind: "derived",
    isHidden: false,
    isDerived: true,
    sourceTableColumnName: null,
    dependsOn: [],
  },
]

const createdField: EidosFileFieldInfo = {
  id: "0198c72d-82b5-7000-8000-000000000004",
  tableId: "tasks",
  name: "Created at",
  type: "created-time",
  tableName: "tb_tasks",
  tableColumnName: "created_at",
  systemRole: "created-time",
  property: null,
  storageCodec: "scalar",
  valueKind: "system",
  isHidden: true,
  isDerived: false,
  sourceTableColumnName: "created_at",
  dependsOn: null,
}

const table: EidosFileTableSnapshot = {
  table: {
    id: "tasks",
    name: "Tasks",
    rawTableName: "tb_tasks",
    position: 0,
    icon: null,
    description: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  fields,
  views: [],
  rowCount: 2,
}

const view: EidosFileViewInfo = {
  id: "calendar",
  name: "Schedule",
  type: "calendar",
  tableId: "tasks",
  query: "",
  properties: { dateField: fields[1]!.id },
  filter: null,
  sorts: [],
  orderMap: null,
  hiddenFields: [],
  position: 0,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
}

function localDayKey(date: Date): string {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

function calendarLoader(rows: EidosFileRow[]) {
  return vi.fn(
    async (
      field: EidosFileFieldInfo,
      range: EidosFileCalendarRange,
      request: EidosFileCalendarPageRequest
    ) => {
      const key = localDayKey(range.start)
      const matching = rows.filter(
        (row) =>
          eidosFileCalendarRowDateKey(row, field, contextMocks.timeZone) === key
      )
      const offset = request.cursor
        ? Number(request.cursor.replace("cursor:", ""))
        : 0
      const page = matching.slice(offset, offset + request.limit)
      const nextOffset = offset + page.length
      return {
        rows: page,
        total: matching.length,
        nextCursor:
          nextOffset < matching.length ? `cursor:${nextOffset}` : null,
      }
    }
  )
}

async function settleCalendarLoad(): Promise<void> {
  for (let index = 0; index < 64; index += 1) await Promise.resolve()
}

describe("EidosFileCalendarView", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    contextMocks.weekStartsOnMonday = true
    contextMocks.timeZone = undefined
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 21, 12))
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it("recognizes stored and derived temporal fields", () => {
    expect(
      eidosFileCalendarDateFields(fields).map((field) => field.name)
    ).toEqual(["Due", "Calculated time"])
    expect(
      eidosFileCalendarRowDateKey({ _id: "one", due: "2026-08-21" }, fields[1]!)
    ).toBe("2026-08-21")
  })

  it("defaults unknown saved Calendar layouts to month", () => {
    expect(eidosFileCalendarLayout(undefined)).toBe("month")
    expect(eidosFileCalendarLayout("agenda")).toBe("month")
    expect(eidosFileCalendarLayout("week")).toBe("week")
    expect(eidosFileCalendarLayout("day")).toBe("month")
  })

  it("creates new Calendar views in month layout", () => {
    expect(
      eidosFileCalendarPlugin.views[0]?.create?.properties?.(fields)
    ).toEqual({
      dateField: fields[1]!.id,
      calendarLayout: "month",
    })
  })

  it("derives safe creation behavior from the selected field", () => {
    const day = new Date(2026, 7, 24)
    expect(eidosFileCalendarCreateMode(fields[1]!)).toBe("all-days")
    expect(eidosFileCalendarCreateValue(fields[1]!, day)).toBe("2026-08-24")
    expect(eidosFileCalendarCreateMode(fields[2]!)).toBe("none")
    expect(eidosFileCalendarCreateMode(createdField)).toBe("today")
    expect(eidosFileCalendarCreateValue(createdField, day)).toBeUndefined()
  })

  it("groups and creates date-time records in the Host-selected zone", () => {
    const datetimeField = { ...fields[1]!, type: "datetime" as const }
    expect(
      eidosFileCalendarRowDateKey(
        { _id: "one", due: "2026-01-01T00:30:00.000Z" },
        datetimeField,
        "America/Los_Angeles"
      )
    ).toBe("2025-12-31")
    expect(
      eidosFileCalendarCreateValue(
        datetimeField,
        new Date(2026, 0, 1),
        "Asia/Shanghai"
      )
    ).toBe("2025-12-31T16:00:00.000Z")

    const filter = eidosFileCalendarRangeFilter(
      null,
      datetimeField,
      {
        start: new Date(2026, 0, 1),
        end: new Date(2026, 0, 2),
      },
      "Asia/Shanghai"
    )
    expect(filter.children).toMatchObject([
      { value: "2025-12-31T16:00:00.000Z" },
      { value: "2026-01-01T16:00:00.000Z" },
    ])
  })

  it("adds the visible range without replacing the saved filter", () => {
    const saved = {
      type: "group" as const,
      conjunction: "and" as const,
      children: [
        {
          type: "rule" as const,
          field: "done",
          operator: "equals" as const,
          value: false,
        },
      ],
    }
    const filter = eidosFileCalendarRangeFilter(saved, fields[1]!, {
      start: new Date(2026, 7, 1),
      end: new Date(2026, 8, 1),
    })
    expect(filter.children[0]).toBe(saved)
    expect(filter.children.slice(1)).toEqual([
      {
        type: "rule",
        field: fields[1]!.id,
        operator: "greater-than-or-equal",
        value: "2026-08-01",
      },
      {
        type: "rule",
        field: fields[1]!.id,
        operator: "less-than",
        value: "2026-09-01",
      },
    ])
  })

  it("renders the current month and opens a dated record", async () => {
    const loadRows = calendarLoader([
      { _id: "one", title: "Ship calendar", due: "2026-08-21" },
      { _id: "two", title: "Review spec", due: "2026-08-24" },
    ])
    await act(async () => {
      root.render(
        <EidosFileCalendarView table={table} view={view} loadRows={loadRows} />
      )
      await settleCalendarLoad()
    })

    expect(container.textContent).toContain("August 2026")
    expect(container.textContent).toContain("Ship calendar")
    const toolbar = container.querySelector("header")
    expect(toolbar?.className).toContain("h-10")
    expect(toolbar?.className).toContain("gap-3")
    expect(toolbar?.firstElementChild?.tagName).toBe("H2")
    expect(toolbar?.firstElementChild?.textContent).toBe("August 2026")
    expect(
      container.querySelector("[data-eidos-file-calendar-weekdays]")?.className
    ).toContain("sticky")
    expect(
      Array.from(toolbar?.querySelectorAll("button") ?? []).map(
        (button) => button.getAttribute("aria-label") ?? button.textContent
      )
    ).toEqual(["Month", "Week", "Previous month", "Today", "Next month"])
    expect(loadRows).toHaveBeenCalledTimes(42)
    expect(loadRows).toHaveBeenNthCalledWith(
      1,
      fields[1],
      expect.objectContaining({
        start: expect.any(Date),
        end: expect.any(Date),
      }),
      { limit: 4 }
    )
    const loadedRange = loadRows.mock.calls[0]![1]
    expect(loadedRange.start).toEqual(new Date(2026, 6, 27))
    expect(loadedRange.end).toEqual(new Date(2026, 6, 28))
    const finalRange = loadRows.mock.calls.at(-1)![1]
    expect(finalRange.start).toEqual(new Date(2026, 8, 6))
    expect(finalRange.end).toEqual(new Date(2026, 8, 7))

    const record = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Ship calendar"
    )
    act(() => record?.click())
    expect(
      container.querySelector('[data-testid="record-inspector"]')?.textContent
    ).toBe("Ship calendar")
  })

  it("loads one Host-aligned week for the saved week layout", async () => {
    const loadRows = calendarLoader([])
    await act(async () => {
      root.render(
        <EidosFileCalendarView
          table={table}
          view={{
            ...view,
            properties: { ...view.properties, calendarLayout: "week" },
          }}
          loadRows={loadRows}
        />
      )
      await settleCalendarLoad()
    })

    expect(
      container
        .querySelector("[data-eidos-file-calendar]")
        ?.getAttribute("data-eidos-file-calendar-layout")
    ).toBe("week")
    expect(loadRows).toHaveBeenCalledTimes(7)
    expect(loadRows.mock.calls[0]?.[2]).toEqual({ limit: 9 })
    expect(
      container.querySelector("[data-eidos-file-calendar-time-axis]")
    ).toBeNull()
    expect(loadRows.mock.calls[0]?.[1]).toEqual({
      start: new Date(2026, 7, 17),
      end: new Date(2026, 7, 18),
    })
    expect(loadRows.mock.calls.at(-1)?.[1]).toEqual({
      start: new Date(2026, 7, 23),
      end: new Date(2026, 7, 24),
    })
    expect(
      container.querySelector('[aria-label="Previous week"]')
    ).not.toBeNull()
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Next week"]')
        ?.click()
      await settleCalendarLoad()
    })
    expect(loadRows).toHaveBeenCalledTimes(14)
    expect(loadRows.mock.calls[7]?.[1]).toEqual({
      start: new Date(2026, 7, 24),
      end: new Date(2026, 7, 25),
    })
  })

  it("shows local times and keeps eight week cards before folding", async () => {
    contextMocks.timeZone = "UTC"
    const busyRows = Array.from({ length: 10 }, (_, index) => ({
      _id: `timed-${index}`,
      title: `Timed event ${index}`,
      calculated_time: `2026-08-21T${String(index).padStart(2, "0")}:30:00.000Z`,
    }))
    const loadRows = calendarLoader(busyRows)
    await act(async () => {
      root.render(
        <EidosFileCalendarView
          table={table}
          view={{
            ...view,
            properties: {
              ...view.properties,
              dateField: fields[2]!.id,
              calendarLayout: "week",
            },
          }}
          loadRows={loadRows}
        />
      )
      await settleCalendarLoad()
    })

    const timeLabels = container.querySelectorAll(
      "[data-eidos-file-calendar-record-time]"
    )
    expect(timeLabels).toHaveLength(8)
    expect(timeLabels[0]?.textContent).toBe(
      new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
      }).format(new Date("2026-08-21T00:30:00.000Z"))
    )
    expect(container.textContent).toContain("Timed event 7")
    expect(container.textContent).not.toContain("Timed event 8")
    expect(container.textContent).toContain("2 more")
  })

  it("switches Calendar layout optimistically and requests persistence", async () => {
    const onLayoutChange = vi.fn().mockResolvedValue(undefined)
    await act(async () => {
      root.render(
        <EidosFileCalendarView
          table={table}
          view={view}
          loadRows={calendarLoader([])}
          loadDayTotals={async () => new Map()}
          onLayoutChange={onLayoutChange}
        />
      )
      await settleCalendarLoad()
    })

    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent === "Week")
        ?.click()
      await settleCalendarLoad()
    })

    expect(onLayoutChange).toHaveBeenCalledWith("week")
    expect(
      container
        .querySelector("[data-eidos-file-calendar]")
        ?.getAttribute("data-eidos-file-calendar-layout")
    ).toBe("week")
  })

  it("keeps a busy month bounded and pages only the expanded day", async () => {
    const busyRows = Array.from({ length: 8 }, (_, index) => ({
      _id: `busy-${index}`,
      title: `Busy event ${index}`,
      due: "2026-08-21",
    }))
    const loadRows = calendarLoader(busyRows)
    await act(async () => {
      root.render(
        <EidosFileCalendarView
          table={table}
          view={view}
          loadRows={loadRows}
          loadDayTotals={async () => new Map([["2026-08-21", 8]])}
        />
      )
      await settleCalendarLoad()
    })

    expect(loadRows).toHaveBeenCalledTimes(1)
    expect(loadRows.mock.calls[0]?.[2]).toEqual({ limit: 4, totalHint: 8 })
    expect(container.textContent).toContain("Busy event 0")
    expect(container.textContent).not.toContain("Busy event 4")
    const showMore = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button")
    ).find((button) => button.textContent === "5 more")
    await act(async () => {
      showMore?.click()
      await settleCalendarLoad()
    })

    expect(loadRows).toHaveBeenCalledTimes(2)
    expect(loadRows.mock.calls.at(-1)?.[2]).toEqual({
      limit: 100,
      cursor: "cursor:4",
      totalHint: 8,
    })
    expect(container.textContent).toContain("Busy event 7")
    expect(container.textContent).toContain("Show less")
  })

  it("keeps multiple busy days expanded independently", async () => {
    const busyRows = ["2026-08-21", "2026-08-22"].flatMap((due) =>
      Array.from({ length: 5 }, (_, index) => ({
        _id: `${due}-${index}`,
        title: `${due} event ${index}`,
        due,
      }))
    )
    const loadRows = calendarLoader(busyRows)
    await act(async () => {
      root.render(
        <EidosFileCalendarView
          table={table}
          view={view}
          loadRows={loadRows}
          loadDayTotals={async () =>
            new Map([
              ["2026-08-21", 5],
              ["2026-08-22", 5],
            ])
          }
        />
      )
      await settleCalendarLoad()
    })

    const showMore = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button")
    ).filter((button) => button.textContent === "2 more")
    expect(showMore).toHaveLength(2)
    await act(async () => {
      showMore[0]?.click()
      showMore[1]?.click()
      await settleCalendarLoad()
    })

    expect(container.textContent).toContain("2026-08-21 event 4")
    expect(container.textContent).toContain("2026-08-22 event 4")
    expect(
      Array.from(
        container.querySelectorAll<HTMLButtonElement>("button")
      ).filter((button) => button.textContent === "Show less")
    ).toHaveLength(2)
  })

  it("starts Calendar weeks on Sunday when the Host preference is off", async () => {
    contextMocks.weekStartsOnMonday = false
    const loadRows = calendarLoader([])

    await act(async () => {
      root.render(
        <EidosFileCalendarView table={table} view={view} loadRows={loadRows} />
      )
      await settleCalendarLoad()
    })

    const weekdayLabels = Array.from(
      container.querySelectorAll("[data-eidos-file-calendar-weekdays] > div")
    ).map((element) => element.textContent)
    expect(weekdayLabels[0]).toBe("Sun")
    expect(weekdayLabels[6]).toBe("Sat")
    const loadedRange = loadRows.mock.calls[0]![1]
    expect(loadedRange.start).toEqual(new Date(2026, 6, 26))
    expect(loadedRange.end).toEqual(new Date(2026, 6, 27))
  })

  it("creates a record with the selected writable calendar day", async () => {
    const onAddRow = vi.fn(async (_field: EidosFileFieldInfo, day: Date) => ({
      tableId: table.table.id,
      rowCount: 3,
      row: {
        _id: "three",
        title: "New task",
        due: [
          String(day.getFullYear()).padStart(4, "0"),
          String(day.getMonth() + 1).padStart(2, "0"),
          String(day.getDate()).padStart(2, "0"),
        ].join("-"),
      },
    }))
    await act(async () => {
      root.render(
        <EidosFileCalendarView
          table={table}
          view={view}
          loadRows={calendarLoader([])}
          onAddRow={onAddRow}
        />
      )
      await settleCalendarLoad()
    })

    const create = container.querySelector<HTMLButtonElement>(
      '[aria-label="New record on 2026-08-24"]'
    )
    await act(async () => {
      create?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onAddRow).toHaveBeenCalledWith(fields[1], new Date(2026, 7, 24))
    expect(container.textContent).toContain("New task")
    expect(
      container.querySelector('[data-testid="record-inspector"]')?.textContent
    ).toBe("New task")
  })

  it("opens record actions from a calendar item context menu", async () => {
    const row = {
      _id: "context-record",
      title: "Context action task",
      due: "2026-08-24",
    }
    const onDeleteRow = vi.fn(async () => undefined)
    await act(async () => {
      root.render(
        <EidosFileCalendarView
          table={table}
          view={view}
          loadRows={calendarLoader([row])}
          onDeleteRow={onDeleteRow}
        />
      )
      await settleCalendarLoad()
    })

    await act(async () => {
      container
        .querySelector<HTMLElement>('[title="Context action task"]')
        ?.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            button: 2,
            clientX: 80,
            clientY: 80,
          })
        )
      await Promise.resolve()
    })

    const menu = document.body.querySelector<HTMLElement>(
      "[data-eidos-file-calendar-record-menu]"
    )
    expect(menu?.textContent).toContain("Open record")
    expect(menu?.textContent).toContain("Copy record ID")
    expect(menu?.textContent).toContain("Delete record")
    await act(async () => {
      Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
        .find((item) => item.textContent?.includes("Delete record"))
        ?.click()
      await Promise.resolve()
    })
    await act(async () => {
      Array.from(document.body.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent === "Delete record")
        ?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onDeleteRow).toHaveBeenCalledWith(row)
    expect(container.textContent).not.toContain("Context action task")
  })

  it("only offers today when the selected field is Created at", async () => {
    const createdTable = { ...table, fields: [...fields, createdField] }
    const createdView = {
      ...view,
      properties: { dateField: createdField.id },
    }
    await act(async () => {
      root.render(
        <EidosFileCalendarView
          table={createdTable}
          view={createdView}
          loadRows={calendarLoader([])}
          onAddRow={vi.fn()}
        />
      )
      await settleCalendarLoad()
    })

    const createButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '[aria-label^="New record on"]'
      )
    )
    expect(createButtons).toHaveLength(1)
    expect(createButtons[0]?.getAttribute("aria-label")).toBe(
      "New record on 2026-08-21"
    )
  })
})
