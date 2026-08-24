import { describe, expect, it } from "vitest"

import { nextEidosFileViewName } from "./eidos-file-view-name"

describe("nextEidosFileViewName", () => {
  it("uses the plain layout name when it is available", () => {
    expect(nextEidosFileViewName("Grid", [])).toBe("Grid")
    expect(nextEidosFileViewName("Grid", [{ name: "Grid 1" }])).toBe("Grid")
  })

  it("adds the first available suffix only when the plain name conflicts", () => {
    expect(nextEidosFileViewName("Grid", [{ name: "grid" }])).toBe("Grid 2")
    expect(
      nextEidosFileViewName("Grid", [
        { name: "Grid" },
        { name: "GRID 2" },
        { name: "Grid 4" },
      ])
    ).toBe("Grid 3")
  })
})
