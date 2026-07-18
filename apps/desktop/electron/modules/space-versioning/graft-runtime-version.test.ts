// @vitest-environment node

import { describe, expect, it } from "vitest"

import {
  assertGraftRuntimeVersion,
  EXPECTED_GRAFT_RUNTIME_VERSION,
} from "./graft-runtime-version"

describe("Graft runtime version guard", () => {
  it("accepts the pinned CLI and extension version formats", () => {
    expect(EXPECTED_GRAFT_RUNTIME_VERSION).toBe("0.6.0")
    expect(() =>
      assertGraftRuntimeVersion("graft-tool 0.6.0", "CLI")
    ).not.toThrow()
    expect(() =>
      assertGraftRuntimeVersion(
        "Graft Version: 0.6.0\nGit Commit: c84d2f2",
        "SQLite extension"
      )
    ).not.toThrow()
  })

  it("rejects stale and malformed runtimes", () => {
    expect(() => assertGraftRuntimeVersion("graft-tool 0.5.8", "CLI")).toThrow(
      "required v0.6.0"
    )
    expect(() => assertGraftRuntimeVersion(undefined, "CLI")).toThrow(
      "required v0.6.0"
    )
  })
})
