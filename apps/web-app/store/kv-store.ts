import { create } from "zustand"

interface KVState {
  cache: Record<string, any>
  setCache: (key: string, value: any) => void
}

export const useKVStore = create<KVState>((set) => ({
  cache: {},
  setCache: (key, value) =>
    set((state) => ({ cache: { ...state.cache, [key]: value } })),
}))
