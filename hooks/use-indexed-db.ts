import { useCallback, useEffect, useRef, useState } from "react"

import { DATABASE_NAME } from "@/lib/storage/indexeddb"

export function useIndexedDB<T = any>(
  tableName: string,
  key: string,
  initialValue: T
): [T, (newValue: T) => void] {
  const [value, setValue] = useState<T>(initialValue)
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
    (newValue: T) => {
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
