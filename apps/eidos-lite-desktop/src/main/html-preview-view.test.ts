import type { BrowserWindow } from "electron"
import { describe, expect, it, vi } from "vitest"

vi.mock("electron", () => ({}))
import { fittedBounds } from "./html-preview-view"

describe("HTML preview bounds", () => {
  it.each([0.75, 1, 1.25, 1.5, 2])(
    "converts CSS pixels to native bounds at zoom %s",
    (zoom) => {
      const window = {
        getContentSize: () => [1200, 900],
        webContents: { getZoomFactor: () => zoom },
      } as unknown as BrowserWindow
      expect(
        fittedBounds(window, { x: 40, y: 80, width: 400, height: 300 })
      ).toEqual({
        x: Math.round(40 * zoom),
        y: Math.round(80 * zoom),
        width: Math.round(400 * zoom),
        height: Math.round(300 * zoom),
      })
    }
  )

  it("clips the scaled preview to the content area", () => {
    const window = {
      getContentSize: () => [600, 400],
      webContents: { getZoomFactor: () => 2 },
    } as unknown as BrowserWindow
    expect(
      fittedBounds(window, { x: 100, y: 50, width: 500, height: 400 })
    ).toEqual({
      x: 200,
      y: 100,
      width: 400,
      height: 300,
    })
  })
})
