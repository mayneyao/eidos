import { describe, expect, it } from "vitest"
import {
  eidosFileCalendarDayBounds,
  projectEidosFileCalendarInstant,
  resolveEidosFileCalendarInstant,
  EIDOS_FILE_CALENDAR_TIME_ZONE_DATA,
  isEidosFileCalendarDayValue,
} from "./calendar-day"

const timeZoneData = EIDOS_FILE_CALENDAR_TIME_ZONE_DATA
describe("portable calendar profile", () => {
  it("rejects malformed calendar-day documents without coercion", () => {
    const valid = { day: "today", timeZone: "UTC", timeZoneData }
    expect(isEidosFileCalendarDayValue(valid)).toBe(true)
    for (const invalid of [
      { ...valid, day: ["today"] },
      { ...valid, timeZone: "" },
      { ...valid, timeZoneData: "" },
      { ...valid, unexpected: true },
    ])
      expect(isEidosFileCalendarDayValue(invalid)).toBe(false)
  })
  it.each([
    [
      "Asia/Shanghai",
      "2026-11-12T12:30:00.000Z",
      "2026-11-12",
      "2026-11-11T16:00:00.000Z",
      "2026-11-12T16:00:00.000Z",
    ],
    [
      "Asia/Shanghai",
      "2026-11-11T16:30:00.000Z",
      "2026-11-12",
      "2026-11-11T16:00:00.000Z",
      "2026-11-12T16:00:00.000Z",
    ],
    [
      "UTC",
      "2026-11-12T12:30:00.000Z",
      "2026-11-12",
      "2026-11-12T00:00:00.000Z",
      "2026-11-13T00:00:00.000Z",
    ],
    [
      "America/New_York",
      "2026-11-12T02:30:00.000Z",
      "2026-11-11",
      "2026-11-11T05:00:00.000Z",
      "2026-11-12T05:00:00.000Z",
    ],
    [
      "Asia/Kathmandu",
      "2026-11-12T12:30:00.000Z",
      "2026-11-12",
      "2026-11-11T18:15:00.000Z",
      "2026-11-12T18:15:00.000Z",
    ],
    [
      "Pacific/Kiritimati",
      "2026-11-12T12:30:00.000Z",
      "2026-11-13",
      "2026-11-12T10:00:00.000Z",
      "2026-11-13T10:00:00.000Z",
    ],
    [
      "America/New_York",
      "2026-03-08T12:30:00.000Z",
      "2026-03-08",
      "2026-03-08T05:00:00.000Z",
      "2026-03-09T04:00:00.000Z",
    ],
    [
      "America/New_York",
      "2026-11-01T12:30:00.000Z",
      "2026-11-01",
      "2026-11-01T04:00:00.000Z",
      "2026-11-02T05:00:00.000Z",
    ],
    [
      "Australia/Lord_Howe",
      "2026-10-04T12:30:00.000Z",
      "2026-10-04",
      "2026-10-03T13:30:00.000Z",
      "2026-10-04T13:00:00.000Z",
    ],
    [
      "Africa/Casablanca",
      "2026-11-16T12:30:00.000Z",
      "2026-11-16",
      "2026-11-16T00:00:00.000Z",
      "2026-11-17T00:00:00.000Z",
    ],
  ])("projects %s from %s", (timeZone, reference, date, start, end) => {
    expect(
      eidosFileCalendarDayBounds(
        { day: "today", timeZone, timeZoneData },
        reference
      )
    ).toEqual({ date, intervals: [[start, end]] })
  })
  it("keeps a skipped calendar date and gives it no instants", () => {
    expect(
      eidosFileCalendarDayBounds(
        { day: "tomorrow", timeZone: "Pacific/Apia", timeZoneData },
        "2011-12-29T12:00:00.000Z"
      )
    ).toEqual({ date: "2011-12-30", intervals: [] })
  })
  it("uses canonical projection for inverse input and preserves milliseconds", () => {
    const parts = projectEidosFileCalendarInstant(
      "2026-11-15T23:30:00.123Z",
      "Africa/Casablanca",
      timeZoneData
    )!
    expect(parts).toMatchObject({ day: 15, hour: 23, millisecond: 123 })
    expect(
      resolveEidosFileCalendarInstant(parts, "Africa/Casablanca", timeZoneData)
    ).toBe("2026-11-15T23:30:00.123Z")
  })
  it.each([
    [3, 8, 2, 30],
    [11, 1, 1, 30],
  ])("rejects New York gaps and folds", (month, day, hour, minute) => {
    expect(
      resolveEidosFileCalendarInstant(
        { year: 2026, month, day, hour, minute, second: 0, millisecond: 0 },
        "America/New_York",
        timeZoneData
      )
    ).toBeNull()
  })
  it("distinguishes unsupported profile/range from invalid names and ordinary out-of-range values", () => {
    expect(() =>
      eidosFileCalendarDayBounds(
        { day: "today", timeZone: "UTC", timeZoneData: "future" },
        "2026-11-12T12:30:00.000Z"
      )
    ).toThrow(/unavailable/)
    expect(() =>
      eidosFileCalendarDayBounds(
        { day: "today", timeZone: "system", timeZoneData },
        "2026-11-12T12:30:00.000Z"
      )
    ).toThrow(/Unknown/)
    expect(() =>
      eidosFileCalendarDayBounds(
        { day: "yesterday", timeZone: "UTC", timeZoneData },
        "1970-01-01T12:30:00.000Z"
      )
    ).toThrow(/target/)
    expect(
      projectEidosFileCalendarInstant(
        "1969-12-31T23:59:59.999Z",
        "UTC",
        timeZoneData
      )
    ).toBeNull()
  })
})
