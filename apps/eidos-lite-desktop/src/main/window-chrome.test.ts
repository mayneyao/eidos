import { describe, expect, it } from "vitest"

import { macosTrafficLightPosition } from "./window-chrome"

describe("macOS window chrome", () => {
  it("aligns the Space traffic lights with the compact title row", () => {
    expect(macosTrafficLightPosition("space")).toEqual({ x: 16, y: 12 })
  })

  it("preserves the Welcome window inset", () => {
    expect(macosTrafficLightPosition("welcome")).toEqual({ x: 16, y: 15 })
  })
})
