import { IDBFactory } from "fake-indexeddb"

import {
  deleteRecoverySession,
  getLatestRecoverySession,
  storeRecoverySession,
  type RecoverySession,
} from "./recovery-store"

describe("Eidos File recovery metadata", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: new IDBFactory(),
    })
  })

  it("persists and removes the latest dirty working copy", async () => {
    const session: RecoverySession = {
      id: "recovery-123",
      fileName: "projects.eidos",
      mode: "copy",
      dirty: true,
      updatedAt: 42,
      sourceVersion: {
        size: 4096,
        lastModified: 17,
        digest: "fixture-digest",
      },
    }

    await storeRecoverySession(session)
    await expect(getLatestRecoverySession()).resolves.toEqual(session)

    await deleteRecoverySession(session.id)
    await expect(getLatestRecoverySession()).resolves.toBeNull()
  })

  it("selects the most recently updated recovery", async () => {
    const sourceVersion = {
      size: 1,
      lastModified: 1,
      digest: "one",
    }
    await storeRecoverySession({
      id: "older-copy",
      fileName: "older.eidos",
      mode: "copy",
      dirty: true,
      updatedAt: 10,
      sourceVersion,
    })
    await storeRecoverySession({
      id: "newer-copy",
      fileName: "newer.eidos",
      mode: "direct",
      dirty: true,
      updatedAt: 20,
      sourceVersion,
    })

    await expect(getLatestRecoverySession()).resolves.toMatchObject({
      id: "newer-copy",
    })
  })

  it("retains a clean direct session so its file handle can be reopened", async () => {
    const handle = { kind: "file", name: "recent.eidos" }
    const session: RecoverySession = {
      id: "recent-direct",
      fileName: "recent.eidos",
      mode: "direct",
      dirty: false,
      updatedAt: 30,
      sourceVersion: {
        size: 2048,
        lastModified: 29,
        digest: "recent-digest",
      },
      handle: handle as FileSystemFileHandle,
    }

    await storeRecoverySession(session)

    await expect(getLatestRecoverySession()).resolves.toEqual(session)
  })
})
