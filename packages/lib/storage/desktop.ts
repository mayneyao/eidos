import type { StateStorage } from "zustand/middleware"

interface DesktopStorageOptions<T> {
  backendConfigKey: string
  getBackendState: (state: T) => any
  defaultBackendState: any
  buildStateFromBackend?: (backendState: any, currentState: T) => T
  getDefaultState?: () => T
}

/**
 * Creates a Zustand storage adapter that reads/writes exclusively through
 * the desktop backend (`window.eidos.config`). No IndexedDB, no version sync.
 */
export function createDesktopStorage<T>(
  options: DesktopStorageOptions<T>
): StateStorage {
  const {
    backendConfigKey,
    getBackendState,
    defaultBackendState,
    buildStateFromBackend,
    getDefaultState,
  } = options

  return {
    getItem: async (name: string): Promise<string | null> => {
      const backendState = await (window as any).eidos?.config?.get(
        backendConfigKey
      )
      if (!backendState) return null

      let mergedState: T
      if (buildStateFromBackend) {
        const defaultState = getDefaultState ? getDefaultState() : ({} as T)
        mergedState = buildStateFromBackend(backendState, defaultState)
      } else {
        mergedState = { ...defaultBackendState, ...backendState } as T
      }

      return JSON.stringify({ state: mergedState, version: 0 })
    },

    setItem: async (_name: string, value: string): Promise<void> => {
      const parsed = JSON.parse(value)
      if (!parsed.state) return

      const backendStateToSave = getBackendState(parsed.state as T)
      await (window as any).eidos?.config?.set(
        backendConfigKey,
        backendStateToSave
      )
    },

    removeItem: async (_name: string): Promise<void> => {
      await (window as any).eidos?.config?.set(
        backendConfigKey,
        defaultBackendState
      )
    },
  }
}
