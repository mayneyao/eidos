import { create } from "zustand"

interface KVState {
  cache: Record<string, any>
  setCache: (key: string, value: any) => void
}

export const useKVStore = create<KVState>((set, get) => ({
  cache: {},
  setCache: (key, value) => {
    const currentValue = get().cache[key]
    // Skip update if value is the same (prevents infinite loops)
    if (currentValue === value) return
    if (JSON.stringify(currentValue) === JSON.stringify(value)) return
    
    set((state) => ({ cache: { ...state.cache, [key]: value } }))
  },
}))
