// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"

import { activateCliHostUrl } from "./assets"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("CLI Serve external URL activation", () => {
  it("opens an accepted URL in an isolated browser tab", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null)

    activateCliHostUrl("https://example.com/artwork?id=42")

    expect(open).toHaveBeenCalledWith(
      "https://example.com/artwork?id=42",
      "_blank",
      "noopener,noreferrer"
    )
  })

  it.each([
    "/relative",
    "javascript:alert(1)",
    "file:///tmp/private",
    "https://user:secret@example.com/private",
  ])("rejects an unsafe or unsupported destination %s", (uri) => {
    expect(() => activateCliHostUrl(uri)).toThrow()
  })
})
