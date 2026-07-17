import { describe, expect, it } from "vitest"

import {
  eidosFileSelectPropertyFromLegacy,
  legacySelectValueMap,
  migrateLegacySelectValue,
  migrateLegacyStringArray,
} from "./value-migration"

describe("legacy Eidos File value migration", () => {
  const property = {
    options: [
      { id: "status_1", name: "In progress", color: "blue" },
      { id: "status_2", name: "Done" },
    ],
    defaultOption: "status_1",
  }

  it("replaces legacy option IDs and names with one canonical value", () => {
    expect(eidosFileSelectPropertyFromLegacy(property)).toEqual({
      options: [
        { value: "In progress", color: "blue" },
        { value: "Done", color: "default" },
      ],
      defaultOption: "In progress",
    })
    expect(
      migrateLegacySelectValue("status_2", legacySelectValueMap(property))
    ).toBe("Done")
  })

  it("writes legacy multi-select and relation lists as JSON arrays", () => {
    const valueById = legacySelectValueMap(property)
    expect(
      migrateLegacyStringArray(
        "status_1,status_2,status_1",
        (value) => valueById.get(value) ?? value
      )
    ).toBe('["In progress","Done"]')
    expect(migrateLegacyStringArray("person-1,person-2")).toBe(
      '["person-1","person-2"]'
    )
  })

  it("rewrites every element of an existing JSON array", () => {
    expect(
      migrateLegacyStringArray(
        '["logo.png","cover.png"]',
        (value) => `assets/${value}`
      )
    ).toBe('["assets/logo.png","assets/cover.png"]')
  })
})
