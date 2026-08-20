import { describe, expect, it } from "vitest"

import {
  applyMacosTrafficLightPosition,
  liteCompactWindowDefaultSize,
  liteWindowChromeOptions,
  macosTrafficLightPosition,
} from "./window-chrome"

describe("Eidos Lite window chrome", () => {
  it("gives Settings enough default width for its two-column layout", () => {
    expect(liteCompactWindowDefaultSize("settings")).toEqual({
      width: 960,
      height: 680,
    })
    expect(liteCompactWindowDefaultSize("welcome")).toEqual({
      width: 920,
      height: 620,
    })
  })

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

  it("keeps the compact Windows controls integrated into the titlebar", () => {
    expect(liteWindowChromeOptions("win32")).toEqual({
      titleBarStyle: "hidden",
      autoHideMenuBar: true,
      titleBarOverlay: {
        color: "#00000000",
        height: 40,
      },
    })
  })

  it("uses the system Linux controls with their native layout and states", () => {
    expect(liteWindowChromeOptions("linux")).toEqual({
      titleBarStyle: "hidden",
      autoHideMenuBar: true,
      titleBarOverlay: true,
    })
  })

  it("keeps the inset macOS titlebar", () => {
    expect(liteWindowChromeOptions("darwin")).toEqual({
      titleBarStyle: "hiddenInset",
      autoHideMenuBar: false,
    })
  })
})
