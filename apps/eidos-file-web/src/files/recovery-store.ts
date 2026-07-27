import type { EidosFileVersion, FileAccessMode } from "./browser-file-adapter"
import {
  openBrowserStorage,
  RECOVERY_STORE_NAME,
  requestResult,
} from "./browser-storage"

export interface RecoverySession {
  id: string
  fileName: string
  sourceVersion: EidosFileVersion
  mode: FileAccessMode
  dirty: boolean
  updatedAt: number
  handle?: FileSystemFileHandle
}

export async function storeRecoverySession(
  session: RecoverySession
): Promise<void> {
  const database = await openBrowserStorage()
  try {
    const transaction = database.transaction(RECOVERY_STORE_NAME, "readwrite")
    await requestResult(
      transaction.objectStore(RECOVERY_STORE_NAME).put(session)
    )
  } finally {
    database.close()
  }
}

export async function deleteRecoverySession(id: string): Promise<void> {
  const database = await openBrowserStorage()
  try {
    const transaction = database.transaction(RECOVERY_STORE_NAME, "readwrite")
    await requestResult(transaction.objectStore(RECOVERY_STORE_NAME).delete(id))
  } finally {
    database.close()
  }
}

export async function getRecoverySessions(
  limit = 50
): Promise<RecoverySession[]> {
  const database = await openBrowserStorage()
  try {
    const transaction = database.transaction(RECOVERY_STORE_NAME, "readonly")
    const request = transaction
      .objectStore(RECOVERY_STORE_NAME)
      .index("updatedAt")
      .openCursor(null, "prev")
    const sessions: RecoverySession[] = []
    return await new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor || sessions.length >= limit) {
          resolve(sessions)
          return
        }
        sessions.push(cursor.value as RecoverySession)
        cursor.continue()
      }
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}

export async function getLatestRecoverySession(): Promise<RecoverySession | null> {
  return (await getRecoverySessions(1))[0] ?? null
}
