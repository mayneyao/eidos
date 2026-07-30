import { describe, expect, it } from "vitest"

import {
  applyMacosTrafficLightPosition,
  macosTrafficLightPosition,
} from "./window-chrome"

describe("macOS window chrome", () => {
  it("aligns the Space traffic lights with the compact title row", () => {
    expect(macosTrafficLightPosition("space")).toEqual({ x: 16, y: 12 })
  })

  it("preserves the Welcome window inset", () => {
    expect(macosTrafficLightPosition("welcome")).toEqual({ x: 16, y: 15 })
  })

  it("uses the standard inset for the Settings titlebar", () => {
    expect(macosTrafficLightPosition("settings")).toEqual({ x: 16, y: 15 })
  })

  it("repositions a promoted Welcome window for the Space title row", () => {
    const setWindowButtonPosition = vi.fn()

    applyMacosTrafficLightPosition(
      { setWindowButtonPosition },
      "space",
      "darwin"
    )

    expect(setWindowButtonPosition).toHaveBeenCalledWith({ x: 16, y: 12 })
    expect(macosTrafficLightPosition("space").y).not.toBe(
      macosTrafficLightPosition("welcome").y
    )
  })

  it("does not use the macOS window-button API on other platforms", () => {
    const setWindowButtonPosition = vi.fn()

    applyMacosTrafficLightPosition(
      { setWindowButtonPosition },
      "space",
      "win32"
    )

    expect(setWindowButtonPosition).not.toHaveBeenCalled()
  })
})
