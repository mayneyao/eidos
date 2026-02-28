import type { StateStorage } from "zustand/middleware"

import { indexedDBStorage } from "../storage/indexeddb"

interface BackendSyncStorageOptions<T> {
  // The key used for backend configuration
  backendConfigKey: string
  // A function to extract the relevant part of the state to be sent to the backend
  getBackendState: (state: T) => any
  // The default state to use when removing the item from the backend
  defaultBackendState: any
  // A function to build the full state from backend state (used when syncing from backend)
  buildStateFromBackend?: (backendState: any, currentState: T) => T
  // A function to get the default full state when no local state exists (optional)
  getDefaultState?: () => T
}

/**
 * Creates a custom zustand storage object that syncs with both a primary storage (IndexedDB) and a backend config.
 * Uses version-based synchronization to ensure multiple spaces stay in sync with the backend.
 * @param options - Configuration for backend synchronization.
 * @returns A zustand StateStorage object.
 */
export function createBackendSyncStorage<T>(
  options: BackendSyncStorageOptions<T>
): StateStorage {
  const {
    backendConfigKey: backendConfigKeyRaw,
    getBackendState,
    defaultBackendState,
    buildStateFromBackend,
    getDefaultState,
  } = options
  const backendConfigKey = backendConfigKeyRaw

  return {
    getItem: async (name: string): Promise<string | null> => {
      try {
        // Get from IndexedDB first
        const localData = await indexedDBStorage.getItem(name)
        let localState: any = null
        let localVersion = -1

        if (localData) {
          try {
            const parsed = JSON.parse(localData)
            localState = parsed.state
            localVersion = parsed.state?.version ?? -1
          } catch (e) {
            console.error("Failed to parse local state:", e)
          }
        }

        // Get from backend config
        let backendState: any = null
        let backendVersion = -1

        if ((window as any).eidos?.config?.get) {
          try {
            backendState = await (window as any).eidos.config.get(
              backendConfigKey
            )
            if (backendState) {
              backendVersion = backendState.version ?? -1
            }
          } catch (error) {
            console.error("Failed to get backend config:", error)
          }
        }

        // Compare versions and use the newer one
        // Priority: backend >= local version (for initial sync when both are 0)
        // Only use local if it's strictly newer than backend
        if (backendVersion >= localVersion && backendState) {
          // Backend has newer or equal version, prefer backend state
          // This ensures initial sync works even when both versions are 0
          // Also handles the case where backend is the source of truth for shared config
          let mergedState: T
          if (buildStateFromBackend && localState) {
            // Use custom merge function if provided (has local state)
            mergedState = buildStateFromBackend(backendState, localState)
          } else if (buildStateFromBackend && !localState) {
            // No local state, use default state for merge
            const defaultState = getDefaultState ? getDefaultState() : ({} as T)
            mergedState = buildStateFromBackend(backendState, defaultState)
          } else {
            // Default: merge backend state with local state, preferring backend
            mergedState = {
              ...(localState || defaultBackendState),
              ...backendState,
            } as T
          }

          // Return in zustand persist format
          return JSON.stringify({
            state: mergedState,
            version: backendVersion,
          })
        } else if (localData && localVersion > backendVersion) {
          // Local version is strictly newer, use local
          return localData
        } else if (backendState) {
          // Fallback: use backend if available (e.g., backend version is valid but local isn't)
          let mergedState: T
          if (buildStateFromBackend) {
            // Get default state for merge
            const defaultState = getDefaultState ? getDefaultState() : ({} as T)
            mergedState = buildStateFromBackend(backendState, defaultState)
          } else {
            mergedState = {
              ...defaultBackendState,
              ...backendState,
            } as T
          }
          return JSON.stringify({
            state: mergedState,
            version: backendVersion,
          })
        }

        // No data available
        return null
      } catch (error) {
        console.error("Failed to sync config from backend:", error)
        // Fallback to local storage only
        return indexedDBStorage.getItem(name)
      }
    },
    setItem: async (name: string, value: string): Promise<void> => {
      try {
        // Parse the zustand persist format
        const parsedState = JSON.parse(value)
        if (!parsedState.state) {
          console.error("Invalid state format:", parsedState)
          return
        }

        // Check backend version before saving to avoid overwriting newer backend data
        let backendVersion = -1
        if ((window as any).eidos?.config?.get) {
          try {
            const backendState = await (window as any).eidos.config.get(
              backendConfigKey
            )
            if (backendState) {
              backendVersion = backendState.version ?? -1
            }
          } catch (error) {
            // Ignore errors when checking backend version
            console.warn("Failed to check backend version before save:", error)
          }
        }

        const currentVersion = parsedState.state.version ?? 0

        // If backend has a newer version, we should merge or warn (but still save local changes)
        // For now, we'll proceed with saving and incrementing version
        // The next getItem will sync if backend is newer
        const newVersion = Math.max(currentVersion, backendVersion) + 1

        const updatedState = {
          ...parsedState.state,
          version: newVersion,
        }

        // Save to IndexedDB with updated version
        const updatedValue = JSON.stringify({
          state: updatedState,
          version: parsedState.version ?? 0,
        })
        await indexedDBStorage.setItem(name, updatedValue)

        // Sync to backend config
        if ((window as any).eidos?.config?.set) {
          const backendStateToSave = getBackendState(updatedState as T)
          if (backendStateToSave) {
            await (window as any).eidos.config.set(
              backendConfigKey,
              backendStateToSave
            )
          }
        }
      } catch (error) {
        console.error("Failed to parse state or set backend config:", error)
        // Still try to save to IndexedDB even if backend sync fails
        try {
          await indexedDBStorage.setItem(name, value)
        } catch (e) {
          console.error("Failed to save to IndexedDB:", e)
        }
      }
    },
    removeItem: async (name: string): Promise<void> => {
      // Remove from IndexedDB
      await indexedDBStorage.removeItem(name)
      // Also remove/reset in backend config
      try {
        if ((window as any).eidos?.config?.set) {
          await (window as any).eidos.config.set(
            backendConfigKey,
            defaultBackendState
          )
        }
      } catch (error) {
        console.error("Failed to remove/reset backend config:", error)
      }
    },
  }
}
