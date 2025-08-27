import type { StateStorage } from "zustand/middleware"

import { indexedDBStorage } from "../storage/indexeddb"

interface BackendSyncStorageOptions<T> {
    // The key used for backend configuration
    backendConfigKey: string
    // A function to extract the relevant part of the state to be sent to the backend
    getBackendState: (state: T) => any
    // The default state to use when removing the item from the backend
    defaultBackendState: any
}

/**
 * Creates a custom zustand storage object that syncs with both a primary storage (IndexedDB) and a backend config.
 * @param options - Configuration for backend synchronization.
 * @returns A zustand StateStorage object.
 */
export function createBackendSyncStorage<T>(
    options: BackendSyncStorageOptions<T>
): StateStorage {
    const { backendConfigKey: backendConfigKeyRaw, getBackendState, defaultBackendState } = options
    const backendConfigKey = backendConfigKeyRaw

    return {
        getItem: async (name: string): Promise<string | null> => {
            // Get from IndexedDB as the primary source on load
            return indexedDBStorage.getItem(name)
        },
        setItem: async (name: string, value: string): Promise<void> => {
            // Set in IndexedDB
            await indexedDBStorage.setItem(name, value)
            // Also set in backend config
            try {
                // 'value' is a JSON string representing the state { state: ..., version: ... }
                const parsedState = JSON.parse(value)
                // Assuming window.eidos.config.set expects the actual config object
                if ((window as any).eidos?.config?.set && parsedState.state) {
                    const backendState = getBackendState(parsedState.state as T)
                    if (backendState) {
                        await (window as any).eidos.config.set(backendConfigKey, backendState)
                    }
                }
            } catch (error) {
                console.error("Failed to parse state or set backend config:", error)
            }
        },
        removeItem: async (name: string): Promise<void> => {
            // Remove from IndexedDB
            await indexedDBStorage.removeItem(name)
            // Also remove/reset in backend config
            try {
                if ((window as any).eidos?.config?.set) {
                    await (window as any).eidos.config.set(backendConfigKey, defaultBackendState)
                }
            } catch (error) {
                console.error("Failed to remove/reset backend config:", error)
            }
        },
    }
} 