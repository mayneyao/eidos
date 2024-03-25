export const DATABASE_NAME = "eidos"

export async function getIndexedDBValue(
  tableName: string,
  key: string
): Promise<any> {
  return new Promise((resolve, reject) => {
    const openRequest = indexedDB.open(DATABASE_NAME, 1)

    openRequest.onupgradeneeded = function () {
      let db = openRequest.result
      if (!db.objectStoreNames.contains(tableName)) {
        db.createObjectStore(tableName)
      }
    }

    openRequest.onsuccess = function () {
      const db = openRequest.result
      const transaction = db.transaction(tableName, "readonly")
      const store = transaction.objectStore(tableName)
      const getRequest = store.get(key)

      getRequest.onsuccess = function () {
        resolve(getRequest.result)
      }

      getRequest.onerror = function () {
        reject(getRequest.error)
      }
    }

    openRequest.onerror = function () {
      reject(openRequest.error)
    }
  })
}
