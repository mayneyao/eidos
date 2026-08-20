import { describe, expect, it } from "vitest"

import {
  filterTimeZoneOptions,
  timeZoneCity,
  timeZoneOffset,
  timeZoneOption,
} from "./time-zone-data"

describe("time zone picker data", () => {
  it("presents an IANA time zone as a readable city and GMT offset", () => {
    expect(timeZoneCity("America/Los_Angeles")).toBe("Los Angeles")
    expect(
      timeZoneOffset("Asia/Shanghai", new Date("2026-01-15T00:00:00Z"))
    ).toBe("GMT+08:00")
  })

  it("searches by city, IANA identifier, and GMT offset", () => {
    const date = new Date("2026-01-15T00:00:00Z")
    const options = [
      timeZoneOption("Asia/Shanghai", date),
      timeZoneOption("America/New_York", date),
      timeZoneOption("Europe/London", date),
    ]

    expect(filterTimeZoneOptions(options, "shanghai")).toHaveLength(1)
    expect(filterTimeZoneOptions(options, "america new york")[0]?.value).toBe(
      "America/New_York"
    )
    expect(filterTimeZoneOptions(options, "GMT+08:00")[0]?.value).toBe(
      "Asia/Shanghai"
    )
  })
})
