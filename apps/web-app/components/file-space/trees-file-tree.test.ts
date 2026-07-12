import { describe, expect, it } from "vitest"

import { resolveTreeContextMenuPosition } from "./tree-context-menu-position"

describe("resolveTreeContextMenuPosition", () => {
  it("opens toward the tree instead of overflowing past a right-edge trigger", () => {
    expect(
      resolveTreeContextMenuPosition(
        {
          top: 120,
          right: 320,
          bottom: 148,
          left: 292,
          width: 28,
          height: 28,
        },
        { width: 208, height: 120 },
        { width: 1_200, height: 800 }
      )
    ).toEqual({ left: 112, top: 152 })
  })

  it("clamps the menu to the viewport when the trigger is near the left edge", () => {
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
        { width: 208, height: 120 },
        { width: 1_200, height: 800 }
      )
    ).toEqual({ left: 8, top: 44 })
  })

  it("flips above a trigger when there is not enough room below", () => {
    expect(
      resolveTreeContextMenuPosition(
        {
          top: 740,
          right: 320,
          bottom: 768,
          left: 292,
          width: 28,
          height: 28,
        },
        { width: 208, height: 180 },
        { width: 1_200, height: 800 }
      )
    ).toEqual({ left: 112, top: 556 })
  })
})
