import { describe, expect, it } from "vitest"

import { requiredEidosLiteExternalUrl } from "./external-url"

describe("Eidos Lite external URL policy", () => {
  it("allows absolute HTTP(S) URLs without rewriting them", () => {
    const uri = "https://example.com/image.png?size=large#preview"
    expect(requiredEidosLiteExternalUrl(uri)).toBe(uri)
    expect(requiredEidosLiteExternalUrl("http://example.com")).toBe(
      "http://example.com"
    )
  })

  it.each([
    "",
    " /relative",
    "/relative",
    "javascript:alert(1)",
    "file:///tmp/private",
    "https://user:secret@example.com/private",
  ])("rejects unsafe or non-external URL %s", (uri) => {
    expect(() => requiredEidosLiteExternalUrl(uri)).toThrow()
  })
})
