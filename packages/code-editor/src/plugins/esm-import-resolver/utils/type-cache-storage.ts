import type { TypeDefinition } from "../interfaces/plugin"
import type { TypeDefinitionMetadata } from "../interfaces"

const DB_NAME = "esm-import-resolver-cache"
const DB_VERSION = 1
const STORE_NAME = "type-definitions"

export interface StoredTypeDefinition {
  packageUrl: string
  definition: TypeDefinition
  metadata: TypeDefinitionMetadata
}

/**
 * IndexedDB wrapper for type definition storage
 */
export class TypeCacheStorage {
  private dbPromise: Promise<IDBDatabase | null> | null = null

  constructor() {
    this.initDB()
  }

  private initDB(): void {
    if (typeof indexedDB === "undefined") {
      console.warn("IndexedDB not available, persistent caching disabled")
      this.dbPromise = Promise.resolve(null)
      return
    }

    this.dbPromise = new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = (event) => {
        console.error(
          "Failed to open IndexedDB:",
          (event.target as IDBOpenDBRequest).error
        )
        resolve(null)
      }

      request.onsuccess = (event) => {
        resolve((event.target as IDBOpenDBRequest).result)
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          // Use packageUrl as the key path
          db.createObjectStore(STORE_NAME, { keyPath: "packageUrl" })
        }
      }
    })
  }

  /**
   * Get a stored type definition from the cache
   */
  async get(packageUrl: string): Promise<StoredTypeDefinition | undefined> {
    const db = await this.dbPromise
    if (!db) return undefined

    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readonly")
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(packageUrl)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(undefined)
    })
  }

  /**
   * Save a type definition to the cache
   */
  async set(stored: StoredTypeDefinition): Promise<void> {
    const db = await this.dbPromise
    if (!db) return

    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readwrite")
      const store = transaction.objectStore(STORE_NAME)
      store.put(stored)

      transaction.oncomplete = () => resolve()
      transaction.onerror = (e) => {
        console.error(
          "Failed to save to cache:",
          (e.target as IDBRequest).error
        )
        resolve()
      }
    })
  }

  /**
   * Clear all cached items
   */
  async clear(): Promise<void> {
    const db = await this.dbPromise
    if (!db) return

    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readwrite")
      const store = transaction.objectStore(STORE_NAME)
      store.clear()

      transaction.oncomplete = () => resolve()
    })
  }

  /**
   * Delete specific item
   */
  async delete(packageUrl: string): Promise<void> {
    const db = await this.dbPromise
    if (!db) return

    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readwrite")
      const store = transaction.objectStore(STORE_NAME)
      store.delete(packageUrl)

      transaction.oncomplete = () => resolve()
    })
  }
}

// Singleton instance
export const typeCacheStorage = new TypeCacheStorage()
