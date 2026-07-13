import { describe, expect, it } from "vitest"

import {
  BASE_VIRTUAL_SCROLL_MAX_SIZE,
  BASE_VIRTUAL_SCROLL_MAX_ITEMS,
  baseVirtualItemOffset,
  baseVirtualLogicalOffset,
  baseVirtualPhysicalOffset,
  baseVirtualPhysicalSize,
  baseVirtualWindowForOffset,
} from "./base-virtual-scroll"

describe("base virtual scroll geometry", () => {
  it("keeps ordinary scroll geometry unchanged", () => {
    expect(baseVirtualPhysicalSize(10_000)).toBe(10_000)
    expect(baseVirtualLogicalOffset(2_500, 10_000, 500)).toBe(2_500)
    expect(baseVirtualPhysicalOffset(2_500, 10_000, 500)).toBe(2_500)
    expect(baseVirtualItemOffset(3_000, 2_500, 10_000, 500)).toBe(3_000)
  })

  it("caps million-record spacers below Chromium's layout limit", () => {
    expect(baseVirtualPhysicalSize(220_000_000)).toBe(
      BASE_VIRTUAL_SCROLL_MAX_SIZE
    )
    expect(BASE_VIRTUAL_SCROLL_MAX_SIZE).toBeLessThan(16_777_215)
  })

  it("maps both endpoints and the midpoint across a compressed range", () => {
    const logicalSize = 220_000_000
    const viewportSize = 640
    const physicalMax = BASE_VIRTUAL_SCROLL_MAX_SIZE - viewportSize
    const logicalMax = logicalSize - viewportSize

    expect(baseVirtualLogicalOffset(0, logicalSize, viewportSize)).toBe(0)
    expect(
      baseVirtualLogicalOffset(physicalMax, logicalSize, viewportSize)
    ).toBe(logicalMax)
    expect(baseVirtualPhysicalOffset(0, logicalSize, viewportSize)).toBe(0)
    expect(
      baseVirtualPhysicalOffset(logicalMax, logicalSize, viewportSize)
    ).toBe(physicalMax)

    const physicalMiddle = physicalMax / 2
    const logicalMiddle = baseVirtualLogicalOffset(
      physicalMiddle,
      logicalSize,
      viewportSize
    )
    expect(logicalMiddle).toBeCloseTo(logicalMax / 2, 4)
    expect(
      baseVirtualPhysicalOffset(logicalMiddle, logicalSize, viewportSize)
    ).toBeCloseTo(physicalMiddle, 4)
  })

  it("keeps rendered items at their full local spacing while compressed", () => {
    const logicalSize = 220_000_000
    const viewportSize = 640
    const physicalOffset = (BASE_VIRTUAL_SCROLL_MAX_SIZE - viewportSize) / 2
    const logicalOffset = baseVirtualLogicalOffset(
      physicalOffset,
      logicalSize,
      viewportSize
    )

    expect(
      baseVirtualItemOffset(
        logicalOffset,
        physicalOffset,
        logicalSize,
        viewportSize
      )
    ).toBeCloseTo(physicalOffset, 4)
    expect(
      baseVirtualItemOffset(
        logicalOffset + 220,
        physicalOffset,
        logicalSize,
        viewportSize
      )
    ).toBeCloseTo(physicalOffset + 220, 4)
  })

  it("bounds TanStack measurements while retaining global positions", () => {
    expect(baseVirtualWindowForOffset(10_000, 220, 1_000_000)).toEqual({
      start: 0,
      count: 10_000,
    })

    const middle = baseVirtualWindowForOffset(1_000_000, 220, 110_000_000)
    expect(middle.count).toBe(BASE_VIRTUAL_SCROLL_MAX_ITEMS)
    expect(middle.start).toBeGreaterThan(0)
    expect(middle.start).toBeLessThan(500_000)
    expect(500_000 - middle.start).toBeLessThan(BASE_VIRTUAL_SCROLL_MAX_ITEMS)

    expect(baseVirtualWindowForOffset(1_000_000, 220, 220_000_000)).toEqual({
      start: 1_000_000 - BASE_VIRTUAL_SCROLL_MAX_ITEMS,
      count: BASE_VIRTUAL_SCROLL_MAX_ITEMS,
    })
  })
})
