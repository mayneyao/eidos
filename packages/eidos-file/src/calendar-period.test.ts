import { describe, expect, it } from "vitest"
import {
  assertEidosFileCalendarContext,
  eidosFileCalendarPeriodBounds,
  isEidosFileCalendarPeriodValue,
  type EidosFileCalendarContext,
} from "./calendar-period"

const context = (
  timeZone = "UTC",
  weekStartsOn: 0 | 1 = 1
): EidosFileCalendarContext => ({
  timeZone,
  timeZoneData: "2026f",
  weekStartsOn,
})

describe("application calendar periods", () => {
  it.each([
    ["day", -1, "2025-12-31", "2026-01-01"],
    ["day", 0, "2026-01-01", "2026-01-02"],
    ["day", 1, "2026-01-02", "2026-01-03"],
    ["week", -1, "2025-12-22", "2025-12-29"],
    ["week", 0, "2025-12-29", "2026-01-05"],
    ["week", 1, "2026-01-05", "2026-01-12"],
    ["month", -1, "2025-12-01", "2026-01-01"],
    ["month", 0, "2026-01-01", "2026-02-01"],
    ["month", 1, "2026-02-01", "2026-03-01"],
    ["year", -1, "2025-01-01", "2026-01-01"],
    ["year", 0, "2026-01-01", "2027-01-01"],
    ["year", 1, "2027-01-01", "2028-01-01"],
  ] as const)(
    "%s %i is a complete local period",
    (unit, offset, startDate, endDate) => {
      expect(
        eidosFileCalendarPeriodBounds(
          { unit, offset },
          context(),
          "2026-01-01T00:30:00.000Z"
        )
      ).toEqual({
        startDate,
        endDate,
        intervals: [[`${startDate}T00:00:00.000Z`, `${endDate}T00:00:00.000Z`]],
      })
    }
  )

  it.each([
    [
      "Asia/Shanghai",
      "2026-01-01T00:30:00.000Z",
      "2026-01-01",
      "2026-01-02",
      "2025-12-31T16:00:00.000Z",
      "2026-01-01T16:00:00.000Z",
    ],
    [
      "America/New_York",
      "2026-01-01T00:30:00.000Z",
      "2025-12-31",
      "2026-01-01",
      "2025-12-31T05:00:00.000Z",
      "2026-01-01T05:00:00.000Z",
    ],
    [
      "America/New_York",
      "2026-03-08T12:30:00.000Z",
      "2026-03-08",
      "2026-03-09",
      "2026-03-08T05:00:00.000Z",
      "2026-03-09T04:00:00.000Z",
    ],
    [
      "America/New_York",
      "2026-11-01T12:30:00.000Z",
      "2026-11-01",
      "2026-11-02",
      "2026-11-01T04:00:00.000Z",
      "2026-11-02T05:00:00.000Z",
    ],
    [
      "Asia/Kathmandu",
      "2026-01-01T00:30:00.000Z",
      "2026-01-01",
      "2026-01-02",
      "2025-12-31T18:15:00.000Z",
      "2026-01-01T18:15:00.000Z",
    ],
  ])(
    "uses %s local dates at %s",
    (zone, reference, startDate, endDate, lower, upper) => {
      expect(
        eidosFileCalendarPeriodBounds(
          { unit: "day", offset: 0 },
          context(zone),
          reference
        )
      ).toEqual({ startDate, endDate, intervals: [[lower, upper]] })
    }
  )

  it("uses Calendar's existing Sunday/Monday preference", () => {
    const value = { unit: "week", offset: 0 } as const
    const reference = "2026-01-04T12:00:00.000Z"
    expect(
      eidosFileCalendarPeriodBounds(value, context("UTC", 0), reference)
    ).toMatchObject({ startDate: "2026-01-04", endDate: "2026-01-11" })
    expect(
      eidosFileCalendarPeriodBounds(value, context("UTC", 1), reference)
    ).toMatchObject({ startDate: "2025-12-29", endDate: "2026-01-05" })
  })

  it("lets local weeks and months include offset changes instead of fixed durations", () => {
    expect(
      eidosFileCalendarPeriodBounds(
        { unit: "week", offset: 0 },
        context("America/New_York"),
        "2026-03-08T12:00:00.000Z"
      )
    ).toEqual({
      startDate: "2026-03-02",
      endDate: "2026-03-09",
      intervals: [["2026-03-02T05:00:00.000Z", "2026-03-09T04:00:00.000Z"]],
    })
    expect(
      eidosFileCalendarPeriodBounds(
        { unit: "month", offset: 0 },
        context("America/New_York"),
        "2026-11-10T12:00:00.000Z"
      )
    ).toEqual({
      startDate: "2026-11-01",
      endDate: "2026-12-01",
      intervals: [["2026-11-01T04:00:00.000Z", "2026-12-01T05:00:00.000Z"]],
    })
  })

  it("handles leap months, skipped local dates and range limits", () => {
    expect(
      eidosFileCalendarPeriodBounds(
        { unit: "month", offset: -1 },
        context(),
        "2024-03-31T12:00:00.000Z"
      )
    ).toMatchObject({ startDate: "2024-02-01", endDate: "2024-03-01" })
    expect(
      eidosFileCalendarPeriodBounds(
        { unit: "day", offset: 1 },
        context("Pacific/Apia"),
        "2011-12-29T12:00:00.000Z"
      )
    ).toEqual({ startDate: "2011-12-30", endDate: "2011-12-31", intervals: [] })
    expect(() =>
      eidosFileCalendarPeriodBounds(
        { unit: "year", offset: -1 },
        context(),
        "1970-01-01T00:00:00.000Z"
      )
    ).toThrow(/target/)
    expect(() =>
      eidosFileCalendarPeriodBounds(
        { unit: "year", offset: 1 },
        context(),
        "2499-01-01T00:00:00.000Z"
      )
    ).toThrow(/target/)
  })

  it("requires explicit portable context and exact values", () => {
    expect(isEidosFileCalendarPeriodValue({ unit: "week", offset: 0 })).toBe(
      true
    )
    for (const value of [
      { unit: ["week"], offset: 0 },
      { unit: "week", offset: "0" },
      { unit: "day", offset: 2 },
      { unit: "day", offset: 0, timeZone: "UTC" },
    ])
      expect(isEidosFileCalendarPeriodValue(value)).toBe(false)
    for (const value of [
      undefined,
      {},
      { ...context(), timeZone: "system" },
      { ...context(), weekStartsOn: 2 },
      { ...context(), referenceInstant: "2026-01-01T00:00:00.000Z" },
    ])
      expect(() => assertEidosFileCalendarContext(value)).toThrow()
    expect(() =>
      assertEidosFileCalendarContext({ ...context(), timeZoneData: "future" })
    ).toThrow(/unavailable/)
  })
})
