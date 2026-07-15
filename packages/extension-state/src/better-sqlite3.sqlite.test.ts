import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import Database from "better-sqlite3"
import { afterEach, describe, expect, it } from "vitest"

import {
  EXTENSION_STATE_FORMAT_VERSION,
  type ExtensionSnapshotIdentity,
  type LegacyExtensionMappingInput,
} from "./index"
import { BetterSqlite3ExtensionStateStore } from "./better-sqlite3"

const roots: string[] = []
const snapshot: ExtensionSnapshotIdentity = {
  packageId: "example.task-counter",
  contentDigest: `sha256:${"a".repeat(64)}`,
  permissionHash: `sha256:${"b".repeat(64)}`,
}
const changedSnapshot: ExtensionSnapshotIdentity = {
  ...snapshot,
  contentDigest: `sha256:${"c".repeat(64)}`,
}
const legacyMapping: LegacyExtensionMappingInput = {
  legacyExtensionId: "legacy-1",
  legacySlug: "task-counter",
  canonicalPackageId: "example.task-counter",
  archiveDigest: `sha256:${"d".repeat(64)}`,
  candidateContribution: "command",
}

async function createStore(): Promise<BetterSqlite3ExtensionStateStore> {
  const root = await mkdtemp(path.join(tmpdir(), "eidos-extension-state-"))
  roots.push(root)
  return new BetterSqlite3ExtensionStateStore(
    path.join(root, ".eidos", "state", "extensions.sqlite3")
  )
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe("BetterSqlite3ExtensionStateStore", () => {
  it("keeps trust, grants, and enablement bound to one exact snapshot", async () => {
    const store = await createStore()
    const requested = [
      { kind: "files.read" as const, value: "**/*.md" },
      { kind: "network" as const, value: "https://example.com" },
    ]

    expect(store.get(snapshot)).toMatchObject({
      trusted: false,
      enabled: false,
    })
    expect(store.trust(snapshot, requested, 10)).toMatchObject({
      trusted: true,
      enabled: false,
      trustedAt: 10,
    })
    expect(store.setGrant(snapshot, requested[0], true, 20).granted).toEqual([
      requested[0],
    ])
    expect(store.setEnabled(snapshot, true, 30)).toMatchObject({
      trusted: true,
      enabled: true,
      enablementUpdatedAt: 30,
    })
    expect(store.get(changedSnapshot)).toMatchObject({
      trusted: false,
      enabled: false,
      granted: [],
    })
    store.close()
  })

  it("rejects undeclared grants and cascades trust revocation", async () => {
    const store = await createStore()
    store.trust(snapshot, [{ kind: "files.read", value: "**/*.md" }])

    expect(() =>
      store.setGrant(snapshot, { kind: "files.write", value: "**/*.md" }, true)
    ).toThrow("did not request")
    store.setGrant(snapshot, { kind: "files.read", value: "**/*.md" }, true)
    store.setEnabled(snapshot, true)
    expect(store.revokeTrust(snapshot)).toMatchObject({
      trusted: false,
      enabled: false,
      granted: [],
    })
    store.close()
  })

  it("refuses to replace unrelated or incompatible state databases", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "eidos-extension-state-"))
    roots.push(root)
    const filePath = path.join(root, "state.sqlite3")
    await writeFile(filePath, "not sqlite")
    await expect(
      Promise.resolve().then(
        () => new BetterSqlite3ExtensionStateStore(filePath)
      )
    ).rejects.toThrow()
    expect(await readFile(filePath, "utf8")).toBe("not sqlite")
  })

  it("preserves an unsupported state schema for an explicit migration", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "eidos-extension-state-"))
    roots.push(root)
    const filePath = path.join(root, "state.sqlite3")
    const database = new Database(filePath)
    database.pragma(`application_id = ${0x45455854}`)
    database.pragma("user_version = 99")
    database.close()

    expect(() => new BetterSqlite3ExtensionStateStore(filePath)).toThrow(
      "Unsupported extension state schema version: 99"
    )
    const preserved = new Database(filePath)
    expect(preserved.pragma("user_version", { simple: true })).toBe(99)
    preserved.close()
  })

  it("upgrades v1 state in place without losing trust or enablement", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "eidos-extension-state-"))
    roots.push(root)
    const filePath = path.join(root, "state.sqlite3")
    const database = new Database(filePath)
    database.exec(`
      PRAGMA application_id = ${0x45455854};
      PRAGMA user_version = 1;
      CREATE TABLE trusted_snapshots (
        package_id TEXT NOT NULL,
        content_digest TEXT NOT NULL,
        permission_hash TEXT NOT NULL,
        requested_grants_json TEXT NOT NULL,
        trusted_at INTEGER NOT NULL,
        PRIMARY KEY (package_id, content_digest, permission_hash)
      ) WITHOUT ROWID;
      CREATE TABLE snapshot_enablements (
        package_id TEXT NOT NULL,
        content_digest TEXT NOT NULL,
        permission_hash TEXT NOT NULL,
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (package_id, content_digest, permission_hash),
        FOREIGN KEY (package_id, content_digest, permission_hash)
          REFERENCES trusted_snapshots(package_id, content_digest, permission_hash)
          ON DELETE CASCADE
      ) WITHOUT ROWID;
      CREATE TABLE permission_grants (
        package_id TEXT NOT NULL,
        content_digest TEXT NOT NULL,
        permission_hash TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('files.read', 'files.write', 'network')),
        value TEXT NOT NULL,
        granted_at INTEGER NOT NULL,
        PRIMARY KEY (package_id, content_digest, permission_hash, kind, value),
        FOREIGN KEY (package_id, content_digest, permission_hash)
          REFERENCES trusted_snapshots(package_id, content_digest, permission_hash)
          ON DELETE CASCADE
      ) WITHOUT ROWID;
    `)
    database
      .prepare(`INSERT INTO trusted_snapshots VALUES (?, ?, ?, '[]', 10)`)
      .run(snapshot.packageId, snapshot.contentDigest, snapshot.permissionHash)
    database
      .prepare(`INSERT INTO snapshot_enablements VALUES (?, ?, ?, 1, 20)`)
      .run(snapshot.packageId, snapshot.contentDigest, snapshot.permissionHash)
    database.close()

    const upgraded = new BetterSqlite3ExtensionStateStore(filePath)
    expect(upgraded.get(snapshot)).toMatchObject({
      trusted: true,
      enabled: true,
      trustedAt: 10,
      enablementUpdatedAt: 20,
    })
    expect(upgraded.listLegacyExtensionMappings()).toEqual([])
    upgraded.close()

    const inspected = new Database(filePath, { readonly: true })
    expect(inspected.pragma("user_version", { simple: true })).toBe(
      EXTENSION_STATE_FORMAT_VERSION
    )
    expect(
      inspected
        .prepare(
          "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'legacy_extension_mappings'"
        )
        .get()
    ).toEqual({ count: 1 })
    inspected.close()
  })

  it("blocks ambiguous legacy and canonical mappings until one is retired", async () => {
    const store = await createStore()

    expect(store.recordLegacyExtensionMapping(legacyMapping, 10)).toMatchObject(
      {
        ...legacyMapping,
        active: true,
        conflict: "none",
        createdAt: 10,
        updatedAt: 10,
      }
    )
    expect(
      store.recordLegacyExtensionMapping(
        {
          ...legacyMapping,
          archiveDigest: `sha256:${"e".repeat(64)}`,
        },
        20
      )
    ).toMatchObject({
      archiveDigest: `sha256:${"e".repeat(64)}`,
      conflict: "none",
      createdAt: 10,
      updatedAt: 20,
    })

    store.recordLegacyExtensionMapping(
      {
        ...legacyMapping,
        canonicalPackageId: "example.task-counter-v2",
      },
      30
    )
    store.recordLegacyExtensionMapping(
      {
        ...legacyMapping,
        legacyExtensionId: "legacy-2",
        legacySlug: "other-counter",
      },
      40
    )

    expect(store.listLegacyExtensionMappings()).toEqual([
      expect.objectContaining({
        legacyExtensionId: "legacy-1",
        canonicalPackageId: "example.task-counter",
        conflict: "legacy-source-and-canonical-package",
        conflictingLegacyExtensionIds: ["legacy-2"],
        conflictingCanonicalPackageIds: ["example.task-counter-v2"],
      }),
      expect.objectContaining({
        legacyExtensionId: "legacy-2",
        canonicalPackageId: "example.task-counter",
        conflict: "canonical-package",
        conflictingLegacyExtensionIds: ["legacy-1"],
        conflictingCanonicalPackageIds: [],
      }),
      expect.objectContaining({
        legacyExtensionId: "legacy-1",
        canonicalPackageId: "example.task-counter-v2",
        conflict: "legacy-source",
        conflictingLegacyExtensionIds: [],
        conflictingCanonicalPackageIds: ["example.task-counter"],
      }),
    ])

    expect(
      store.setLegacyExtensionMappingActive(
        "legacy-1",
        "example.task-counter-v2",
        false,
        50
      )
    ).toMatchObject({ active: false, conflict: "none", retiredAt: 50 })
    expect(
      store.setLegacyExtensionMappingActive(
        "legacy-2",
        "example.task-counter",
        false,
        60
      )
    ).toMatchObject({ active: false, conflict: "none", retiredAt: 60 })
    expect(store.listLegacyExtensionMappings()).toEqual([
      expect.objectContaining({
        legacyExtensionId: "legacy-1",
        canonicalPackageId: "example.task-counter",
        conflict: "none",
      }),
    ])
    expect(
      store.listLegacyExtensionMappings({ includeRetired: true })
    ).toHaveLength(3)
    store.close()
  })

  it("does not silently reactivate a retired mapping when an archive is re-ported", async () => {
    const store = await createStore()
    store.recordLegacyExtensionMapping(legacyMapping, 10)
    store.setLegacyExtensionMappingActive(
      legacyMapping.legacyExtensionId,
      legacyMapping.canonicalPackageId,
      false,
      20
    )

    expect(
      store.recordLegacyExtensionMapping(
        {
          ...legacyMapping,
          archiveDigest: `sha256:${"f".repeat(64)}`,
        },
        30
      )
    ).toMatchObject({
      active: false,
      archiveDigest: `sha256:${"f".repeat(64)}`,
      createdAt: 10,
      updatedAt: 30,
      retiredAt: 20,
    })
    store.close()
  })

  it("rejects malformed mapping identities without persisting partial state", async () => {
    const store = await createStore()
    expect(() =>
      store.recordLegacyExtensionMapping({
        ...legacyMapping,
        canonicalPackageId: "task-counter",
      })
    ).toThrow("invalid package ID")
    expect(() =>
      store.recordLegacyExtensionMapping({
        ...legacyMapping,
        archiveDigest: "sha256:not-a-digest",
      })
    ).toThrow("invalid archive digest")
    expect(store.listLegacyExtensionMappings({ includeRetired: true })).toEqual(
      []
    )
    store.close()
  })

  it("uses a private file mode", async () => {
    const store = await createStore()
    store.close()
    const root = roots[0]
    const filePath = path.join(root, ".eidos", "state", "extensions.sqlite3")
    await chmod(filePath, 0o644)
    const reopened = new BetterSqlite3ExtensionStateStore(filePath)
    reopened.close()
    const mode = (await import("node:fs/promises")).stat(filePath)
    expect((await mode).mode & 0o777).toBe(0o600)
  })
})
