import type { EidosFileVersion, FileAccessMode } from "./browser-file-adapter"

const DATABASE_NAME = "eidos-file-web"
const STORE_NAME = "recovery-sessions"

export interface RecoverySession {
  id: string
  fileName: string
  sourceVersion: EidosFileVersion
  mode: FileAccessMode
  dirty: boolean
  updatedAt: number
  handle?: FileSystemFileHandle
}

function openRecoveryDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" })
        store.createIndex("updatedAt", "updatedAt")
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function storeRecoverySession(
  session: RecoverySession
): Promise<void> {
  const database = await openRecoveryDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite")
    await requestResult(transaction.objectStore(STORE_NAME).put(session))
  } finally {
    database.close()
  }
}

export async function deleteRecoverySession(id: string): Promise<void> {
  const database = await openRecoveryDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite")
    await requestResult(transaction.objectStore(STORE_NAME).delete(id))
  } finally {
    database.close()
  }
}

export async function getLatestRecoverySession(): Promise<RecoverySession | null> {
  const database = await openRecoveryDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, "readonly")
    const request = transaction
      .objectStore(STORE_NAME)
      .index("updatedAt")
      .openCursor(null, "prev")
    const cursor = await requestResult(request)
    return (cursor?.value as RecoverySession | undefined) ?? null
  } finally {
    database.close()
  }
}
