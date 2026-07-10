// @vitest-environment node

import { decideTextFileChange } from "./text-file-change"

describe("text file change decisions", () => {
  it("ignores the event produced by the pending Eidos write", () => {
    expect(decideTextFileChange("next", "before", "next", "next")).toBe(
      "ignore"
    )
  })

  it("ignores metadata-only changes when the content is unchanged", () => {
    expect(decideTextFileChange("same", "same", "same", null)).toBe("ignore")
  })

  it("reloads a clean editor after an external content change", () => {
    expect(decideTextFileChange("outside", "before", "before", null)).toBe(
      "reload"
    )
  })

  it("reports a conflict instead of replacing a dirty editor", () => {
    expect(decideTextFileChange("outside", "before", "draft", null)).toBe(
      "conflict"
    )
  })
})
