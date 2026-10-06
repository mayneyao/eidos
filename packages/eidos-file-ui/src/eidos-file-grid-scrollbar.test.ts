import { describe, expect, it } from "vitest"

import { eidosFileGridScrollbarConfig } from "./eidos-file-grid-scrollbar"

describe("eidosFileGridScrollbarConfig", () => {
  it.each([0, 5, 15])("uses the actual %i px scrollbar gutter", (height) => {
    expect(
      eidosFileGridScrollbarConfig(true, height).experimental
        ?.scrollbarWidthOverride
    ).toBe(height)
    expect(
      eidosFileGridScrollbarConfig(false, height).experimental
        ?.scrollbarWidthOverride
    ).toBe(0)
  })
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
