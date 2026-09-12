import { describe, expect, it } from "vitest"

import { resolveEidosLiteAppearance } from "./appearance"

describe("Eidos Lite appearance resolution", () => {
  it("follows the system when the preference is system", () => {
    expect(resolveEidosLiteAppearance("system", true)).toBe("dark")
    expect(resolveEidosLiteAppearance("system", false)).toBe("light")
  })

  it("honors explicit light and dark preferences over the system", () => {
    expect(resolveEidosLiteAppearance("light", true)).toBe("light")
    expect(resolveEidosLiteAppearance("dark", false)).toBe("dark")
  })
})
