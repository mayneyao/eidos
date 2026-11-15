import React, { act, useEffect } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import type {
  EidosFileViewInfo,
  EidosFileFieldInfo,
} from "@eidos.space/eidos-file"
import {
  EidosFileCalendarViewProvider,
  eidosFileCalendarViewContext,
} from "./eidos-file-calendar-context"
import { EidosFileUIProvider, useEidosFileUI } from "./context"
import {
  eidosFileDateTimeText,
  eidosFileInstantFromInputValue,
} from "./eidos-file-date-time"
import { eidosFileValueToGridCell } from "./eidos-file-grid-adapter"
import { eidosFileRecordFieldText } from "./eidos-file-record-format"
import {
  eidosFileCalendarCreateValue,
  eidosFileCalendarRowDateKey,
} from "./eidos-file-calendar-view"
import { eidosFileCalendarRangeFilter } from "./plugins/calendar"

const profile = "2026f",
  zone = "Africa/Casablanca",
  value = "2026-11-15T23:30:00.123Z"
const leaf = {
  op: "calendar-day",
  fieldId: "instant",
  day: "today",
  timeZone: zone,
  timeZoneData: profile,
}
function view(filter: unknown): EidosFileViewInfo {
  return {
    id: "view",
    tableId: "table",
    name: "Calendar",
    type: "grid",
    query: JSON.stringify({ filter }),
    filter: null,
    sorts: [],
    properties: null,
    orderMap: null,
    hiddenFields: [],
    position: 0,
    createdAt: "",
    updatedAt: "",
  }
}
const field: EidosFileFieldInfo = {
  id: "instant",
  tableId: "table",
  name: "Instant",
  type: "datetime",
  tableName: "Records",
  tableColumnName: "instant",
  physicalName: "instant",
  isRecordLabel: false,
  position: 0,
  settings: {},
  property: null,
  storageCodec: "scalar",
  valueKind: "source",
  isHidden: false,
  isDerived: false,
  sourceTableColumnName: null,
  dependsOn: null,
}
const roots: Array<ReturnType<typeof createRoot>> = []
afterEach(async () => {
  await act(async () => {
    roots.splice(0).forEach((root) => root.unmount())
  })
  document.body.innerHTML = ""
  vi.restoreAllMocks()
})

describe("View calendar presentation context", () => {
  it("examines nested NOT and every OR branch without rewriting the query", () => {
    const current = view({
      op: "or",
      args: [leaf, { op: "not", arg: { ...leaf, timeZoneData: "future" } }],
    })
    const raw = current.query
    expect(eidosFileCalendarViewContext(current, [profile, "future"])).toEqual({
      status: "unsupported",
    })
    expect(current.query).toBe(raw)
    expect(
      eidosFileCalendarViewContext(
        view({ op: "not", arg: { op: "or", args: [leaf, leaf] } }),
        [profile]
      )
    ).toEqual({ status: "supported", timeZoneData: profile })
    expect(eidosFileCalendarViewContext(view(leaf), [])).toEqual({
      status: "unsupported",
    })
  })
  it("uses the canonical profile across production Grid, card/record and Calendar helpers", () => {
    const instantCell = eidosFileValueToGridCell(
      field,
      value,
      false,
      undefined,
      "Unavailable record",
      false,
      zone,
      undefined,
      profile
    )
    expect(instantCell).toMatchObject({
      data: {
        displayDate: "2026-11-15 23:30:00",
        calendarTimeZoneData: profile,
      },
    })
    expect(
      eidosFileRecordFieldText(
        { _id: "row", instant: value },
        field,
        zone,
        profile
      )
    ).toBe("2026-11-15 23:30:00")
    expect(
      eidosFileCalendarRowDateKey(
        { _id: "row", instant: value },
        field,
        zone,
        profile
      )
    ).toBe("2026-11-15")
    expect(
      eidosFileInstantFromInputValue(
        "2026-11-15T23:30:00.123",
        zone,
        profile
      )?.toISOString()
    ).toBe(value)
    expect(
      eidosFileCalendarCreateValue(field, new Date(2026, 10, 16), zone, profile)
    ).toBe("2026-11-16T00:00:00.000Z")
    const range = eidosFileCalendarRangeFilter(
      null,
      field,
      { start: new Date(2026, 10, 16), end: new Date(2026, 10, 17) },
      zone,
      profile
    )
    expect(JSON.stringify(range)).toContain("2026-11-16T00:00:00.000Z")
  })
  it("does not consult host rules for pinned projection or inverse input", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new Error("Host rule use")
    })
    expect(eidosFileDateTimeText(new Date(value), zone, profile)).toBe(
      "2026-11-15 23:30:00"
    )
    expect(
      eidosFileInstantFromInputValue(
        "2026-11-15T23:30:00.123",
        zone,
        profile
      )?.toISOString()
    ).toBe(value)
    expect(
      eidosFileInstantFromInputValue(
        "2026-03-08T02:30",
        "America/New_York",
        profile
      )
    ).toBeUndefined()
    expect(
      eidosFileInstantFromInputValue(
        "2026-11-01T01:30",
        "America/New_York",
        profile
      )
    ).toBeUndefined()
  })
  it("enters/leaves the profile without remounting children and preserves the selected zone", async () => {
    const mounted = vi.fn()
    function Probe() {
      const host = useEidosFileUI()
      useEffect(mounted, [])
      return (
        <output data-zone={host.timeZone}>
          {host.calendarTimeZoneData ?? "legacy"}
        </output>
      )
    }
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    roots.push(root)
    const render = (current: EidosFileViewInfo) => (
      <EidosFileUIProvider
        timeZone="Asia/Shanghai"
        calendarDayTimeZoneData={[profile]}
      >
        <EidosFileCalendarViewProvider view={current}>
          <Probe />
        </EidosFileCalendarViewProvider>
      </EidosFileUIProvider>
    )
    await act(async () => root.render(render(view(leaf))))
    const node = container.querySelector("output")!
    expect(node.textContent).toBe(profile)
    expect(node.dataset.zone).toBe("Asia/Shanghai")
    await act(async () =>
      root.render(
        render(
          view({
            op: "relative-date",
            fieldId: "instant",
            direction: "this",
            unit: "day",
          })
        )
      )
    )
    expect(container.querySelector("output")).toBe(node)
    expect(node.textContent).toBe("legacy")
    expect(mounted).toHaveBeenCalledTimes(1)
  })
  it("does not mount a misleading partial view when a profile is unavailable", async () => {
    const rendered = vi.fn()
    function Rows() {
      rendered()
      return <p>rows</p>
    }
    const container = document.createElement("div")
    const root = createRoot(container)
    roots.push(root)
    await act(async () =>
      root.render(
        <EidosFileCalendarViewProvider view={view(leaf)} supported={[]}>
          <Rows />
        </EidosFileCalendarViewProvider>
      )
    )
    expect(rendered).not.toHaveBeenCalled()
    expect(container.textContent).toContain("cannot display")
  })
  it("shows a raw out-of-range value explicitly without failing a page or enabling its Grid editor", () => {
    const cell = eidosFileValueToGridCell(
      field,
      "1969-12-31T23:30:00.123Z",
      false,
      undefined,
      "Unavailable record",
      false,
      "UTC",
      undefined,
      profile
    )
    expect(cell).toMatchObject({
      readonly: true,
      data: {
        displayDate: expect.stringContaining("1969-12-31T23:30:00.123Z"),
      },
    })
    expect(cell).toMatchObject({
      data: {
        displayDate: expect.stringContaining("outside calendar profile"),
      },
    })
  })
})
