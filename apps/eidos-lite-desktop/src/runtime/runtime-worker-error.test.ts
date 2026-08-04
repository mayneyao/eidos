import { describe, expect, it } from "vitest"

import { serializeRuntimeWorkerError } from "./runtime-worker-error"

describe("runtime worker error serialization", () => {
  it("preserves structured Runtime errors across the utility-process boundary", () => {
    expect(
      serializeRuntimeWorkerError({
        code: "invalid-query",
        message: "Filter operand type is invalid",
        retryable: false,
      })
    ).toMatchObject({
      name: "Error",
      code: "invalid-query",
      message: "Filter operand type is invalid",
    })
  })
})
