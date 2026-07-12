import { describe, expect, it } from "vitest"

import { resolveTreeContextMenuPosition } from "./tree-context-menu-position"

describe("resolveTreeContextMenuPosition", () => {
  it("opens inward from a trigger at the sidebar edge", () => {
    expect(
      resolveTreeContextMenuPosition(
        {
          top: 120,
          right: 320,
          bottom: 152,
          left: 288,
          width: 32,
          height: 32,
        },
        { width: 224, height: 188 },
        { width: 1_200, height: 800 }
      )
    ).toEqual({ left: 96, top: 156 })
  })

  it("clamps the menu inside the viewport", () => {
    expect(
      resolveTreeContextMenuPosition(
        {
          top: 40,
          right: 20,
          bottom: 40,
          left: 20,
          width: 0,
          height: 0,
        },
        { width: 224, height: 188 },
        { width: 1_200, height: 800 }
      )
    ).toEqual({ left: 8, top: 44 })
  })

  it("flips above the trigger when the menu would cross the bottom edge", () => {
    expect(
      resolveTreeContextMenuPosition(
        {
          top: 740,
          right: 320,
          bottom: 772,
          left: 288,
          width: 32,
          height: 32,
        },
        { width: 224, height: 188 },
        { width: 1_200, height: 800 }
      )
    ).toEqual({ left: 96, top: 548 })
  })
})
