import { describe, expect, it } from "vitest"

import { baseGridScrollbarConfig } from "./base-grid-scrollbar"

describe("baseGridScrollbarConfig", () => {
  it("compensates for the reserved scrollbar row when columns fit", () => {
    expect(baseGridScrollbarConfig(false, 14)).toEqual({
      experimental: {
        kineticScrollPerfHack: true,
        scrollbarWidthOverride: 14,
        paddingBottom: 14,
      },
    })
  })

  it("leaves the native horizontal scrollbar height intact when it is used", () => {
    expect(baseGridScrollbarConfig(true, 14)).toEqual({
      experimental: { kineticScrollPerfHack: true },
    })
  })
})
