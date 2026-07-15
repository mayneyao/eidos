import { describe, expect, it } from "vitest"

import {
  assertExtensionSnapshotIdentity,
  normalizeExtensionPermissionGrants,
} from "./index"

describe("extension state contract", () => {
  it("normalizes and deduplicates grants", () => {
    expect(
      normalizeExtensionPermissionGrants([
        { kind: "network", value: "https://example.com" },
        { kind: "files.read", value: "**/*.md" },
        { kind: "files.read", value: "**/*.md" },
      ])
    ).toEqual([
      { kind: "files.read", value: "**/*.md" },
      { kind: "network", value: "https://example.com" },
    ])
  })

  it("rejects identities that cannot be canonical trust keys", () => {
    expect(() =>
      assertExtensionSnapshotIdentity({
        packageId: "Invalid",
        contentDigest: `sha256:${"a".repeat(64)}`,
        permissionHash: `sha256:${"b".repeat(64)}`,
      })
    ).toThrow("package ID")
  })
})
