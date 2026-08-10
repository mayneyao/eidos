import { describe, expect, it } from "vitest"

import { shouldEnforcePackagedPerformance } from "./packaged-startup-smoke"

describe("packaged smoke performance policy", () => {
  it("enforces release budgets by default", () => {
    expect(shouldEnforcePackagedPerformance("enforce")).toBe(true)
  })

  it("allows a fresh-package observation pass before strict enforcement", () => {
    expect(shouldEnforcePackagedPerformance("observe")).toBe(false)
  })

  it("rejects unknown policies", () => {
    expect(() => shouldEnforcePackagedPerformance("skip")).toThrow(
      "Invalid packaged smoke performance policy: skip"
    )
  })
})
