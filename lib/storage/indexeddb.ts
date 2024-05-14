import { del, get, set } from "idb-keyval"
// can use anything: IndexedDB, Ionic Storage, etc.
import { StateStorage } from "zustand/middleware"

// Custom storage object
export const indexedDBStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    // console.log(name, "has been retrieved")
    return (await get(name)) || null
  },
  setItem: async (name: string, value: string): Promise<void> => {
    // console.log(name, "with value", value, "has been saved")
    await set(name, value)
  },
  removeItem: async (name: string): Promise<void> => {
    // console.log(name, "has been deleted")
    await del(name)
  },
}

export const getConfig = async <T = Record<string, any>>(
  name: string
): Promise<T> => {
  const r = await get(name)
  const store = JSON.parse(r)
  return store.state
}

export const DATABASE_NAME = "eidos"

export async function getIndexedDBValue<T = any>(
  tableName: string,
  key: string
): Promise<T> {
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
