import { describe, expect, it } from "vitest"

import {
  galleryEdgeScrollSpeed,
  galleryRectsIntersect,
  gallerySelectionForHits,
  gallerySelectionMode,
  gallerySelectionRect,
} from "./eidos-file-gallery-selection"

describe("Gallery selection geometry", () => {
  it.each([
    [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ],
    [
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ],
    [
      { x: 0, y: 100 },
      { x: 100, y: 0 },
    ],
    [
      { x: 100, y: 100 },
      { x: 0, y: 0 },
    ],
  ])(
    "normalizes every drag direction and includes partial intersections",
    (a, b) => {
      const rect = gallerySelectionRect(a, b)
      expect(rect).toEqual({ left: 0, top: 0, right: 100, bottom: 100 })
      expect(
        galleryRectsIntersect(rect, {
          left: 90,
          top: 90,
          right: 120,
          bottom: 120,
        })
      ).toBe(true)
      expect(
        galleryRectsIntersect(rect, {
          left: 100,
          top: 0,
          right: 120,
          bottom: 100,
        })
      ).toBe(false)
      expect(
        galleryRectsIntersect(rect, {
          left: 0,
          top: 100,
          right: 100,
          bottom: 120,
        })
      ).toBe(false)
    }
  )

  it("applies each modifier to the immutable starting selection", () => {
    const base = new Set(["old", "shared"])
    const hits = ["shared", "new"]
    expect([...gallerySelectionForHits(base, hits, "replace")]).toEqual(hits)
    expect([...gallerySelectionForHits(base, hits, "add")]).toEqual([
      "old",
      "shared",
      "new",
    ])
    expect([...gallerySelectionForHits(base, hits, "toggle")]).toEqual([
      "old",
      "new",
    ])
    // Repeated animation frames must not keep toggling an intersecting record.
    expect(gallerySelectionForHits(base, hits, "toggle")).toEqual(
      gallerySelectionForHits(base, hits, "toggle")
    )
    expect([...base]).toEqual(["old", "shared"])
    expect(gallerySelectionForHits(base, [], "replace").size).toBe(0)
  })

  it("uses Shift to append and Cmd/Ctrl to toggle on either platform", () => {
    const plain = { shiftKey: false, metaKey: false, ctrlKey: false }
    expect(gallerySelectionMode(plain)).toBe("replace")
    expect(gallerySelectionMode({ ...plain, shiftKey: true })).toBe("add")
    expect(gallerySelectionMode({ ...plain, metaKey: true })).toBe("toggle")
    expect(
      gallerySelectionMode({ ...plain, ctrlKey: true, shiftKey: true })
    ).toBe("toggle")
  })

  it("ramps edge scrolling, caps speed outside the viewport, and leaves the middle still", () => {
    expect(galleryEdgeScrollSpeed(200, 0, 400)).toBe(0)
    expect(galleryEdgeScrollSpeed(24, 0, 400)).toBe(-450)
    expect(galleryEdgeScrollSpeed(376, 0, 400)).toBe(450)
    expect(galleryEdgeScrollSpeed(-100, 0, 400)).toBe(-900)
    expect(galleryEdgeScrollSpeed(1000, 0, 400)).toBe(900)
    expect(galleryEdgeScrollSpeed(0, 0, 0)).toBe(0)
  })
})
