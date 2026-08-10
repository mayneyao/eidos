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
        { sessionId: "newest", resident: true, lastAccess: 30 },
        { sessionId: "closed", resident: false, lastAccess: 1 },
        { sessionId: "oldest", resident: true, lastAccess: 10 },
        { sessionId: "middle", resident: true, lastAccess: 20 },
      ])
    ).toBe("oldest")
  })

  it("never evicts the session currently being opened", () => {
    expect(
      selectLruRuntimeToEvict(
        [
          { sessionId: "opening", resident: true, lastAccess: 1 },
          { sessionId: "other", resident: true, lastAccess: 2 },
        ],
        "opening"
      )
    ).toBe("other")
  })

  it("ignores a delayed exit from a replaced utility process", () => {
    const previousChild = { id: "previous" }
    const replacementChild = { id: "replacement" }

    expect(isCurrentRuntimeChild(replacementChild, previousChild)).toBe(false)
    expect(isCurrentRuntimeChild(replacementChild, replacementChild)).toBe(true)
  })
})
