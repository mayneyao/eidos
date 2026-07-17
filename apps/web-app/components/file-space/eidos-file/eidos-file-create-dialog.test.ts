import { describe, expect, it } from "vitest"

import {
  eidosFileDefaultTableForTemplate,
  eidosFileOptionsForTemplate,
  normalizeEidosFileName,
} from "./eidos-file-create-options"

describe("Eidos File creation", () => {
  it("normalizes the portable Eidos File extension", () => {
    expect(normalizeEidosFileName("Projects")).toBe("Projects.eidos")
    expect(normalizeEidosFileName("Projects.EIDOS")).toBe("Projects.EIDOS")
    expect(normalizeEidosFileName("Projects.sqlite")).toBe(
      "Projects.sqlite.eidos"
    )
    expect(normalizeEidosFileName("  Projects.eidos  ")).toBe("Projects.eidos")
  })

  it("creates a useful task tracker schema", () => {
    const options = eidosFileOptionsForTemplate("Roadmap", "tasks")
    expect(options.title).toBe("Roadmap")
    expect(options.defaultTable?.name).toBe("Tasks")
    expect(options.defaultTable?.fields?.map((field) => field.type)).toEqual([
      "select",
      "select",
      "date",
      "checkbox",
    ])
    expect(options.defaultTable).toEqual(
      eidosFileDefaultTableForTemplate("tasks")
    )
  })

  it("reuses the blank table definition outside file creation", () => {
    expect(eidosFileDefaultTableForTemplate("blank")).toEqual({ name: "Table" })
  })

  it("returns isolated template definitions for each creation", () => {
    const first = eidosFileDefaultTableForTemplate("tasks")
    const second = eidosFileDefaultTableForTemplate("tasks")
    expect(first).not.toBe(second)
    expect(first.fields?.at(0)?.property).not.toBe(
      second.fields?.at(0)?.property
    )
    expect(first.fields?.at(0)?.property?.options).not.toBe(
      second.fields?.at(0)?.property?.options
    )
  })
})
