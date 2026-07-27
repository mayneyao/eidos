import { IDBFactory } from "fake-indexeddb"

import {
  getLatestRecoverySession,
  storeRecoverySession,
} from "./recovery-store"
import {
  clearRecentFiles,
  getRecentFiles,
  MAX_RECENT_FILES,
  rememberRecentFile,
  removeRecentFile,
  sameFileHandle,
} from "./recent-files-store"

function fileHandle(id: string): FileSystemFileHandle {
  return {
    kind: "file",
    name: `${id}.eidos`,
  } as FileSystemFileHandle
}

describe("recent Eidos Files", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: new IDBFactory(),
    })
  })

  it("orders entries by last open time and supports removal", async () => {
    const older = await rememberRecentFile(
      { fileName: "older.eidos", handle: fileHandle("older") },
      10
    )
    await rememberRecentFile(
      { fileName: "newer.eidos", handle: fileHandle("newer") },
      20
    )

    await expect(getRecentFiles()).resolves.toMatchObject([
      { fileName: "newer.eidos", lastOpenedAt: 20 },
      { fileName: "older.eidos", lastOpenedAt: 10 },
    ])

    await removeRecentFile(older.id)
    await expect(getRecentFiles()).resolves.toMatchObject([
      { fileName: "newer.eidos" },
    ])

    await clearRecentFiles()
    await expect(getRecentFiles()).resolves.toEqual([])
  })

  it("clears history without deleting a recoverable working copy", async () => {
    await storeRecoverySession({
      id: "working-copy",
      fileName: "working.eidos",
      mode: "copy",
      dirty: true,
      updatedAt: 30,
      sourceVersion: { size: 10, lastModified: 20, digest: "working" },
    })
    await rememberRecentFile(
      { fileName: "recent.eidos", handle: fileHandle("recent") },
      40
    )

    await clearRecentFiles()

    await expect(getRecentFiles()).resolves.toEqual([])
    await expect(getLatestRecoverySession()).resolves.toMatchObject({
      id: "working-copy",
      dirty: true,
    })
  })

  it("keeps only the most recent bounded set", async () => {
    for (let index = 0; index < MAX_RECENT_FILES + 2; index += 1) {
      await rememberRecentFile(
        {
          fileName: `file-${index}.eidos`,
          handle: fileHandle(`file-${index}`),
        },
        index
      )
    }

    const recent = await getRecentFiles(MAX_RECENT_FILES + 2)
    expect(recent).toHaveLength(MAX_RECENT_FILES)
    expect(recent[0]?.fileName).toBe(`file-${MAX_RECENT_FILES + 1}.eidos`)
    expect(recent.at(-1)?.fileName).toBe("file-2.eidos")
  })

  it("uses native handle identity for deduplication", async () => {
    const first = fileHandle("first")
    const sameEntry = fileHandle("renamed")
    Object.defineProperty(first, "isSameEntry", {
      value: async (other: FileSystemHandle) => other === sameEntry,
    })

    await expect(sameFileHandle(first, sameEntry)).resolves.toBe(true)
    await expect(sameFileHandle(first, fileHandle("other"))).resolves.toBe(
      false
    )
  })
})
