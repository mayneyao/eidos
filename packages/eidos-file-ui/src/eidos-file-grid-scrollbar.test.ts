import { describe, expect, it } from "vitest"

import { eidosFileGridScrollbarConfig } from "./eidos-file-grid-scrollbar"

describe("eidosFileGridScrollbarConfig", () => {
  it("does not reserve a scrollbar row when columns fit", () => {
    expect(eidosFileGridScrollbarConfig(false)).toEqual({
      experimental: {
        kineticScrollPerfHack: true,
        scrollbarWidthOverride: 0,
      },
    })
  })

  it("leaves the native horizontal scrollbar height intact when it is used", () => {
    expect(eidosFileGridScrollbarConfig(true)).toEqual({
      experimental: { kineticScrollPerfHack: true },
    })
  })
})
