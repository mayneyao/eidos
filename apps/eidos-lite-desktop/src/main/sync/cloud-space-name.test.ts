import {
  cloudDisplayNameForLocalSpace,
  localNameForCloudSpace,
  normalizeCloudSpaceDisplayName,
} from "./cloud-space-name"

describe("normalizeCloudSpaceDisplayName", () => {
  it("accepts trimmed Unicode names and rejects unsafe metadata", () => {
    expect(normalizeCloudSpaceDisplayName("  客户研究  ")).toBe("客户研究")
    expect(normalizeCloudSpaceDisplayName("line\nbreak")).toBeNull()
    expect(normalizeCloudSpaceDisplayName("")).toBeNull()
    expect(normalizeCloudSpaceDisplayName("x".repeat(81))).toBeNull()
  })

  it("creates a bounded display name from a local folder", () => {
    expect(cloudDisplayNameForLocalSpace(` ${"x".repeat(90)} `)).toBe(
      "x".repeat(80)
    )
  })
})

describe("localNameForCloudSpace", () => {
  it("preserves a recognizable Unicode display name", () => {
    expect(localNameForCloudSpace("  客户研究  ", "Synced Space")).toBe(
      "客户研究"
    )
  })

  it("removes characters that cannot be used in a portable folder name", () => {
    expect(localNameForCloudSpace('Plans / Q3: "Launch"', "Synced Space")).toBe(
      "Plans Q3 Launch"
    )
  })

  it("falls back when no usable local folder name remains", () => {
    expect(localNameForCloudSpace(" / ", "Synced Space")).toBe("Synced Space")
  })
})
