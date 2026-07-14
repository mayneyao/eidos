import { describe, expect, it } from "vitest"

import { baseErrorMessage } from "./base-error-message"

describe("baseErrorMessage", () => {
  it("keeps a useful error message", () => {
    expect(baseErrorMessage(new Error("Space is read-only"), "Fallback")).toBe(
      "Space is read-only"
    )
  })

  it("removes Electron IPC wrapper prefixes", () => {
    expect(
      baseErrorMessage(
        new Error(
          "Error invoking remote method 'space-base:readRows': Error: file is locked"
        ),
        "Fallback"
      )
    ).toBe("file is locked")
  })

  it("accepts string rejections and falls back for empty values", () => {
    expect(baseErrorMessage("request timed out", "Fallback")).toBe(
      "request timed out"
    )
    expect(baseErrorMessage(new Error("  "), "Fallback")).toBe("Fallback")
    expect(baseErrorMessage(null, "Fallback")).toBe("Fallback")
  })
})
