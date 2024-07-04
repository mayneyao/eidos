import { create } from "zustand"

interface ViewLoadingState {
  loadingStates: Map<string, boolean>
  setLoading: (qs: string, isLoading: boolean) => void
  resetLoading: () => void
  getLoading: (qs: string) => boolean
}

export const useViewLoadingStore = create<ViewLoadingState>((set, get) => ({
  loadingStates: new Map<string, boolean>(),
  setLoading: (qs, isLoading) =>
    set((state) => {
      const newLoadingStates = new Map(state.loadingStates)
      newLoadingStates.set(qs, isLoading)
      return { loadingStates: newLoadingStates }
    }),
  resetLoading: () =>
    set(() => ({ loadingStates: new Map<string, boolean>() })),
  getLoading: (qs: string) => get().loadingStates.get(qs) || false,
}))
