import { describe, expect, it } from "vitest"

import {
  DEFAULT_MAX_RESIDENT_RUNTIMES,
  isCurrentRuntimeChild,
  selectLruRuntimeToEvict,
} from "./runtime-pool"

describe("RuntimePool LRU policy", () => {
  it("keeps the resident set deliberately small", () => {
    expect(DEFAULT_MAX_RESIDENT_RUNTIMES).toBe(3)
  })

  it("evicts the least recently used resident and ignores closed metadata", () => {
    expect(
      selectLruRuntimeToEvict([
        {
          sessionId: "newest",
          resident: true,
          pendingRequests: 0,
          lastAccess: 30,
        },
        {
          sessionId: "closed",
          resident: false,
          pendingRequests: 0,
          lastAccess: 1,
        },
        {
          sessionId: "oldest",
          resident: true,
          pendingRequests: 0,
          lastAccess: 10,
        },
        {
          sessionId: "middle",
          resident: true,
          pendingRequests: 0,
          lastAccess: 20,
        },
      ])
    ).toBe("oldest")
  })

  it("never evicts the session currently being opened", () => {
    expect(
      selectLruRuntimeToEvict(
        [
          {
            sessionId: "opening",
            resident: true,
            pendingRequests: 0,
            lastAccess: 1,
          },
          {
            sessionId: "other",
            resident: true,
            pendingRequests: 0,
            lastAccess: 2,
          },
        ],
        "opening"
      )
    ).toBe("other")
  })

  it("never evicts a runtime with an in-flight request", () => {
    expect(
      selectLruRuntimeToEvict([
        {
          sessionId: "busy-oldest",
          resident: true,
          pendingRequests: 1,
          lastAccess: 1,
        },
        {
          sessionId: "idle-newest",
          resident: true,
          pendingRequests: 0,
          lastAccess: 2,
        },
      ])
    ).toBe("idle-newest")
  })

  it("waits instead of evicting when every resident is busy", () => {
    expect(
      selectLruRuntimeToEvict([
        {
          sessionId: "busy",
          resident: true,
          pendingRequests: 2,
          lastAccess: 1,
        },
      ])
    ).toBeNull()
  })

  it("ignores a delayed exit from a replaced utility process", () => {
    const previousChild = { id: "previous" }
    const replacementChild = { id: "replacement" }

    expect(isCurrentRuntimeChild(replacementChild, previousChild)).toBe(false)
    expect(isCurrentRuntimeChild(replacementChild, replacementChild)).toBe(true)
  })
})
