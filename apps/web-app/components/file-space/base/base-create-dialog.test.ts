import { describe, expect, it } from "vitest"

import {
  baseDefaultTableForTemplate,
  baseOptionsForTemplate,
  normalizeBaseFileName,
} from "./base-create-options"

describe("Base creation", () => {
  it("normalizes the portable Base extension", () => {
    expect(normalizeBaseFileName("Projects")).toBe("Projects.base")
    expect(normalizeBaseFileName("Projects.BASE")).toBe("Projects.BASE")
    expect(normalizeBaseFileName("  Projects.base  ")).toBe("Projects.base")
  })

  it("creates a useful task tracker schema", () => {
    const options = baseOptionsForTemplate("Roadmap", "tasks")
    expect(options.title).toBe("Roadmap")
    expect(options.defaultTable?.name).toBe("Tasks")
    expect(options.defaultTable?.fields?.map((field) => field.type)).toEqual([
      "select",
      "select",
      "date",
      "checkbox",
    ])
    expect(options.defaultTable).toEqual(baseDefaultTableForTemplate("tasks"))
  })

  it("reuses the blank table definition outside file creation", () => {
    expect(baseDefaultTableForTemplate("blank")).toEqual({ name: "Table" })
  })

  it("returns isolated template definitions for each creation", () => {
    const first = baseDefaultTableForTemplate("tasks")
    const second = baseDefaultTableForTemplate("tasks")
    expect(first).not.toBe(second)
    expect(first.fields?.at(0)?.property).not.toBe(
      second.fields?.at(0)?.property
    )
    expect(first.fields?.at(0)?.property?.options).not.toBe(
      second.fields?.at(0)?.property?.options
    )
  })
})
