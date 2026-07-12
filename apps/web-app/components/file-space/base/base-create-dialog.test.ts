import { describe, expect, it } from "vitest"

import {
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
  })
})
