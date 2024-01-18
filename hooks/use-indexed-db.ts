import { useCallback, useEffect, useRef, useState } from "react"

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

export function useIndexedDB(
  tableName: string,
  key: string,
  initialValue: any
) {
  const [value, setValue] = useState(initialValue)
  const dbRef = useRef<IDBDatabase | null>(null)
  useEffect(() => {
    if (dbRef.current) {
      const transaction = dbRef.current.transaction(tableName, "readonly")
      const store = transaction.objectStore(tableName)
      const getRequest = store.get(key)

      getRequest.onsuccess = function () {
        if (getRequest.result !== undefined) {
          setValue(getRequest.result)
        }
      }
    } else {
      const openRequest = indexedDB.open(DATABASE_NAME, 1)
      openRequest.onupgradeneeded = function () {
        let db = openRequest.result
        if (!db.objectStoreNames.contains(tableName)) {
          db.createObjectStore(tableName)
        }
      }

      openRequest.onsuccess = function () {
        dbRef.current = openRequest.result
        const transaction = dbRef.current.transaction(tableName, "readonly")
        const store = transaction.objectStore(tableName)
        const getRequest = store.get(key)

        getRequest.onsuccess = function () {
          if (getRequest.result !== undefined) {
            setValue(getRequest.result)
          }
        }
      }
    }
  }, [key, tableName])

  const setIndexedDBValue = useCallback(
    (newValue: any) => {
      if (dbRef.current) {
        const transaction = dbRef.current.transaction(tableName, "readwrite")
        const store = transaction.objectStore(tableName)
        store.put(newValue, key)
        setValue(newValue)
      }
    },
    [key, tableName]
  )

  return [value, setIndexedDBValue]
}
