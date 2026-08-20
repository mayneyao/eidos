// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosFileFieldInfo,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  EidosFileCalendarView,
  eidosFileCalendarCreateMode,
  eidosFileCalendarCreateValue,
  eidosFileCalendarDateFields,
  eidosFileCalendarRowDateKey,
  type EidosFileCalendarRange,
} from "./eidos-file-calendar-view"
import { eidosFileCalendarRangeFilter } from "./plugins/calendar"

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
    const loadRows = vi.fn(
      async (_field: EidosFileFieldInfo, _range: EidosFileCalendarRange) => [
        { _id: "one", title: "Ship calendar", due: "2026-08-21" },
        { _id: "two", title: "Review spec", due: "2026-08-24" },
      ]
    )
    await act(async () => {
      root.render(
        <EidosFileCalendarView table={table} view={view} loadRows={loadRows} />
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain("August 2026")
    expect(container.textContent).toContain("Ship calendar")
    const toolbar = container.querySelector("header")
    expect(toolbar?.className).toContain("h-10")
    expect(toolbar?.className).toContain("justify-between")
    expect(toolbar?.firstElementChild?.tagName).toBe("H2")
    expect(toolbar?.firstElementChild?.textContent).toBe("August 2026")
    expect(
      container.querySelector("[data-eidos-file-calendar-weekdays]")?.className
    ).toContain("sticky")
    expect(
      Array.from(toolbar?.querySelectorAll("button") ?? []).map(
        (button) => button.getAttribute("aria-label") ?? button.textContent
      )
    ).toEqual(["Previous month", "Today", "Next month"])
    expect(loadRows).toHaveBeenCalledWith(
      fields[1],
      expect.objectContaining({
        start: expect.any(Date),
        end: expect.any(Date),
      })
    )
    const loadedRange = loadRows.mock.calls[0]![1]
    expect(loadedRange.start).toEqual(new Date(2026, 6, 27))
    expect(loadedRange.end).toEqual(new Date(2026, 8, 7))

    const record = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Ship calendar"
    )
    act(() => record?.click())
    expect(
      container.querySelector('[data-testid="record-inspector"]')?.textContent
    ).toBe("Ship calendar")
  })

  it("starts Calendar weeks on Sunday when the Host preference is off", async () => {
    contextMocks.weekStartsOnMonday = false
    const loadRows = vi.fn(
      async (_field: EidosFileFieldInfo, _range: EidosFileCalendarRange) => []
    )

    await act(async () => {
      root.render(
        <EidosFileCalendarView table={table} view={view} loadRows={loadRows} />
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const weekdayLabels = Array.from(
      container.querySelectorAll("[data-eidos-file-calendar-weekdays] > div")
    ).map((element) => element.textContent)
    expect(weekdayLabels[0]).toBe("Sun")
    expect(weekdayLabels[6]).toBe("Sat")
    const loadedRange = loadRows.mock.calls[0]![1]
    expect(loadedRange.start).toEqual(new Date(2026, 6, 26))
    expect(loadedRange.end).toEqual(new Date(2026, 8, 6))
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
          loadRows={async () => []}
          onAddRow={onAddRow}
        />
      )
      await Promise.resolve()
      await Promise.resolve()
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
          loadRows={async () => [row]}
          onDeleteRow={onDeleteRow}
        />
      )
      await Promise.resolve()
      await Promise.resolve()
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
          loadRows={async () => []}
          onAddRow={vi.fn()}
        />
      )
      await Promise.resolve()
      await Promise.resolve()
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
