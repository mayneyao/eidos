import { describe, expect, it } from "vitest"
import {
  comparePluginVersions,
  isPluginUpdateAvailable,
} from "./plugin-version"

describe("plugin-version", () => {
  it("compares versions correctly", () => {
    expect(comparePluginVersions("0.1.0", "0.1.0")).toBe(0)
    expect(comparePluginVersions("0.1.1", "0.1.0")).toBeGreaterThan(0)
    expect(comparePluginVersions("0.1.0", "0.1.1")).toBeLessThan(0)
    expect(comparePluginVersions("1.0.0", "0.9.9")).toBeGreaterThan(0)
    expect(comparePluginVersions("0.2.0", "0.1.9")).toBeGreaterThan(0)
    expect(comparePluginVersions("0.1.10", "0.1.9")).toBeGreaterThan(0)
    expect(comparePluginVersions("v1.2.3", "1.2.3")).toBe(0)
    expect(comparePluginVersions("v1.2.4", "1.2.3")).toBeGreaterThan(0)
  })

  it("checks if update is available", () => {
    expect(isPluginUpdateAvailable("0.1.0", "0.1.1")).toBe(true)
    expect(isPluginUpdateAvailable("0.1.0", "1.0.0")).toBe(true)
    expect(isPluginUpdateAvailable("0.1.0", "0.1.0")).toBe(false)
    expect(isPluginUpdateAvailable("0.2.0", "0.1.0")).toBe(false)
    expect(isPluginUpdateAvailable(null, "0.1.0")).toBe(false)
    expect(isPluginUpdateAvailable("0.1.0", null)).toBe(false)
    expect(isPluginUpdateAvailable(undefined, undefined)).toBe(false)
  })
})
