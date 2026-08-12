import { requiredMergeStateToken } from "./merge-token"

describe("requiredMergeStateToken", () => {
  it("accepts the opaque versioned token returned by the Graft merge SDK", () => {
    const token = `graft-merge-v1:${"a".repeat(64)}`
    expect(requiredMergeStateToken(token)).toBe(token)
  })

  it.each(["", " stale", "stale ", "a".repeat(257), null, undefined])(
    "rejects an invalid bounded token: %s",
    (value) => {
      expect(() => requiredMergeStateToken(value)).toThrow(
        "Invalid merge state token"
      )
    }
  )
})
