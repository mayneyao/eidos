import { describe, expect, it } from "vitest"

import { eidosFileErrorMessage } from "./eidos-file-error-message"

describe("eidosFileErrorMessage", () => {
  it("keeps a useful error message", () => {
    expect(
      eidosFileErrorMessage(new Error("Space is read-only"), "Fallback")
    ).toBe("Space is read-only")
  })

  it("removes Electron IPC wrapper prefixes", () => {
    expect(
      eidosFileErrorMessage(
        new Error(
          "Error invoking remote method 'space-eidos-file:readRows': Error: file is locked"
        ),
        "Fallback"
      )
    ).toBe("file is locked")
  })

  it("accepts string rejections and falls back for empty values", () => {
    expect(eidosFileErrorMessage("request timed out", "Fallback")).toBe(
      "request timed out"
    )
    expect(eidosFileErrorMessage(new Error("  "), "Fallback")).toBe("Fallback")
    expect(eidosFileErrorMessage(null, "Fallback")).toBe("Fallback")
  })
})
