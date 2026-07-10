// @vitest-environment node

import {
  canReuseCurrentSpaceInfo,
  CURRENT_SPACE_CACHE_MS,
} from "./current-space-cache"

describe("current Space cache", () => {
  const now = Date.parse("2026-07-10T00:00:00.000Z")

  it("reuses a recent value during ordinary reads", () => {
    expect(canReuseCurrentSpaceInfo(new Date(now - 1_000), false, now)).toBe(
      true
    )
  })

  it("does not reuse stale or explicitly refreshed values", () => {
    expect(
      canReuseCurrentSpaceInfo(
        new Date(now - CURRENT_SPACE_CACHE_MS),
        false,
        now
      )
    ).toBe(false)
    expect(canReuseCurrentSpaceInfo(new Date(now - 1_000), true, now)).toBe(
      false
    )
  })
})
