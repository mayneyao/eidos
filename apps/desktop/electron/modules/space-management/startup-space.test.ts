// @vitest-environment node

import { describe, expect, it, vi } from "vitest"

import {
  resolveStartupSpaceId,
  type LastOpenedSpaceStore,
  type StartupSpaceRegistry,
} from "./startup-space"

function createConfig(lastOpenedSpace?: string): LastOpenedSpaceStore & {
  setLastOpenedSpace: ReturnType<typeof vi.fn>
} {
  return {
    getLastOpenedSpace: () => lastOpenedSpace,
    setLastOpenedSpace: vi.fn(),
  }
}

function createRegistry(
  validIds: string[],
  firstValidId?: string
): StartupSpaceRegistry {
  return {
    validateSpace: (spaceId) => validIds.includes(spaceId),
    getFirstValidSpace: () =>
      firstValidId === undefined ? null : { id: firstValidId },
  }
}

describe("resolveStartupSpaceId", () => {
  it("opens and remembers a valid protocol Space", () => {
    const config = createConfig("recent")

    expect(
      resolveStartupSpaceId(
        "protocol-space",
        createRegistry(["protocol-space", "recent"], "recent"),
        config
      )
    ).toBe("protocol-space")
    expect(config.setLastOpenedSpace).toHaveBeenLastCalledWith("protocol-space")
  })

  it("uses a valid last-opened Space", () => {
    const config = createConfig("recent")

    expect(
      resolveStartupSpaceId(
        null,
        createRegistry(["recent"], "fallback"),
        config
      )
    ).toBe("recent")
    expect(config.setLastOpenedSpace).not.toHaveBeenCalled()
  })

  it("falls back past an invalid last-opened Space", () => {
    const config = createConfig("missing")

    expect(
      resolveStartupSpaceId(
        null,
        createRegistry(["available"], "available"),
        config
      )
    ).toBe("available")
    expect(config.setLastOpenedSpace).toHaveBeenLastCalledWith("available")
  })

  it("falls back from an invalid protocol Space and stale recent Space", () => {
    const config = createConfig("missing-recent")

    expect(
      resolveStartupSpaceId(
        "missing-protocol",
        createRegistry(["available"], "available"),
        config
      )
    ).toBe("available")
    expect(config.setLastOpenedSpace).toHaveBeenLastCalledWith("available")
  })

  it("returns undefined when no registered Space is valid", () => {
    const config = createConfig("missing")

    expect(resolveStartupSpaceId(null, createRegistry([]), config)).toBe(
      undefined
    )
    expect(config.setLastOpenedSpace).not.toHaveBeenCalled()
  })
})
