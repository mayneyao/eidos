import { describe, expect, it } from "vitest"

import { supportsBrowserFileAccess, supportsBrowserSaveAs } from "./browser"

describe("browser capability detection", () => {
  it("is safe when rendered outside a browser", () => {
    expect(supportsBrowserFileAccess(undefined)).toBe(false)
    expect(supportsBrowserSaveAs(undefined)).toBe(false)
  })
})
