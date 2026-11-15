import { describe, expect, it, vi } from "vitest"
import type {
  EidosFileDataSource,
  EidosFileTableSnapshot,
} from "@eidos.space/eidos-file"
import { explorerPropertyMatches } from "./filter-files"
import type { ExplorerCalendarExecution } from "../../shared/explorer-calendar"
import type { ExplorerFilterGroup } from "../../shared/explorer-file-filter"

const execution: ExplorerCalendarExecution = {
  calendarQueryVersion: 2,
  calendar: {
    timeZone: "America/New_York",
    timeZoneData: "2026f",
    weekStartsOn: 1,
  },
}
const table = {
  table: { id: "records" },
  fields: [
    {
      id: "path",
      name: "path",
      tableColumnName: "path",
      settings: { isSystem: true },
    },
    { id: "day", name: "Day", type: "date", settings: {} },
    { id: "status", name: "Status", type: "text", settings: {} },
  ],
} as unknown as EidosFileTableSnapshot
const period = {
  type: "rule" as const,
  field: "day",
  operator: "is-in-calendar-period" as const,
  value: { unit: "day" as const, offset: 0 as const },
}
const filter: ExplorerFilterGroup = {
  type: "group",
  id: "root",
  conjunction: "and",
  children: [
    {
      type: "rule",
      id: "text",
      field: "property",
      operator: "matches",
      value: {
        type: "rule",
        field: "status",
        operator: "equals",
        value: "Ready",
      },
    },
    {
      type: "group",
      id: "nested",
      conjunction: "or",
      children: [
        {
          type: "rule",
          id: "date",
          field: "property",
          operator: "matches",
          value: period,
        },
      ],
    },
  ],
}

describe("Explorer calendar scan", () => {
  it("binds every predicate, total and >500 continuation to the first Runtime root across midnight", async () => {
    const root = "2026-11-12T23:59:59.999Z"
    let clock = root
    const getPage = vi.fn<EidosFileDataSource["getPage"]>(
      async (tableId, offset, limit, query) => {
        expect(tableId).toBe("records")
        expect(limit).toBe(500)
        expect(query.calendar).toEqual(execution.calendar)
        const isPeriod =
          query.filter!.children[0]!.type === "rule" &&
          query.filter!.children[0]!.operator === "is-in-calendar-period"
        const referenceInstant = query.referenceInstant ?? clock
        if (getPage.mock.calls.length > 1)
          expect(query.referenceInstant).toBe(root)
        clock = "2026-11-13T00:00:00.001Z"
        return {
          tableId,
          offset,
          limit,
          total: 601,
          rows: Array.from({ length: Math.min(500, 601 - offset) }, (_, i) => ({
            _id: String(offset + i),
            path: `./${offset + i}.md`,
          })),
          ...(isPeriod ? { referenceInstant } : {}),
        }
      }
    )
    const result = await explorerPropertyMatches(
      filter,
      table,
      getPage,
      execution
    )
    expect(getPage.mock.calls.map((call) => call[1])).toEqual([0, 500, 0, 500])
    expect(getPage.mock.calls[0]![3].referenceInstant).toBeUndefined()
    expect(result.get("date")?.size).toBe(601)
    expect(result.get("text")?.size).toBe(601)
    expect(result.referenceInstant).toBe(root)
    expect(filter.children[0]!.id).toBe("text")
  })
  it("reuses a Gallery root and rejects missing context, missing/mismatched Runtime roots and retired UTC leaves", async () => {
    const getPage = vi.fn<EidosFileDataSource["getPage"]>(
      async (tableId, offset, limit) => ({
        tableId,
        offset,
        limit,
        total: 0,
        rows: [],
        referenceInstant: "2026-11-12T23:59:59.999Z",
      })
    )
    await explorerPropertyMatches(filter, table, getPage, {
      ...execution,
      referenceInstant: "2026-11-12T23:59:59.999Z",
    })
    expect(getPage.mock.calls[0]![3].referenceInstant).toBe(
      "2026-11-12T23:59:59.999Z"
    )
    await expect(
      explorerPropertyMatches(filter, table, getPage)
    ).rejects.toThrow(/calendar settings/)
    await expect(
      explorerPropertyMatches(filter, table, getPage, {
        ...execution,
        referenceInstant: "2026-11-13T00:00:00.000Z",
      })
    ).rejects.toThrow(/changed/)
    const missing = vi.fn<EidosFileDataSource["getPage"]>(
      async (tableId, offset, limit) => ({
        tableId,
        offset,
        limit,
        total: 0,
        rows: [],
      })
    )
    await expect(
      explorerPropertyMatches(filter, table, missing, execution)
    ).rejects.toThrow(/reference instant/)
    const legacy: ExplorerFilterGroup = {
      ...filter,
      children: [
        {
          type: "rule",
          id: "old",
          field: "property",
          operator: "matches",
          value: {
            ...period,
            operator: "is-relative-to-today",
            value: { direction: "past", unit: "week" },
          },
        },
      ],
    }
    getPage.mockClear()
    await expect(
      explorerPropertyMatches(legacy, table, getPage, execution)
    ).rejects.toThrow(/Reset this date filter/)
    expect(getPage).not.toHaveBeenCalled()
  })
})
