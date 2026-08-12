import { classifyMergeFailure } from "./merge-failure"

function coded(message: string, code: string): Error {
  return Object.assign(new Error(message), { code })
}

describe("merge failure mapping", () => {
  it.each([
    [
      coded("stale", "GRAFT_SDK_REPOSITORY_STALE"),
      { code: "stale", retryable: true },
    ],
    [
      Object.assign(new Error("cancelled"), { name: "AbortError" }),
      { code: "cancelled", retryable: true },
    ],
    [
      coded("missing API", "EIDOS_LITE_GRAFT_MERGE_UNAVAILABLE"),
      { code: "unavailable", retryable: false },
    ],
    [
      new Error("merge has unmerged paths"),
      { code: "invalid-state", retryable: true },
    ],
    [new Error("socket disappeared"), { code: "unknown", retryable: true }],
  ])("maps %s without exposing unsafe details", (error, expected) => {
    expect(classifyMergeFailure(error)).toMatchObject({
      ...expected,
      localSafe: true,
    })
    expect(classifyMergeFailure(error).message).not.toContain(
      "socket disappeared"
    )
  })
})
