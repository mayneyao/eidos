// @vitest-environment node

import { shouldEnableLegacySpaceRuntime } from "./space-runtime-policy"

describe("Space runtime policy", () => {
  it("enables the legacy runtime only for legacy Spaces", () => {
    expect(shouldEnableLegacySpaceRuntime("legacy")).toBe(true)
    expect(shouldEnableLegacySpaceRuntime("file")).toBe(false)
    expect(shouldEnableLegacySpaceRuntime(undefined)).toBe(false)
  })
})
