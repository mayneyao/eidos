import { createContext, useContext, type ReactNode } from "react"
import type { DataSpace, Eidos } from "@eidos.space/core"
import { create } from "zustand"

/**
 * Zustand store for Eidos instance in built-in environment
 * Follows the same pattern as useSqliteStore with sqliteProxy
 */
interface EidosState {
  eidos: Eidos | null
  setEidos: (eidos: Eidos) => void
  isInitialized: boolean
  setInitialized: (initialized: boolean) => void
}

export const useEidosStore = create<EidosState>()((set) => ({
  eidos: null,
  setEidos: (eidos) => set({ eidos }),
  isInitialized: false,
  setInitialized: (initialized) => set({ isInitialized: initialized }),
}))

/**
 * Create an Eidos instance from a DataSpace (worker proxy)
 *
 * This wraps the DataSpace proxy to provide the full Eidos interface
 * with currentSpace, space, script, AI, and utils methods.
 *
 * @param dataSpace - The DataSpace worker proxy (accepts any to avoid type mismatch between source/dist)
 * @returns Eidos interface
 */
export function createEidos(dataSpace: any): Eidos {
  return {
    currentSpace: dataSpace as DataSpace,

    // space is a simplified accessor for currentSpace
    space: dataSpace as DataSpace,

    script: {
      async call(scriptId: string, ...args: any[]): Promise<any> {
        // Call script via DataSpace's extension API
        return (dataSpace as any).extension?.callScript?.(scriptId, ...args)
      },
    },

    AI: {
      async generateText(options: {
        model?: string
        prompt: string
        [key: string]: any
      }): Promise<string> {
        // AI methods would be implemented via RPC to the worker
        // For now, throw error as this needs main thread AI implementation
        throw new Error(
          "AI.generateText is not available in built-in environment. Use main thread AI services."
        )
      },
      async generateObject(options: {
        model?: string
        prompt: string
        schema: Record<string, any>
        [key: string]: any
      }): Promise<Record<string, any>> {
        throw new Error(
          "AI.generateObject is not available in built-in environment. Use main thread AI services."
        )
      },
    },

    utils: {
      async fetchBlob(url: string, options: RequestInit): Promise<Blob> {
        const response = await fetch(url, options)
        return response.blob()
      },
      tableHighlightRow(
        tableId: string,
        rowId: string,
        fieldId?: string
      ): void {
        // This would emit an event to highlight a row in the UI
        // Implementation depends on the table view component
        console.log("tableHighlightRow:", { tableId, rowId, fieldId })
      },
    },
  }
}

/**
 * Hook to access the Eidos SDK instance
 *
 * Priority order:
 * 1. Zustand store (for built-in environment with worker proxy)
 * 2. Global window.eidos (for extension sandbox environment)
 *
 * @example
 * ```tsx
 * import { useEidos } from '@eidos.space/react'
 *
 * function MyExtension() {
 *   const eidos = useEidos()
 *
 *   useEffect(() => {
 *     eidos.currentSpace.table('myTable').findMany()
 *   }, [eidos])
 * }
 * ```
 */
export function useEidos(): Eidos {
  // 1. Try zustand store first (built-in environment with worker proxy)
  const storeEidos = useEidosStore((state) => state.eidos)
  if (storeEidos) {
    return storeEidos
  }

  // 2. Fallback to global eidos for extension sandbox environment
  if (typeof window !== "undefined" && (window as any).eidos) {
    return (window as any).eidos as Eidos
  }

  throw new Error(
    "useEidos: Eidos instance not found. In built-in environment, use useEidosStore().setEidos(createEidos(dataSpace)). In extensions, window.eidos should be available."
  )
}
