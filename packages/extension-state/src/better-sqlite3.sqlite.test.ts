import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import Database from "better-sqlite3"
import { afterEach, describe, expect, it } from "vitest"

import type { ExtensionSnapshotIdentity } from "./index"
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
