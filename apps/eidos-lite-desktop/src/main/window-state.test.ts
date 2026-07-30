import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  centeredWindowBounds,
  fitWindowBounds,
  LiteWindowStateStore,
} from "./window-state"

describe("Lite window state", () => {
  it("centers the default Space size inside the current display", () => {
    expect(
      centeredWindowBounds(
        { width: 1320, height: 860 },
        { x: 100, y: 40, width: 1720, height: 1060 }
      )
    ).toEqual({ x: 300, y: 140, width: 1320, height: 860 })
  })

  it("keeps restored bounds fully visible and honors the minimum size", () => {
    expect(
      fitWindowBounds(
        { x: 4_000, y: -800, width: 640, height: 420 },
        { x: 0, y: 24, width: 1440, height: 876 },
        { width: 900, height: 600 }
      )
    ).toEqual({ x: 540, y: 24, width: 900, height: 600 })
  })

  it("persists only valid Space bounds and tolerates corrupt state", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "eidos-lite-window-state-")
    )
    try {
      const first = new LiteWindowStateStore(root)
      expect(first.getSpaceBounds()).toBeNull()
      first.saveSpaceBounds({ x: 120, y: 80, width: 1280, height: 800 })
      expect(new LiteWindowStateStore(root).getSpaceBounds()).toEqual({
        x: 120,
        y: 80,
        width: 1280,
        height: 800,
      })

      fs.writeFileSync(path.join(root, "window-state.json"), "not-json")
      expect(new LiteWindowStateStore(root).getSpaceBounds()).toBeNull()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
