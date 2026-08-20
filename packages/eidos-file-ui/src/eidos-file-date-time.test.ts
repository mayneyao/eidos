import { describe, expect, it } from "vitest"

import {
  eidosFileDateKey,
  eidosFileDateTimeInputValue,
  eidosFileInstantFromInputValue,
  eidosFileInstantFromWallDate,
  eidosFileWallDateFromInputValue,
} from "./eidos-file-date-time"

describe("Eidos File date and time presentation", () => {
  it("uses the selected zone across day boundaries", () => {
    const instant = new Date("2026-01-01T00:30:00.000Z")
    expect(eidosFileDateKey(instant, "America/Los_Angeles")).toBe("2025-12-31")
    expect(eidosFileDateTimeInputValue(instant, "Asia/Shanghai")).toBe(
      "2026-01-01T08:30"
    )
  })

  it("interprets datetime-local input in the selected zone", () => {
    const wallDate = new Date(2026, 0, 1, 8, 30)
    expect(
      eidosFileInstantFromWallDate(wallDate, "Asia/Shanghai")?.toISOString()
    ).toBe("2026-01-01T00:30:00.000Z")
    expect(
      eidosFileInstantFromInputValue(
        "2026-01-01T08:30",
        "Asia/Shanghai"
      )?.toISOString()
    ).toBe("2026-01-01T00:30:00.000Z")
  })

  it("rejects invalid wall dates and ambiguous daylight-saving times", () => {
    expect(eidosFileWallDateFromInputValue("2026-02-31T10:00")).toBeUndefined()
    expect(
      eidosFileInstantFromInputValue("2026-03-08T02:30", "America/New_York")
    ).toBeUndefined()
    expect(
      eidosFileInstantFromInputValue("2026-11-01T01:30", "America/New_York")
    ).toBeUndefined()
    expect(
      eidosFileInstantFromInputValue(
        "2026-11-01T03:30",
        "America/New_York"
      )?.toISOString()
    ).toBe("2026-11-01T08:30:00.000Z")
  })

  it("keeps canonical instants independent from the display zone", () => {
    expect(
      eidosFileInstantFromInputValue(
        "2026-01-01T00:30:00.000Z",
        "America/Los_Angeles"
      )?.toISOString()
    ).toBe("2026-01-01T00:30:00.000Z")
  })
})
