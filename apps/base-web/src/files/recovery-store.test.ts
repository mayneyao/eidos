import { IDBFactory } from "fake-indexeddb"

import {
  deleteRecoverySession,
  getLatestRecoverySession,
  storeRecoverySession,
  type RecoverySession,
} from "./recovery-store"

describe("Base recovery metadata", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: new IDBFactory(),
    })
  })

  it("persists and removes the latest dirty working copy", async () => {
    const session: RecoverySession = {
      id: "recovery-123",
      fileName: "projects.base",
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
      fileName: "older.base",
      mode: "copy",
      dirty: true,
      updatedAt: 10,
      sourceVersion,
    })
    await storeRecoverySession({
      id: "newer-copy",
      fileName: "newer.base",
      mode: "direct",
      dirty: true,
      updatedAt: 20,
      sourceVersion,
    })

    await expect(getLatestRecoverySession()).resolves.toMatchObject({
      id: "newer-copy",
    })
  })
})
