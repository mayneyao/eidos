import { describe, expect, it } from "vitest"

import { FileExtensionDevelopmentManager } from "./file-extension-development-manager"

const anchor = {
  packageId: "example.task-board",
  contentDigest: `sha256:${"1".repeat(64)}`,
  permissionHash: `sha256:${"2".repeat(64)}`,
}

describe("FileExtensionDevelopmentManager", () => {
  it("anchors an in-memory session and authorizes source-only changes", () => {
    const manager = new FileExtensionDevelopmentManager()
    const started = manager.start({
      spaceId: "space-a",
      directoryName: "example.task-board",
      snapshot: anchor,
      requestedGrants: [{ kind: "files.read", value: "**/*.md" }],
      granted: [{ kind: "files.read", value: "**/*.md" }],
      now: 42,
    })

    expect(started).toMatchObject({
      packageId: anchor.packageId,
      anchorSnapshot: anchor,
      currentSnapshot: anchor,
      status: "ready",
      startedAt: 42,
    })

    const changed = {
      ...anchor,
      contentDigest: `sha256:${"3".repeat(64)}`,
    }
    expect(manager.markChecking("space-a", anchor.packageId)?.status).toBe(
      "checking"
    )
    expect(
      manager.markReady("space-a", anchor.packageId, changed)
    ).toMatchObject({ status: "ready", currentSnapshot: changed })
    expect(manager.authorize("space-a", changed)).toEqual({
      requestedGrants: [{ kind: "files.read", value: "**/*.md" }],
      granted: [{ kind: "files.read", value: "**/*.md" }],
    })
  })

  it("blocks changed permissions without inheriting the anchor grants", () => {
    const manager = new FileExtensionDevelopmentManager()
    manager.start({
      spaceId: "space-a",
      directoryName: "example.task-board",
      snapshot: anchor,
      requestedGrants: [{ kind: "files.read", value: "**/*.md" }],
      granted: [{ kind: "files.read", value: "**/*.md" }],
    })

    const changed = {
      ...anchor,
      contentDigest: `sha256:${"3".repeat(64)}`,
      permissionHash: `sha256:${"4".repeat(64)}`,
    }
    expect(
      manager.markReady("space-a", anchor.packageId, changed)
    ).toMatchObject({ status: "permissions-changed" })
    expect(manager.authorize("space-a", changed)).toBeUndefined()
  })

  it("uses the session ID as stale-stop protection and clears Space state", () => {
    const manager = new FileExtensionDevelopmentManager()
    const started = manager.start({
      spaceId: "space-a",
      directoryName: "example.task-board",
      snapshot: anchor,
      requestedGrants: [],
      granted: [],
    })

    expect(() =>
      manager.stop("space-a", anchor.packageId, "stale-session")
    ).toThrow("Development session changed")
    expect(manager.get("space-a", anchor.packageId)).toBeDefined()
    expect(manager.stopSpace("space-a")).toHaveLength(1)
    expect(manager.get("space-a", anchor.packageId)).toBeUndefined()
    expect(started.sessionId).toBeTruthy()
  })
})
