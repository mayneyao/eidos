import {
  openBrowserStorage,
  RECENT_FILES_STORE_NAME,
  requestResult,
} from "./browser-storage"

export const MAX_RECENT_FILES = 10

export interface RecentFileEntry {
  id: string
  fileName: string
  handle: FileSystemFileHandle
  lastOpenedAt: number
}

export async function sameFileHandle(
  left: FileSystemFileHandle,
  right: FileSystemFileHandle
): Promise<boolean> {
  if (left === right) return true
  try {
    return typeof left.isSameEntry === "function"
      ? await left.isSameEntry(right)
      : false
  } catch {
    return false
  }
}

export async function getRecentFiles(
  limit = MAX_RECENT_FILES
): Promise<RecentFileEntry[]> {
  const database = await openBrowserStorage()
  try {
    const transaction = database.transaction(
      RECENT_FILES_STORE_NAME,
      "readonly"
    )
    const request = transaction
      .objectStore(RECENT_FILES_STORE_NAME)
      .index("lastOpenedAt")
      .openCursor(null, "prev")
    const entries: RecentFileEntry[] = []
    return await new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor || entries.length >= limit) {
          resolve(entries)
          return
        }
        entries.push(cursor.value as RecentFileEntry)
        cursor.continue()
      }
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}

export async function rememberRecentFile(
  file: Pick<RecentFileEntry, "fileName" | "handle">,
  lastOpenedAt = Date.now()
): Promise<RecentFileEntry> {
  const current = await getRecentFiles(MAX_RECENT_FILES + 1)
  let matched: RecentFileEntry | undefined
  for (const entry of current) {
    if (await sameFileHandle(entry.handle, file.handle)) {
      matched = entry
      break
    }
  }

  const entry: RecentFileEntry = {
    id: matched?.id ?? crypto.randomUUID(),
    fileName: file.fileName,
    handle: file.handle,
    lastOpenedAt,
  }
  const database = await openBrowserStorage()
  try {
    const transaction = database.transaction(
      RECENT_FILES_STORE_NAME,
      "readwrite"
    )
    await requestResult(
      transaction.objectStore(RECENT_FILES_STORE_NAME).put(entry)
    )
  } finally {
    database.close()
  }

  const trimmed = await getRecentFiles(MAX_RECENT_FILES + 1)
  await Promise.all(
    trimmed
      .slice(MAX_RECENT_FILES)
      .map((oldEntry) => removeRecentFile(oldEntry.id))
  )
  return entry
}

export async function removeRecentFile(id: string): Promise<void> {
  const database = await openBrowserStorage()
  try {
    const transaction = database.transaction(
      RECENT_FILES_STORE_NAME,
      "readwrite"
    )
    await requestResult(
      transaction.objectStore(RECENT_FILES_STORE_NAME).delete(id)
    )
  } finally {
    database.close()
  }
}

export async function clearRecentFiles(): Promise<void> {
  const database = await openBrowserStorage()
  try {
    const transaction = database.transaction(
      RECENT_FILES_STORE_NAME,
      "readwrite"
    )
    await requestResult(
      transaction.objectStore(RECENT_FILES_STORE_NAME).clear()
    )
  } finally {
    database.close()
  }
}
