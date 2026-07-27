export const BROWSER_STORAGE_DATABASE = "eidos-file-web"
export const BROWSER_STORAGE_VERSION = 2
export const RECOVERY_STORE_NAME = "recovery-sessions"
export const RECENT_FILES_STORE_NAME = "recent-files"

export function openBrowserStorage(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      BROWSER_STORAGE_DATABASE,
      BROWSER_STORAGE_VERSION
    )
    request.onupgradeneeded = () => {
      const database = request.result
      const transaction = request.transaction

      const recoveryStore = database.objectStoreNames.contains(
        RECOVERY_STORE_NAME
      )
        ? transaction?.objectStore(RECOVERY_STORE_NAME)
        : database.createObjectStore(RECOVERY_STORE_NAME, { keyPath: "id" })
      if (recoveryStore && !recoveryStore.indexNames.contains("updatedAt")) {
        recoveryStore.createIndex("updatedAt", "updatedAt")
      }

      const recentFilesStore = database.objectStoreNames.contains(
        RECENT_FILES_STORE_NAME
      )
        ? transaction?.objectStore(RECENT_FILES_STORE_NAME)
        : database.createObjectStore(RECENT_FILES_STORE_NAME, {
            keyPath: "id",
          })
      if (
        recentFilesStore &&
        !recentFilesStore.indexNames.contains("lastOpenedAt")
      ) {
        recentFilesStore.createIndex("lastOpenedAt", "lastOpenedAt")
      }
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
  })
}

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
