import { describe, expect, it } from "vitest"

import { baseGridScrollbarConfig } from "./base-grid-scrollbar"

describe("baseGridScrollbarConfig", () => {
  it("does not reserve a scrollbar row when columns fit", () => {
    expect(baseGridScrollbarConfig(false)).toEqual({
      experimental: {
        kineticScrollPerfHack: true,
        scrollbarWidthOverride: 0,
      },
    })
  })

  it("leaves the native horizontal scrollbar height intact when it is used", () => {
    expect(baseGridScrollbarConfig(true)).toEqual({
      experimental: { kineticScrollPerfHack: true },
    })
  })
})
